// Extracted from src/scene.js. See README.md. Not meant to still import or run
// cleanly -- it assumes module-level names (AU_IN_EARTH_RADII, PLANETS,
// EARTH_ELEMENTS, keplerianPosition, THREE, scene, camera, tmpCameraSpace,
// X_AXIS, stage, fovTan, viewportWidth/Height, etc.) from the scene.js this was
// cut from.

// ---- module-level constants ----

const SUN_RADIUS_TRUE = 109.2;

const VIEW_GOALS = {
  earth: { yaw: -1.0, pitch: 0.4 },
  moon: { yaw: -1.0, pitch: 0.55 },
  sun: { yaw: -1.5708, pitch: 0.3 },
  system: { yaw: 0.0, pitch: 1.15 },
};
const VIEW_TWEEN_DURATION_MS = 1800;

function easeInOut(t) {
  return t * t * (3 - 2 * t);
}

// Interpolates on a log scale, so zooming/scaling feels even at every distance
// (the same visual "speed" whether near or far away).
function lerpLog(a, b, t) {
  return Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);
}

// ---- inside buildBodies(): orbit lines and planet markers, shown only at true scale ----

function buildOrbits() {
  const group = new THREE.Group();
  scene.add(group);
  const centuriesNow = (julianDateFromUnixMs(Date.now()) - 2451545.0) / 36525;

  function addOrbitLine(elements, color, opacity) {
    const points = [];
    for (let step = 0; step <= 360; step++) {
      const eccentricAnomaly = (step / 360) * Math.PI * 2;
      const [x, y, z] = keplerianPosition(elements, centuriesNow, eccentricAnomaly, false);
      points.push(
        new THREE.Vector3(x * AU_IN_EARTH_RADII, z * AU_IN_EARTH_RADII, -y * AU_IN_EARTH_RADII),
      );
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );
    line.frustumCulled = false;
    group.add(line);
  }

  addOrbitLine(EARTH_ELEMENTS, 0x8fb8ff, 0.7);
  for (const planet of PLANETS) {
    addOrbitLine(planet.elements, planet.color, 0.45);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(planet.radiusEarths, 24, 16),
      new THREE.MeshBasicMaterial({ color: planet.color }),
    );
    scene.add(mesh);
    planetMeshes.push(mesh);
    mesh.visible = false;
  }

  group.visible = false;
  return group;
}

// Called from buildBodies(): orbitGroup = buildOrbits();
// `orbitGroup` and `planetMeshes` were declared alongside the other mutable body
// refs: `let earth, clouds, moon, sunMesh, sunGlow, boston, orbitGroup, stars;`
// and `const planetMeshes = [];`

// ---- inside runSimulation(): state ----
//
// let trueScale = false;
// let trueScaleBlend = 0; // 0 = illustrative, 1 = true scale; animates between the two
// let view = "moon";
// let viewGoal = { yaw: -1.0, pitch: 0.55 };
// let viewTweenEndTime = 0;

// ---- inside runSimulation(): tags for bodies too small to see at true scale ----
//
// const tagEarth = createTag("Earth");
// const tagMoon = createTag("Moon");
// const tagSun = createTag("Sun", "sun");
// const tagPlanets = PLANETS.map((planet) => createTag(planet.name));
//
// (tagBoston and tagSunPointer were NOT part of this -- they stayed active.)

// ---- inside runSimulation(): controls ----

function goToView(nextView) {
  view = nextView;
  zoomFactor = 1;
  viewGoal = VIEW_GOALS[nextView];
  viewTweenEndTime = performance.now() + VIEW_TWEEN_DURATION_MS;
}
scaleButton.addEventListener("click", () => {
  trueScale = !trueScale;
  scaleButton.setAttribute("aria-pressed", String(trueScale));
  viewSelect.hidden = !trueScale;
  viewSelect.value = "moon";
  goToView("moon");
});
viewSelect.addEventListener("change", () => goToView(viewSelect.value));

// $("scale") and $("view") were captured alongside the other control refs:
// const scaleButton = $("scale");
// const viewSelect = $("view");

