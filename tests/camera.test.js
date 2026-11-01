import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  clamp,
  easeToward,
  easeTowardLog,
  easeAngleToward,
  easeInOutCubic,
  tidalLockOrientation,
  orbitCameraPosition,
  pixelRadiusOnScreen,
  worldRadiusForPixelSize,
  projectToScreenSpace,
  isOnScreen,
  isOnNearSide,
  sunPointerPlacement,
} from "../src/camera.js";

describe("clamp", () => {
  it("passes a value inside the range through unchanged", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps a value below the minimum up to it", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("clamps a value above the maximum down to it", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("easeToward", () => {
  it("doesn't move at all when dt is zero", () => {
    expect(easeToward(0, 10, 0, 1)).toBe(0);
  });

  it("matches a known value partway through the ease", () => {
    expect(easeToward(0, 10, 1, 1)).toBeCloseTo(6.321205588285577, 9);
  });

  // The case above starts at current = 0, which hides any bug that swaps
  // (goal - current) for (goal + current) -- both give the same delta when
  // current is 0. It also uses dt = rate = 1, which hides dt*rate becoming
  // dt/rate. A nonzero current with dt != rate catches both.
  it("matches a known value with a nonzero current and dt != rate", () => {
    expect(easeToward(5, 10, 2, 3)).toBeCloseTo(9.98760623911667, 9);
  });

  it("reaches the goal in the limit of a very large dt", () => {
    expect(easeToward(0, 10, 1000, 1)).toBeCloseTo(10, 9);
  });
});

describe("easeTowardLog", () => {
  it("doesn't move at all when dt is zero", () => {
    expect(easeTowardLog(2, 2000, 0, 1)).toBe(2);
  });

  it("matches a known value partway through the ease", () => {
    expect(easeTowardLog(1, 100, 1, 1)).toBeCloseTo(18.37558261375752, 9);
  });

  it("reaches the goal in the limit of a very large dt", () => {
    expect(easeTowardLog(1, 100, 1000, 1)).toBeCloseTo(100, 6);
  });
});

describe("easeAngleToward", () => {
  it("matches a known value, taking the short way across the +/-pi wraparound", () => {
    // current is just under +pi, goal is just under -pi: the short way around is
    // ~0.28 radians forward through the wraparound, not ~6.0 radians backward.
    expect(easeAngleToward(3.0, -3.0, 1, 1)).toBeCloseTo(-3.1041780525531895, 9);
  });

  it("matches a known value for a small move with no wraparound involved", () => {
    expect(easeAngleToward(0, 0.1, 1, 2)).toBeCloseTo(0.08646647167633859, 9);
  });

  it("stays put when dt is zero", () => {
    expect(easeAngleToward(1.5, -2.9, 0, 1)).toBeCloseTo(1.5, 9);
  });

  // The actual regression test for the camera-panning bug: sweeping the goal angle
  // all the way around the circle should never make a single ease step jump by more
  // than a small fraction of the full circle, however the goal is expressed (e.g.
  // approaching from just inside vs. just outside +/-pi).
  it("never takes a step larger than the short way around, for any goal", () => {
    const current = 0;
    for (let degrees = -179; degrees <= 180; degrees += 1) {
      const goal = (degrees * Math.PI) / 180;
      const result = easeAngleToward(current, goal, 0.016, 5);
      const stepSize = Math.abs(result - current);
      expect(stepSize).toBeLessThan(Math.PI);
    }
  });
});

describe("easeInOutCubic", () => {
  it("starts at 0 and ends at 1", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it("passes through the midpoint", () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 9);
  });

  it("matches known values on either side of the midpoint", () => {
    expect(easeInOutCubic(0.25)).toBeCloseTo(0.0625, 9);
    expect(easeInOutCubic(0.75)).toBeCloseTo(0.9375, 9);
  });
});

