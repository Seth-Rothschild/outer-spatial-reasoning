// Builds the Three.js scene and runs it: camera controls, the per-frame astronomy
// computation, and the on-screen readouts. Everything here shares one mutable picture
// of "where things are right now" (the state inside runSimulation), so it stays in one
// module instead of being split across files that would just pass that state back and
// forth.

import * as THREE from "three";
import {
  AU_IN_EARTH_RADII,
  AU_KM,
  EARTH_RADIUS_KM,
  sunPosition,
  moonPosition,
  greenwichSiderealTime,
  obliquityOfEcliptic,
  eclipticToScene,
  earthFixedToScene,
  observerFrame,
  altitudeAzimuth,
  PLANETS,
  EARTH_ELEMENTS,
  keplerianPosition,
  planetScenePosition,
  julianDateFromUnixMs,
  moonSunElongation,
  nextMoonPhase,
} from "./astronomy.js";
import { earthTexture, cloudTexture, moonTexture, sunGlowTexture } from "./textures.js";
import {
  litDiscPath,
  moonPhaseName,
  skyColorsAt,
  rgbCss,
  compassDirection,
  formatInteger,
  bostonTimeToUnixMs,
  unixMsToDatetimeInput,
  formatFullDate,
  formatShortDate,
  formatClockTime,
  formatUtcDate,
} from "./ui.js";

const BOSTON_LATITUDE = 42.3601;
const BOSTON_LONGITUDE = -71.0589;

// Illustrative-scale sizes/distances (Earth radii), used when "True scale" is off, so
// the Moon and Sun are close enough and big enough to see and interact with.
const MOON_RADIUS_EARTHS = 0.2727;
const SUN_RADIUS_TRUE = 109.2;
const MOON_DISTANCE_ILLUSTRATIVE = 7;
const MOON_DISTANCE_TRUE_AVERAGE = 60.27; // scales the illustrative distance realistically
const SUN_DISTANCE_ILLUSTRATIVE = 60;
const SUN_RADIUS_ILLUSTRATIVE = 6;

const CAMERA_FOV_DEG = 40;
const VIEW_GOALS = {
  earth: { yaw: -1.0, pitch: 0.4 },
  moon: { yaw: -1.0, pitch: 0.55 },
  sun: { yaw: -1.5708, pitch: 0.3 },
  system: { yaw: 0.0, pitch: 1.15 },
};
const VIEW_TWEEN_DURATION_MS = 1800;
const MAX_ZOOM_FACTOR = 3;
const MIN_ZOOM_FACTOR = 1e-5;

const $ = (id) => document.getElementById(id);

function easeInOut(t) {
  return t * t * (3 - 2 * t);
}

// Interpolates on a log scale, so zooming/scaling feels even at every distance
// (the same visual "speed" whether near or far away).
function lerpLog(a, b, t) {
  return Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);
}

function vecFromArray([x, y, z]) {
  return new THREE.Vector3(x, y, z);
}

