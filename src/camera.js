// Pure camera/orientation/projection math, factored out of scene.js so it can be
// unit tested directly instead of only through a rendered scene -- the same split
// astronomy.js and ui.js already draw between pure logic and DOM/Three.js wiring.
// three's math classes (Vector3, Quaternion, Matrix4, PerspectiveCamera.project())
// run fine without a renderer or a DOM, so nothing here needs either.

import * as THREE from "three";

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Exponential ease: moves `current` a `rate`-controlled fraction of the way to
// `goal` each `dt`, so a sudden change in `goal` settles smoothly instead of
// snapping.
export function easeToward(current, goal, dt, rate) {
  return current + (goal - current) * (1 - Math.exp(-dt * rate));
}

// The same ease, applied in log space -- for values like camera distance, where a
// proportional (not linear) approach reads as constant-speed zooming regardless of
// how far out the camera already is.
export function easeTowardLog(current, goal, dt, rate) {
  return Math.exp(easeToward(Math.log(current), Math.log(goal), dt, rate));
}

function wrapToSignedPi(angleRadians) {
  const twoPi = 2 * Math.PI;
  return ((((angleRadians + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

// The same ease, for angles: takes the shorter way around the circle rather than
// easing along the raw numeric difference, which would spin the long way around
// whenever `goal` and `current` fall on opposite sides of the +/-pi wraparound.
export function easeAngleToward(current, goal, dt, rate) {
  const shortestDelta = wrapToSignedPi(goal - current);
  return wrapToSignedPi(current + shortestDelta * (1 - Math.exp(-dt * rate)));
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Scene axes: y is the north ecliptic pole (see astronomy.js's coordinate-frame
// comment). Used only as a roll reference below, never as a gaze target.
const ECLIPTIC_NORTH = new THREE.Vector3(0, 1, 0);

// A tidally-locked body's orientation: its near side (local +x) always points
// toward `directionToParent`, with "up" resolved against ecliptic north for a
// stable, non-spinning roll. Built as a full orthonormal basis rather than a single
// setFromUnitVectors(X_AXIS, directionToParent) call -- that formula has a
// special-case branch when the two vectors are nearly antiparallel, which this
// body's direction passes through once per orbit, producing a visible discontinuous
// "twist" right at that crossing. This basis only hits its own singularity if
// `directionToParent` ever aligns with ecliptic north, which a body orbiting near
// the ecliptic plane never does.
export function tidalLockOrientation(directionToParent) {
  const nearSideAxis = directionToParent.clone().normalize();
  const rightAxis = new THREE.Vector3().crossVectors(nearSideAxis, ECLIPTIC_NORTH).normalize();
  const upAxis = new THREE.Vector3().crossVectors(rightAxis, nearSideAxis);
  const basis = new THREE.Matrix4().makeBasis(nearSideAxis, upAxis, rightAxis);
  return new THREE.Quaternion().setFromRotationMatrix(basis);
}

// Where an orbiting camera sits: `cameraDistance` out from `anchorPosition`, at the
// given yaw (around the vertical axis) and pitch (above/below the horizontal).
export function orbitCameraPosition({ anchorPosition, cameraDistance, yaw, pitch }) {
  return new THREE.Vector3(
    anchorPosition.x + cameraDistance * Math.cos(pitch) * Math.sin(yaw),
    anchorPosition.y + cameraDistance * Math.sin(pitch),
    anchorPosition.z + cameraDistance * Math.cos(pitch) * Math.cos(yaw),
  );
}

// How many pixels tall a body of `bodyRadius` reads on screen at `distanceToCamera`.
export function pixelRadiusOnScreen(bodyRadius, distanceToCamera, fovTan, viewportHeight) {
  return (bodyRadius / (distanceToCamera * fovTan)) * (viewportHeight / 2);
}

// The inverse of pixelRadiusOnScreen: the world-space radius a marker needs, at
// distanceToCamera, to read as exactly `targetPixels` tall on screen regardless of
// distance (used to keep a small marker like Boston's dot a constant visible size).
export function worldRadiusForPixelSize(targetPixels, distanceToCamera, fovTan, viewportHeight) {
  return (targetPixels * distanceToCamera * fovTan) / (viewportHeight / 2);
}

// `worldPos` in both normalized device coordinates (-1..1, for on-screen testing and
// screen-space placement) and camera space (for front/behind-camera testing and
// direction-from-center math).
export function projectToScreenSpace(camera, worldPos) {
  const cameraSpace = worldPos.clone().applyMatrix4(camera.matrixWorldInverse);
  const ndc = worldPos.clone().project(camera);
  return {
    ndcX: ndc.x,
    ndcY: ndc.y,
    cameraSpaceX: cameraSpace.x,
    cameraSpaceY: cameraSpace.y,
    cameraSpaceZ: cameraSpace.z,
  };
}

export function isOnScreen(ndcX, ndcY, margin) {
  return Math.abs(ndcX) < margin && Math.abs(ndcY) < margin;
}

// Whether a point on a body's surface (e.g. a city marker) is on the side currently
// facing the camera, rather than around on the far side of the globe.
export function isOnNearSide(
  pointWorldPos,
  bodyCenterWorldPos,
  cameraWorldPos,
  thresholdDot = 0.05,
) {
  const outwardNormal = pointWorldPos.clone().sub(bodyCenterWorldPos).normalize();
  const towardCamera = cameraWorldPos.clone().sub(pointWorldPos).normalize();
  return outwardNormal.dot(towardCamera) > thresholdDot;
}

function absOrEpsilon(value) {
  return Math.abs(value) || 1e-6;
}

// Where to draw an edge-of-screen arrow pointing toward a body that's off-screen
// (e.g. the Sun), so its direction stays legible even when it's not in view. Returns
// `{ show: false }` once the body is already visible on screen, needing no pointer.
export function sunPointerPlacement({
  cameraSpaceX,
  cameraSpaceY,
  cameraSpaceZ,
  ndcX,
  ndcY,
  viewportWidth,
  viewportHeight,
}) {
  const alreadyVisible = cameraSpaceZ < 0 && isOnScreen(ndcX, ndcY, 0.9);
  if (alreadyVisible) return { show: false };

  const directionLength = Math.hypot(cameraSpaceX, cameraSpaceY) || 1;
  const unitX = cameraSpaceX / directionLength;
  const unitY = cameraSpaceY / directionLength;
  const reach = Math.min(
    (viewportWidth / 2 - 46) / absOrEpsilon(unitX),
    (viewportHeight / 2 - 30) / absOrEpsilon(unitY),
  );

  return {
    show: true,
    screenX: viewportWidth / 2 + unitX * reach,
    screenY: viewportHeight / 2 - unitY * reach,
    rotationDeg: (Math.atan2(-unitY, unitX) * 180) / Math.PI,
  };
}