describe("tidalLockOrientation", () => {
  it("maps local +x to the given direction", () => {
    const direction = new THREE.Vector3(0, 0, 1);
    const quaternion = tidalLockOrientation(direction);
    const rotatedX = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    expect(rotatedX.x).toBeCloseTo(0, 9);
    expect(rotatedX.y).toBeCloseTo(0, 9);
    expect(rotatedX.z).toBeCloseTo(1, 9);
  });

  it("maps local +x to a non-axis-aligned direction too", () => {
    const direction = new THREE.Vector3(1, 0, 1).normalize();
    const quaternion = tidalLockOrientation(direction);
    const rotatedX = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    expect(rotatedX.x).toBeCloseTo(direction.x, 9);
    expect(rotatedX.y).toBeCloseTo(direction.y, 9);
    expect(rotatedX.z).toBeCloseTo(direction.z, 9);
  });

  // The actual regression test for the Moon-flip bug: THREE.Quaternion's own
  // setFromUnitVectors has a special-case branch exactly where the target vector
  // passes near (-1, 0, 0) -- a configuration the real Moon's direction sweeps
  // through once per orbit -- which used to produce a visible discontinuous "twist"
  // right at that crossing. Sweeping a full circle through that exact point and
  // checking every step is no bigger than the sweep's own step size proves there's
  // no hidden jump anywhere on the circle, including at the old singularity.
  it("changes smoothly all the way around a circle that passes through the old singularity", () => {
    const steps = 720;
    const stepAngle = (2 * Math.PI) / steps;
    let previousQuaternion = null;
    let maxStepAngle = 0;

    for (let i = 0; i <= steps; i++) {
      const angle = i * stepAngle;
      // Sweeps through (-1, 0, 0) at i = steps / 2, where the old implementation broke.
      const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const quaternion = tidalLockOrientation(direction);
      if (previousQuaternion) {
        maxStepAngle = Math.max(maxStepAngle, previousQuaternion.angleTo(quaternion));
      }
      previousQuaternion = quaternion;
    }

    // A generous multiple of the sweep's own per-step angle: a real discontinuity
    // would jump by a large fraction of a full turn, not a small multiple of this.
    expect(maxStepAngle).toBeLessThan(stepAngle * 2);
  });
});

describe("orbitCameraPosition", () => {
  it("sits straight ahead of the anchor (+z) at yaw 0, pitch 0", () => {
    const anchorPosition = new THREE.Vector3(1, 2, 3);
    const position = orbitCameraPosition({ anchorPosition, cameraDistance: 10, yaw: 0, pitch: 0 });
    expect(position.x).toBeCloseTo(1, 9);
    expect(position.y).toBeCloseTo(2, 9);
    expect(position.z).toBeCloseTo(13, 9);
  });

  it("sits to the +x side of the anchor at yaw pi/2, pitch 0", () => {
    const anchorPosition = new THREE.Vector3(0, 0, 0);
    const position = orbitCameraPosition({
      anchorPosition,
      cameraDistance: 10,
      yaw: Math.PI / 2,
      pitch: 0,
    });
    expect(position.x).toBeCloseTo(10, 9);
    expect(position.y).toBeCloseTo(0, 9);
    expect(position.z).toBeCloseTo(0, 9);
  });

  it("sits directly above the anchor at pitch pi/2, regardless of yaw", () => {
    const anchorPosition = new THREE.Vector3(0, 0, 0);
    const position = orbitCameraPosition({
      anchorPosition,
      cameraDistance: 10,
      yaw: 1.23,
      pitch: Math.PI / 2,
    });
    expect(position.x).toBeCloseTo(0, 9);
    expect(position.y).toBeCloseTo(10, 9);
    expect(position.z).toBeCloseTo(0, 9);
  });
});