export function initScene() {
  const canvas = $("gl");
  const stage = $("stage");
  const loading = $("loading");

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const fovTan = Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, 0.05, 5000);
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

  function textureFrom(canvasSource) {
    const texture = new THREE.CanvasTexture(canvasSource);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    return texture;
  }

  const sunLight = new THREE.DirectionalLight(0xfff4e6, 1.7);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -3;
  sunLight.shadow.camera.right = 3;
  sunLight.shadow.camera.top = 3;
  sunLight.shadow.camera.bottom = -3;
  sunLight.shadow.camera.near = 150;
  sunLight.shadow.camera.far = 480;
  sunLight.shadow.camera.updateProjectionMatrix();
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.01;
  scene.add(sunLight, sunLight.target);
  scene.add(new THREE.AmbientLight(0x3a4a6a, 0.05));

  // Earth's spin (from sidereal time) is applied to this group, separately from its
  // orbital position, so the globe -- and anything attached to it, like the cloud
  // layer and the Boston marker -- turns with the planet.
  const earthFrame = new THREE.Group();
  earthFrame.matrixAutoUpdate = false;
  scene.add(earthFrame);

  let earth, clouds, moon, sunMesh, sunGlow, boston, orbitGroup, stars;
  const planetMeshes = [];
  const atmosphereUniforms = { sun: { value: new THREE.Vector3(1, 0, 0) } };

  // Deferred so the "Building Earth…" message gets a chance to paint before the
  // (synchronous, CPU-bound) texture generation blocks the main thread.
  setTimeout(() => {
    buildBodies();
    loading.hidden = true;
    runSimulation();
  }, 30);

  function buildBodies() {
    earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 128, 96),
      new THREE.MeshStandardMaterial({
        map: textureFrom(earthTexture()),
        roughness: 0.85,
        metalness: 0,
      }),
    );
    earthFrame.add(earth);

    clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.012, 96, 64),
      new THREE.MeshStandardMaterial({
        map: textureFrom(cloudTexture()),
        transparent: true,
        depthWrite: false,
        roughness: 1,
      }),
    );
    earthFrame.add(clouds);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: atmosphereUniforms,
        vertexShader: `
          varying vec3 vNormalView;
          varying vec3 vNormalWorld;
          void main() {
            vNormalView = normalize(normalMatrix * normal);
            vNormalWorld = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 sun;
          varying vec3 vNormalView;
          varying vec3 vNormalWorld;
          void main() {
            float rim = clamp(-vNormalView.z * 2.3, 0.0, 1.0);
            float intensity = pow(rim, 2.2);
            float lit = 0.1 + 0.9 * smoothstep(-0.2, 0.5, dot(vNormalWorld, sun));
            gl_FragColor = vec4(vec3(0.35, 0.62, 1.0) * intensity * lit * 1.25, 1.0);
          }
        `,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    scene.add(atmosphere);

    boston = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xff8a6b }),
    );
    const bostonLatRad = BOSTON_LATITUDE * (Math.PI / 180);
    const bostonLonRad = BOSTON_LONGITUDE * (Math.PI / 180);
    boston.position
      .set(
        Math.cos(bostonLatRad) * Math.cos(bostonLonRad),
        Math.sin(bostonLatRad),
        -Math.cos(bostonLatRad) * Math.sin(bostonLonRad),
      )
      .multiplyScalar(1.004);
    earthFrame.add(boston);

    moon = new THREE.Mesh(
      new THREE.SphereGeometry(MOON_RADIUS_EARTHS, 64, 48),
      new THREE.MeshStandardMaterial({
        map: textureFrom(moonTexture()),
        roughness: 1,
        metalness: 0,
      }),
    );
    moon.receiveShadow = true;
    scene.add(moon);

    sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff2d6 }),
    );
    scene.add(sunMesh);
    sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(sunGlowTexture()),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    scene.add(sunGlow);

    orbitGroup = buildOrbits();

    stars = buildStarfield();
    scene.add(stars);
  }

  // Orbit lines and planet markers, shown only at true scale.
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

  function buildStarfield() {
    const STAR_COUNT = 2600;
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);

    for (let i = 0; i < STAR_COUNT; i++) {
      // Even distribution on a sphere: pick z uniformly, azimuth uniformly, derive the ring radius.
      const z = Math.random() * 2 - 1;
      const azimuth = Math.random() * Math.PI * 2;
      const ringRadius = Math.sqrt(1 - z * z);
      positions[i * 3] = 1000 * ringRadius * Math.cos(azimuth);
      positions[i * 3 + 1] = 1000 * z;
      positions[i * 3 + 2] = 1000 * ringRadius * Math.sin(azimuth);

      const brightness = 0.35 + Math.random() * 0.65;
      const warmth = Math.random();
      colors[i * 3] = brightness * (0.8 + 0.2 * warmth);
      colors[i * 3 + 1] = brightness * 0.9;
      colors[i * 3 + 2] = brightness * (1 - 0.2 * warmth);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 1.6,
        sizeAttenuation: false,
        vertexColors: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    points.renderOrder = -1;
    points.frustumCulled = false;
    return points;
  }

  function runSimulation() {
    // ---- simulated time and view state ------------------------------------------
    let simulatedMs = Date.now();
    let playing = false;
    let speedSecondsPerSecond = 86400;
    let trueScale = false;
    let trueScaleBlend = 0; // 0 = illustrative, 1 = true scale; animates between the two

    let view = "moon";
    let cameraYaw = -1.0;
    let cameraPitch = 0.55;
    let zoomFactor = 1;
    let cameraDistance = 24;
    const cameraTarget = new THREE.Vector3();
    let viewGoal = { yaw: -1.0, pitch: 0.55 };
    let viewTweenEndTime = 0;

    let viewportWidth = 1,
      viewportHeight = 1;
    const X_AXIS = new THREE.Vector3(1, 0, 0);

    // ---- labels for bodies too small to see at their current on-screen size -----
    function createTag(label, cssClass) {
      const el = document.createElement("div");
      el.className = `tag ${cssClass || ""}`;
      el.hidden = true;
      const span = document.createElement("span");
      span.textContent = label;
      el.appendChild(span);
      stage.appendChild(el);
      return el;
    }
    const tagEarth = createTag("Earth");
    const tagMoon = createTag("Moon");
    const tagSun = createTag("Sun", "sun");
    const tagBoston = createTag("Boston", "dot");
    const tagPlanets = PLANETS.map((planet) => createTag(planet.name));
    const tagSunPointer = createTag("Sun", "ptr");
    tagSunPointer.insertAdjacentHTML(
      "afterbegin",
      '<svg viewBox="0 0 18 18"><path d="M3 9h10M9 4l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    );
    const sunPointerArrow = tagSunPointer.querySelector("svg");

    // ---- controls -----------------------------------------------------------------
    const playButton = $("play");
    const speedSelect = $("speed");
    const scaleButton = $("scale");
    const viewSelect = $("view");
    const dateButton = $("datebtn");
    const dateBar = $("datebar");
    const whenInput = $("when");

    playButton.addEventListener("click", () => {
      playing = !playing;
      playButton.textContent = playing ? "Pause" : "Play";
    });
    speedSelect.addEventListener("change", () => {
      speedSecondsPerSecond = parseFloat(speedSelect.value);
    });
    dateButton.addEventListener("click", () => {
      dateBar.hidden = !dateBar.hidden;
      dateButton.setAttribute("aria-pressed", String(!dateBar.hidden));
      whenInput.value = unixMsToDatetimeInput(simulatedMs);
    });
    whenInput.addEventListener("change", () => {
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(whenInput.value);
      if (match) {
        const [, year, month, day, hour, minute] = match;
        simulatedMs = bostonTimeToUnixMs(+year, +month, +day, +hour, +minute);
      }
    });
    $("d-minus").addEventListener("click", () => {
      simulatedMs -= 86400000;
      whenInput.value = unixMsToDatetimeInput(simulatedMs);
    });
    $("d-plus").addEventListener("click", () => {
      simulatedMs += 86400000;
      whenInput.value = unixMsToDatetimeInput(simulatedMs);
    });
    $("d-now").addEventListener("click", () => {
      simulatedMs = Date.now();
      whenInput.value = unixMsToDatetimeInput(simulatedMs);
    });

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

    function zoomBy(factor) {
      zoomFactor = Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, zoomFactor * factor));
    }

    const activePointers = new Map();
    let lastPinchDistance = 0;
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastPinchDistance = 0;
      viewTweenEndTime = 0;
    });
    canvas.addEventListener("pointermove", (e) => {
      const pointer = activePointers.get(e.pointerId);
      if (!pointer) return;
      const dx = e.clientX - pointer.x,
        dy = e.clientY - pointer.y;
      pointer.x = e.clientX;
      pointer.y = e.clientY;

      if (activePointers.size === 1) {
        cameraYaw -= dx * 0.006;
        cameraPitch = Math.max(-1.45, Math.min(1.45, cameraPitch + dy * 0.006));
      } else if (activePointers.size === 2) {
        const [a, b] = Array.from(activePointers.values());
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastPinchDistance) zoomBy(lastPinchDistance / distance);
        lastPinchDistance = distance;
      }
    });
    function releasePointer(e) {
      activePointers.delete(e.pointerId);
      lastPinchDistance = 0;
    }
    canvas.addEventListener("pointerup", releasePointer);
    canvas.addEventListener("pointercancel", releasePointer);
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        zoomBy(Math.exp(e.deltaY * 0.0012));
      },
      { passive: false },
    );
    canvas.addEventListener("keydown", (e) => {
      let handled = true;
      viewTweenEndTime = 0;
      if (e.key === "ArrowLeft") cameraYaw += 0.08;
      else if (e.key === "ArrowRight") cameraYaw -= 0.08;
      else if (e.key === "ArrowUp") cameraPitch = Math.min(1.45, cameraPitch + 0.08);
      else if (e.key === "ArrowDown") cameraPitch = Math.max(-1.45, cameraPitch - 0.08);
      else if (e.key === "+" || e.key === "=") zoomBy(0.88);
      else if (e.key === "-") zoomBy(1.14);
      else handled = false;
      if (handled) e.preventDefault();
    });

    function resize() {
      viewportWidth = Math.max(1, stage.clientWidth);
      viewportHeight = Math.max(1, stage.clientHeight);
      renderer.setSize(viewportWidth, viewportHeight, false);
      camera.aspect = viewportWidth / viewportHeight;
      camera.updateProjectionMatrix();
    }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
    else window.addEventListener("resize", resize);
    resize();

    // ---- instrument cards (moon phase, Boston sky) -------------------------------
    const phaseLitPath = $("phase-lit");
    const skyMoonLitPath = $("sky-moon-lit");
    const skySunGroup = $("sky-sun");
    const skyMoonGroup = $("sky-moon");
    const skyTopStop = $("sky-top");
    const skyBottomStop = $("sky-bot");

    let lastCardUpdateMs = 0;
    let lastDateBarUpdateMs = 0;
    let astro = {}; // latest per-frame astronomy computation, read by updateCards() and the render loop

    function updateCards() {
      const elongation = astro.elongationDeg;
      phaseLitPath.setAttribute("d", litDiscPath(50, 50, 46, elongation));
      skyMoonLitPath.setAttribute("d", litDiscPath(0, 0, 7.5, elongation));
      $("phase-svg").setAttribute(
        "aria-label",
        `${moonPhaseName(elongation)}, ${Math.round(astro.illuminatedFraction * 100)}% lit`,
      );
      $("phase-name").textContent = moonPhaseName(elongation);
      $("phase-lit-pct").textContent = `${Math.round(astro.illuminatedFraction * 100)}%`;
      $("phase-age").textContent = ((elongation / 360) * 29.53).toFixed(1);

      const nextFull = nextMoonPhase(simulatedMs, 180);
      const nextNew = nextMoonPhase(simulatedMs, 0);
      $("phase-next").innerHTML =
        `Next full moon <b>${nextFull ? formatShortDate.format(nextFull) : "–"}</b><br>` +
        `Next new moon <b>${nextNew ? formatShortDate.format(nextNew) : "–"}</b>`;

      const sunAltitude = astro.sunAltAz.alt;
      let headline;
      if (sunAltitude > -0.833) headline = "Daytime in Boston";
      else if (sunAltitude > -6) headline = `${astro.sunIsRising ? "Dawn" : "Dusk"} in Boston`;
      else headline = "Night in Boston";
      $("bos-head").textContent = headline;
      $("bos-sun").innerHTML =
        `<b>${formatClockTime.format(simulatedMs)}</b> · Sun ${Math.abs(sunAltitude).toFixed(0)}° ${sunAltitude >= 0 ? "above" : "below"} the horizon`;

      const moonAltitude = astro.moonAltAz;
      $("bos-moon").innerHTML =
        moonAltitude.alt >= 0
          ? `Moon <b>up</b>, ${moonAltitude.alt.toFixed(0)}° high in the ${compassDirection(moonAltitude.az)}`
          : `Moon <b>down</b>, ${Math.abs(moonAltitude.alt).toFixed(0)}° below the horizon`;

      const skyColors = skyColorsAt(sunAltitude);
      skyTopStop.setAttribute("stop-color", rgbCss(skyColors.top));
      skyBottomStop.setAttribute("stop-color", rgbCss(skyColors.bottom));

      function placeSkyMarker(group, altAz) {
        const x = Math.max(9, Math.min(351, altAz.az));
        const y = Math.max(8, Math.min(103, 84 - altAz.alt * 0.88));
        group.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
        group.setAttribute("opacity", altAz.alt >= 0 ? "1" : "0.35");
      }
      placeSkyMarker(skySunGroup, astro.sunAltAz);
      placeSkyMarker(skyMoonGroup, moonAltitude);
    }

    // ---- per-frame astronomy -------------------------------------------------------
    function computeAstronomy() {
      const jd = julianDateFromUnixMs(simulatedMs);
      const sun = sunPosition(jd);
      const moonEcliptic = moonPosition(jd);
      const siderealDeg = greenwichSiderealTime(jd);
      const obliquityDeg = obliquityOfEcliptic(jd);

      const sunScenePos = vecFromArray(
        eclipticToScene(sun.longitude, 0, sun.distanceAu * AU_IN_EARTH_RADII),
      );
      const moonScenePos = vecFromArray(
        eclipticToScene(
          moonEcliptic.longitude,
          moonEcliptic.latitude,
          moonEcliptic.distanceEarthRadii,
        ),
      );

      // Phase angle (Sun-Moon-Earth) from the Moon's point of view, to find how much
      // of the near side is lit.
      const moonToSun = sunScenePos.clone().sub(moonScenePos);
      const cosPhaseAngle =
        -moonScenePos.dot(moonToSun) / (moonScenePos.length() * moonToSun.length());

      const frameNow = observerFrame(BOSTON_LATITUDE, BOSTON_LONGITUDE, siderealDeg, obliquityDeg);
      // A frame one minute later, just to tell whether the Sun is rising or setting.
      const jdSoon = jd + 1 / 1440;
      const frameSoon = observerFrame(
        BOSTON_LATITUDE,
        BOSTON_LONGITUDE,
        greenwichSiderealTime(jdSoon),
        obliquityOfEcliptic(jdSoon),
      );

      const sunVec = [sunScenePos.x, sunScenePos.y, sunScenePos.z];
      const sunAltAz = altitudeAzimuth(frameNow, sunVec);
      // The Moon's position relative to the observer, not the Earth's center.
      const moonTopocentric = [
        moonScenePos.x - frameNow.up[0],
        moonScenePos.y - frameNow.up[1],
        moonScenePos.z - frameNow.up[2],
      ];

      astro = {
        jd,
        siderealDeg,
        obliquityDeg,
        sunScenePos,
        moonScenePos,
        sun,
        moon: moonEcliptic,
        elongationDeg: moonSunElongation(jd),
        illuminatedFraction: (1 + cosPhaseAngle) / 2,
        sunAltAz,
        moonAltAz: altitudeAzimuth(frameNow, moonTopocentric),
        sunIsRising: altitudeAzimuth(frameSoon, sunVec).alt > sunAltAz.alt,
      };
    }

    // ---- label placement ------------------------------------------------------------
    const tmpVec = new THREE.Vector3();
    const tmpCameraSpace = new THREE.Vector3();

    // Positions a DOM label over a 3D point, hiding it unless `visible` and the point
    // is on-screen and in front of the camera. `minPixelRadius`, if given, also
    // requires the body to be at least that many pixels across (used for Boston's dot,
    // which should disappear once Earth itself is too small to show detail on).
    function placeTag(el, worldPos, bodyRadius, visible, minPixelRadius) {
      tmpCameraSpace.copy(worldPos).applyMatrix4(camera.matrixWorldInverse);
      const distance = worldPos.distanceTo(camera.position);
      const pixelRadius = (bodyRadius / (distance * fovTan)) * (viewportHeight / 2);
      tmpVec.copy(worldPos).project(camera);

      const onScreen = Math.abs(tmpVec.x) < 1.02 && Math.abs(tmpVec.y) < 1.02;
      const inFront = tmpCameraSpace.z < 0;
      const bigEnough = minPixelRadius ? pixelRadius > minPixelRadius : pixelRadius < 7;
      const show = visible && inFront && onScreen && bigEnough;

      el.hidden = !show;
      if (show) {
        const screenX = (tmpVec.x * 0.5 + 0.5) * viewportWidth;
        const screenY = (-tmpVec.y * 0.5 + 0.5) * viewportHeight;
        el.style.transform = `translate(${screenX.toFixed(1)}px,${screenY.toFixed(1)}px)`;
      }
      return pixelRadius;
    }

    // ---- render loop ------------------------------------------------------------------
    let lastFrameTime = performance.now();
    const moonDisplayPos = new THREE.Vector3();
    const sunDisplayPos = new THREE.Vector3();

    function renderFrame(now) {
      const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
      lastFrameTime = now;
      if (playing) simulatedMs += speedSecondsPerSecond * 1000 * dt;
      computeAstronomy();

      trueScaleBlend += ((trueScale ? 1 : -1) * dt) / 1.3;
      trueScaleBlend = Math.max(0, Math.min(1, trueScaleBlend));
      const scaleProgress = easeInOut(trueScaleBlend);

      const sunDirection = astro.sunScenePos.clone().normalize();
      const moonDirection = astro.moonScenePos.clone().normalize();
      const moonDisplayDistance = lerpLog(
        (MOON_DISTANCE_ILLUSTRATIVE * astro.moon.distanceEarthRadii) / MOON_DISTANCE_TRUE_AVERAGE,
        astro.moon.distanceEarthRadii,
        scaleProgress,
      );
      const sunDisplayDistance = lerpLog(
        SUN_DISTANCE_ILLUSTRATIVE,
        astro.sun.distanceAu * AU_IN_EARTH_RADII,
        scaleProgress,
      );
      const sunDisplayRadius = lerpLog(SUN_RADIUS_ILLUSTRATIVE, SUN_RADIUS_TRUE, scaleProgress);
      moonDisplayPos.copy(moonDirection).multiplyScalar(moonDisplayDistance);
      sunDisplayPos.copy(sunDirection).multiplyScalar(sunDisplayDistance);

      // Earth's orientation, from sidereal time: the three axes of its rotated frame.
      const earthAxisX = vecFromArray(
        earthFixedToScene([1, 0, 0], astro.siderealDeg, astro.obliquityDeg),
      );
      const earthAxisY = vecFromArray(
        earthFixedToScene([0, 0, 1], astro.siderealDeg, astro.obliquityDeg),
      );
      const earthAxisZ = vecFromArray(
        earthFixedToScene([0, -1, 0], astro.siderealDeg, astro.obliquityDeg),
      );
      earthFrame.matrix.makeBasis(earthAxisX, earthAxisY, earthAxisZ);
      earthFrame.matrixWorldNeedsUpdate = true;
      clouds.rotation.y = (astro.jd - 2451545) * 0.04;
      atmosphereUniforms.sun.value.copy(sunDirection);

      moon.position.copy(moonDisplayPos);
      moon.quaternion.setFromUnitVectors(X_AXIS, moonDirection.clone().negate()); // tidally locked: near side faces Earth
      sunMesh.position.copy(sunDisplayPos);
      sunMesh.scale.setScalar(sunDisplayRadius);
      sunGlow.position.copy(sunDisplayPos);
      sunGlow.scale.setScalar(sunDisplayRadius * 9);

      sunLight.position.copy(moonDisplayPos).addScaledVector(sunDirection, 300);
      sunLight.target.position.copy(moonDisplayPos);
      earth.castShadow = scaleProgress > 0.97; // Earth's shadow on the Moon only makes sense at true scale

      const showSolarSystem = scaleProgress > 0.02;
      orbitGroup.visible = showSolarSystem;
      orbitGroup.position.copy(astro.sunScenePos);
      for (let i = 0; i < PLANETS.length; i++) {
        planetMeshes[i].visible = showSolarSystem;
        if (showSolarSystem) {
          const [x, y, z] = planetScenePosition(PLANETS[i], astro.jd);
          planetMeshes[i].position.set(
            x + astro.sunScenePos.x,
            y + astro.sunScenePos.y,
            z + astro.sunScenePos.z,
          );
        }
      }

      updateCamera(now, dt, sunDirection, sunDisplayPos, sunDisplayDistance, moonDisplayDistance);

      renderer.render(scene, camera);

      placeLabels(sunDisplayPos, sunDisplayRadius, scaleProgress);
      updateSunPointer(sunDisplayPos);

      if (now - lastCardUpdateMs > 200) {
        lastCardUpdateMs = now;
        updateReadouts();
        updateCards();
        if (
          !dateBar.hidden &&
          document.activeElement !== whenInput &&
          now - lastDateBarUpdateMs > 400
        ) {
          lastDateBarUpdateMs = now;
          whenInput.value = unixMsToDatetimeInput(simulatedMs);
        }
      }

      requestAnimationFrame(renderFrame);
    }

    // Camera orbits around a target point; yaw is measured from the Sun's direction
    // so the lighting stays composed the same way as time runs forward.
    function updateCamera(
      now,
      dt,
      sunDirection,
      sunDisplayPos,
      sunDisplayDistance,
      moonDisplayDistance,
    ) {
      if (now < viewTweenEndTime) {
        const tweenStep = 1 - Math.exp(-dt * 3.2);
        cameraYaw += (viewGoal.yaw - cameraYaw) * tweenStep;
        cameraPitch += (viewGoal.pitch - cameraPitch) * tweenStep;
      }

      const effectiveView = trueScale ? view : "moon";
      const aspect = viewportWidth / viewportHeight;
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
        goalTarget = astro.sunScenePos.clone();
      } else {
        goalDistance = (moonDisplayDistance * 1.2 + 0.5) / horizontalFovTan;
      }
      goalDistance = Math.max(1.6, goalDistance * zoomFactor);

      const cameraStep = 1 - Math.exp(-dt * 5);
      cameraDistance = Math.exp(
        Math.log(cameraDistance) + (Math.log(goalDistance) - Math.log(cameraDistance)) * cameraStep,
      );
      cameraTarget.lerp(goalTarget, cameraStep);

      const yaw = Math.atan2(sunDirection.x, sunDirection.z) + cameraYaw;
      camera.position.set(
        cameraTarget.x + cameraDistance * Math.cos(cameraPitch) * Math.sin(yaw),
        cameraTarget.y + cameraDistance * Math.sin(cameraPitch),
        cameraTarget.z + cameraDistance * Math.cos(cameraPitch) * Math.cos(yaw),
      );
      camera.lookAt(cameraTarget);
      camera.near = Math.max(0.01, cameraDistance * 0.002);
      camera.far = Math.max(cameraDistance * 220, 2500);
      camera.updateProjectionMatrix();

      stars.position.copy(camera.position);
      stars.scale.setScalar(Math.max(1, ((camera.near + camera.far) * 0.5) / 1000));
    }

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
      placeTag(
        tagMoon,
        moonDisplayPos,
        MOON_RADIUS_EARTHS,
        bigEnoughToLabel && effectiveView === "moon",
      );
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

      const earthPixelRadius = (1 / (camera.position.length() * fovTan)) * (viewportHeight / 2);
      boston.getWorldPosition(tmpVec);
      const bostonWorldPos = tmpVec.clone();
      const facingCamera =
        bostonWorldPos
          .clone()
          .normalize()
          .dot(camera.position.clone().sub(bostonWorldPos).normalize()) > 0.05;
      boston.scale.setScalar(
        Math.max(
          0.004,
          (4 * bostonWorldPos.distanceTo(camera.position) * fovTan) / (viewportHeight / 2),
        ),
      );
      placeTag(tagBoston, bostonWorldPos, 1, facingCamera && earthPixelRadius > 24, 0.0001);
      if (earthPixelRadius <= 24) tagBoston.hidden = true;
    }

    // True once the Sun is already visible somewhere on screen -- either literally
    // in view, or because the current camera view (true-scale "sun"/"system") is
    // centered on it.
    function sunNeedsNoPointer(sunCameraSpacePos, sunProjectedPos, effectiveView) {
      const onScreen =
        sunCameraSpacePos.z < 0 &&
        Math.abs(sunProjectedPos.x) < 0.9 &&
        Math.abs(sunProjectedPos.y) < 0.9;
      const viewIsCenteredOnSun =
        trueScale && (effectiveView === "sun" || effectiveView === "system");
      return onScreen || viewIsCenteredOnSun;
    }

    function absOrEpsilon(value) {
      return Math.abs(value) || 1e-6;
    }

    // Points to the Sun when it's off-screen, so you don't lose track of where the
    // light is coming from while exploring the rest of the scene.
    function updateSunPointer(sunDisplayPos) {
      tmpCameraSpace.copy(sunDisplayPos).applyMatrix4(camera.matrixWorldInverse);
      tmpVec.copy(sunDisplayPos).project(camera);
      const effectiveView = trueScale ? view : "moon";

      if (sunNeedsNoPointer(tmpCameraSpace, tmpVec, effectiveView)) {
        tagSunPointer.hidden = true;
        return;
      }

      const dirX = tmpCameraSpace.x,
        dirY = tmpCameraSpace.y;
      const dirLength = Math.hypot(dirX, dirY) || 1;
      const unitX = dirX / dirLength,
        unitY = dirY / dirLength;
      const reach = Math.min(
        (viewportWidth / 2 - 46) / absOrEpsilon(unitX),
        (viewportHeight / 2 - 30) / absOrEpsilon(unitY),
      );

      tagSunPointer.hidden = false;
      tagSunPointer.style.transform = `translate(${(viewportWidth / 2 + unitX * reach).toFixed(1)}px,${(viewportHeight / 2 - unitY * reach).toFixed(1)}px)`;
      sunPointerArrow.style.transform = `rotate(${((Math.atan2(-unitY, unitX) * 180) / Math.PI).toFixed(1)}deg)`;
    }

    function updateReadouts() {
      const moonDistanceKm = astro.moon.distanceEarthRadii * EARTH_RADIUS_KM;
      const sunDistanceKm = astro.sun.distanceAu * AU_KM;
      $("r-time").textContent = formatFullDate.format(simulatedMs);
      $("r-utc").textContent = `${formatUtcDate.format(simulatedMs)} UTC`;
      $("r-moon").textContent =
        `${formatInteger(moonDistanceKm)} km · ${(moonDistanceKm / 299792.458).toFixed(2)} light-sec`;
      $("r-sun").textContent =
        `${(sunDistanceKm / 1e6).toFixed(1)}M km · ${(sunDistanceKm / 299792.458 / 60).toFixed(2)} light-min`;
      $("r-scale").textContent = trueScale
        ? "True scale: Earth radius = 6,371 km"
        : "Illustrative scale: distances compressed, sizes of Earth and Moon in true ratio";
    }

    computeAstronomy();
    updateCards();
    requestAnimationFrame(renderFrame);
  }
}