// ---- inside renderFrame(): the illustrative/true-scale blend ----
//
// trueScaleBlend += ((trueScale ? 1 : -1) * dt) / 1.3;
// trueScaleBlend = Math.max(0, Math.min(1, trueScaleBlend));
// const scaleProgress = easeInOut(trueScaleBlend);
//
// ...and sunDisplayDistance/sunDisplayRadius were blended with lerpLog() between
// the illustrative constants and these true values:
//   const sunDisplayDistance = lerpLog(
//     SUN_DISTANCE_ILLUSTRATIVE,
//     astro.sun.distanceAu * AU_IN_EARTH_RADII,
//     scaleProgress,
//   );
//   const sunDisplayRadius = lerpLog(SUN_RADIUS_ILLUSTRATIVE, SUN_RADIUS_TRUE, scaleProgress);
// (moonDisplayDistance was never blended -- it was always the illustrative-scaled
// real distance; only the Sun's distance/radius and Earth's shadow depended on
// scaleProgress.)

// earth.castShadow = scaleProgress > 0.97; // Earth's shadow on the Moon only makes sense at true scale

function updateOrbitsAndPlanets(scaleProgress, sunScenePos, jd) {
  const showSolarSystem = scaleProgress > 0.02;
  orbitGroup.visible = showSolarSystem;
  orbitGroup.position.copy(sunScenePos);
  for (let i = 0; i < PLANETS.length; i++) {
    planetMeshes[i].visible = showSolarSystem;
    if (showSolarSystem) {
      const [x, y, z] = planetScenePosition(PLANETS[i], jd);
      planetMeshes[i].position.set(x + sunScenePos.x, y + sunScenePos.y, z + sunScenePos.z);
    }
  }
}

// ---- inside updateCamera(): view-dependent framing ----

function trueScaleCameraGoal(effectiveView, aspect, sunDisplayDistance, sunDisplayPos, sunScenePos) {
  const horizontalFovTan = fovTan * Math.min(1, aspect);
  let goalDistance;
  let goalTarget = tmpCameraSpace.set(0, 0, 0);

  if (effectiveView === "earth") {
    goalDistance = 4.4 / Math.min(1, aspect);
  } else if (effectiveView === "sun") {
    goalDistance = (sunDisplayDistance * 0.5 * 1.3) / horizontalFovTan;
    goalTarget = sunDisplayPos.clone().multiplyScalar(0.5);
  } else if (effectiveView === "system") {
    goalDistance = (30.5 * AU_IN_EARTH_RADII * 1.12) / horizontalFovTan;
    goalTarget = sunScenePos.clone();
  }
  return { goalDistance, goalTarget };
}

// At the top of updateCamera():
//   const effectiveView = trueScale ? view : "moon";
// ...used to pick between trueScaleCameraGoal() above and the "moon" default.

// The view-tween block, run before computing the camera goal:
//   if (now < viewTweenEndTime) {
//     const tweenStep = 1 - Math.exp(-dt * 3.2);
//     cameraYaw += (viewGoal.yaw - cameraYaw) * tweenStep;
//     cameraPitch += (viewGoal.pitch - cameraPitch) * tweenStep;
//   }

// ---- label placement for bodies too small to see at true scale ----

// Labels only show for bodies too small to see clearly, and only once we're
// zoomed into true scale (`bigEnoughToLabel`).
function placeLabels(sunDisplayPos, sunDisplayRadius, scaleProgress) {
  const bigEnoughToLabel = trueScale && scaleProgress > 0.9;
  const effectiveView = trueScale ? view : "moon";

  placeTag(
    tagEarth,
    new THREE.Vector3(0, 0, 0),
    1,
    bigEnoughToLabel && ["moon", "sun", "system"].includes(effectiveView),
  );
  placeTag(tagMoon, moonDisplayPos, MOON_RADIUS_EARTHS, bigEnoughToLabel && effectiveView === "moon");
  placeTag(
    tagSun,
    sunDisplayPos,
    sunDisplayRadius,
    bigEnoughToLabel && ["sun", "system"].includes(effectiveView),
  );
  for (let i = 0; i < PLANETS.length; i++) {
    placeTag(
      tagPlanets[i],
      planetMeshes[i].position,
      PLANETS[i].radiusEarths,
      bigEnoughToLabel && effectiveView === "system",
    );
  }

  // Boston's tag placement lived in this same function, but did NOT depend on
  // trueScale/bigEnoughToLabel -- it moved into renderFrame() directly rather
  // than being archived. See the live scene.js for its current form.
}