describe("pixelRadiusOnScreen", () => {
  it("matches a known value", () => {
    expect(pixelRadiusOnScreen(1, 10, 0.36, 800)).toBeCloseTo(111.11111111111111, 9);
  });

  it("shrinks as distance grows", () => {
    const near = pixelRadiusOnScreen(1, 10, 0.36, 800);
    const far = pixelRadiusOnScreen(1, 100, 0.36, 800);
    expect(far).toBeLessThan(near);
  });
});

describe("worldRadiusForPixelSize", () => {
  it("matches a known value", () => {
    expect(worldRadiusForPixelSize(4, 10, 0.36, 800)).toBeCloseTo(0.036, 9);
  });

  it("round-trips through pixelRadiusOnScreen back to the target pixel size", () => {
    const worldRadius = worldRadiusForPixelSize(4, 10, 0.36, 800);
    expect(pixelRadiusOnScreen(worldRadius, 10, 0.36, 800)).toBeCloseTo(4, 9);
  });
});

describe("projectToScreenSpace", () => {
  function cameraLookingDownNegativeZ() {
    const camera = new THREE.PerspectiveCamera(40, 800 / 600, 0.1, 1000);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    return camera;
  }

  it("centers a point straight ahead of the camera", () => {
    const camera = cameraLookingDownNegativeZ();
    const result = projectToScreenSpace(camera, new THREE.Vector3(0, 0, 0));
    expect(result.ndcX).toBeCloseTo(0, 9);
    expect(result.ndcY).toBeCloseTo(0, 9);
    expect(result.cameraSpaceZ).toBeCloseTo(-5, 9);
  });

  it("offsets a point to one side of the camera's view", () => {
    const camera = cameraLookingDownNegativeZ();
    const result = projectToScreenSpace(camera, new THREE.Vector3(1, 0, 0));
    expect(result.ndcX).toBeCloseTo(0.41212161291819344, 9);
    expect(result.ndcY).toBeCloseTo(0, 9);
    expect(result.cameraSpaceX).toBeCloseTo(1, 9);
  });

  it("gives a positive camera-space z for a point behind the camera", () => {
    const camera = cameraLookingDownNegativeZ();
    const result = projectToScreenSpace(camera, new THREE.Vector3(0, 0, 10));
    expect(result.cameraSpaceZ).toBeCloseTo(5, 9);
  });
});

describe("isOnScreen", () => {
  it("is true within the margin", () => {
    expect(isOnScreen(0.5, -0.5, 1.02)).toBe(true);
  });

  it("is false just outside the margin on either axis", () => {
    expect(isOnScreen(1.03, 0, 1.02)).toBe(false);
    expect(isOnScreen(0, -1.03, 1.02)).toBe(false);
  });

  it("flips exactly at the margin boundary on the x axis", () => {
    expect(isOnScreen(1.019, 0, 1.02)).toBe(true);
    expect(isOnScreen(1.02, 0, 1.02)).toBe(false);
  });

  it("flips exactly at the margin boundary on the y axis too", () => {
    expect(isOnScreen(0, 1.019, 1.02)).toBe(true);
    expect(isOnScreen(0, 1.02, 1.02)).toBe(false);
  });
});

describe("isOnNearSide", () => {
  it("is true for a point facing the camera", () => {
    const point = new THREE.Vector3(1, 0, 0);
    const center = new THREE.Vector3(0, 0, 0);
    const cameraPos = new THREE.Vector3(5, 0, 0);
    expect(isOnNearSide(point, center, cameraPos)).toBe(true);
  });

  it("is false for a point on the far side", () => {
    const point = new THREE.Vector3(-1, 0, 0);
    const center = new THREE.Vector3(0, 0, 0);
    const cameraPos = new THREE.Vector3(5, 0, 0);
    expect(isOnNearSide(point, center, cameraPos)).toBe(false);
  });

  it("is false right at the grazing edge, inside the default threshold", () => {
    const point = new THREE.Vector3(0, 1, 0);
    const center = new THREE.Vector3(0, 0, 0);
    const cameraPos = new THREE.Vector3(5, 0, 0);
    expect(isOnNearSide(point, center, cameraPos)).toBe(false);
  });

  it("is false exactly at the threshold, not just below it", () => {
    // Point and camera placed so the outward normal and the toward-camera
    // direction are exactly perpendicular (dot = 0); passing thresholdDot = 0
    // makes that the exact boundary rather than comfortably past it.
    const point = new THREE.Vector3(1, 0, 0);
    const center = new THREE.Vector3(0, 0, 0);
    const cameraPos = new THREE.Vector3(1, 5, 0);
    expect(isOnNearSide(point, center, cameraPos, 0)).toBe(false);
  });
});

describe("sunPointerPlacement", () => {
  it("hides the pointer once the body is already visible on screen", () => {
    const placement = sunPointerPlacement({
      cameraSpaceX: 0.1,
      cameraSpaceY: 0.1,
      cameraSpaceZ: -1,
      ndcX: 0.1,
      ndcY: 0.1,
      viewportWidth: 800,
      viewportHeight: 600,
    });
    expect(placement.show).toBe(false);
  });

  it("matches a known placement for a body off to one side", () => {
    const placement = sunPointerPlacement({
      cameraSpaceX: 1,
      cameraSpaceY: 0,
      cameraSpaceZ: -1,
      ndcX: 2,
      ndcY: 0,
      viewportWidth: 800,
      viewportHeight: 600,
    });
    expect(placement.show).toBe(true);
    expect(placement.screenX).toBeCloseTo(754, 9);
    expect(placement.screenY).toBeCloseTo(300, 9);
    expect(placement.rotationDeg).toBeCloseTo(0, 9);
  });

  // The off-to-one-side case above has unitY = 0, which hides every term in the
  // formula that only involves the y-axis (the reach's y-constraint, screenY's
  // sign, rotationDeg's -unitY). A diagonal direction exercises those too.
  it("matches a known placement for a body off-screen diagonally", () => {
    const placement = sunPointerPlacement({
      cameraSpaceX: 1,
      cameraSpaceY: 1,
      cameraSpaceZ: -1,
      ndcX: 2,
      ndcY: 2,
      viewportWidth: 800,
      viewportHeight: 600,
    });
    expect(placement.show).toBe(true);
    expect(placement.screenX).toBeCloseTo(670, 9);
    expect(placement.screenY).toBeCloseTo(30, 9);
    expect(placement.rotationDeg).toBeCloseTo(-45, 9);
  });

  it("still shows the pointer for a body exactly at the camera's own plane (z = 0)", () => {
    // z = 0 is the boundary between "in front" and "behind" -- this body isn't
    // strictly in front, so it should still get a pointer, not be treated as
    // already visible just because it also happens to project within the margin.
    const placement = sunPointerPlacement({
      cameraSpaceX: 0.1,
      cameraSpaceY: 0,
      cameraSpaceZ: 0,
      ndcX: 0,
      ndcY: 0,
      viewportWidth: 800,
      viewportHeight: 600,
    });
    expect(placement.show).toBe(true);
  });

  it("still shows the pointer for a body directly behind the camera", () => {
    const placement = sunPointerPlacement({
      cameraSpaceX: 0.1,
      cameraSpaceY: 0,
      cameraSpaceZ: 1,
      ndcX: 0.1,
      ndcY: 0,
      viewportWidth: 800,
      viewportHeight: 600,
    });
    expect(placement.show).toBe(true);
  });

  it("doesn't divide by zero for a body dead center behind the camera", () => {
    const placement = sunPointerPlacement({
      cameraSpaceX: 0,
      cameraSpaceY: 0,
      cameraSpaceZ: 1,
      ndcX: 0,
      ndcY: 0,
      viewportWidth: 800,
      viewportHeight: 600,
    });
    expect(placement.show).toBe(true);
    expect(Number.isFinite(placement.screenX)).toBe(true);
    expect(Number.isFinite(placement.screenY)).toBe(true);
  });
});
