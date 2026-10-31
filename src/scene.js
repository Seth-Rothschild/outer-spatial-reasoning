// Builds the Three.js scene and runs it: camera controls, the per-frame astronomy
// computation, and rendering. Everything here shares one mutable picture of "where
// things are right now" (the state inside runSimulation), so it stays in one module
// instead of being split across files that would just pass that state back and forth.

import * as THREE from "three";
import {
  moonPosition,
  greenwichSiderealTime,
  obliquityOfEcliptic,
  eclipticToScene,
  earthFixedToScene,
  julianDateFromUnixMs,
  moonSunElongation,
  moonIlluminatedFraction,
  PLANETS,
  EARTH_ELEMENTS,
  orreryScenePosition,
  orreryOrbitPoints,
  orreryDisplayPlanetRadius,
  planetRotationAngle,
  ORRERY_ORBIT_RADII,
} from "./astronomy.js";
import { sunGlowTexture } from "./textures.js";
import {
  EARTH_TEXTURE_URL,
  EARTH_CLOUDS_TEXTURE_URL,
  MOON_TEXTURE_URL,
  PLANET_TEXTURE_URLS,
  SATURN_RING_TEXTURE_URL,
} from "./bodyTextures.js";
import {
  bostonTimeToUnixMs,
  unixMsToDatetimeInput,
  formatFullDate,
  litDiscPath,
  moonPhaseName,
} from "./ui.js";

const BOSTON_LATITUDE = 42.3601;
const BOSTON_LONGITUDE = -71.0589;

// Illustrative-scale sizes/distances (Earth radii): the Moon and Sun are drawn
// close and big enough to see and interact with, rather than at their true scale.
// The Moon's orbit (4) has to stay well inside the smallest gap between neighboring
// planet orbits (9, enforced in ORRERY_ORBIT_RADII in astronomy.js) or it would swing
// out past Venus or Mars -- see ORRERY_MIN_GAP_EARTHS there.
const MOON_RADIUS_EARTHS = 0.2727;
const MOON_DISTANCE_ILLUSTRATIVE = 4;
const MOON_DISTANCE_TRUE_AVERAGE = 60.27; // scales the illustrative distance realistically
const SUN_RADIUS_ILLUSTRATIVE = 6; // comfortably bigger than Jupiter's display radius (~1.9, see orreryDisplayPlanetRadius)

const ORRERY_ORBIT_SEGMENTS = 160;
const ORRERY_CAMERA_DISTANCE = 480; // far enough back to frame Neptune's orbit (~118 Earth radii out)
const ORRERY_CAMERA_MIN_DISTANCE = 30;

const CAMERA_FOV_DEG = 40;
const MAX_ZOOM_FACTOR = 3;
const MIN_ZOOM_FACTOR = 1e-5;
const TIME_JUMP_DURATION_MS = 650; // how long a day-jump/Now/date-picker tween takes to settle

const $ = (id) => document.getElementById(id);

function vecFromArray([x, y, z]) {
  return new THREE.Vector3(x, y, z);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const SUN_ORIGIN = new THREE.Vector3(0, 0, 0); // the Sun is the one fixed point every orbit is drawn around

// A Viewpoint is a place you examine from: `anchor` is the subject you orbit, and
// the camera always faces it -- dragging swings your position around the anchor,
// pinch/scroll zooms toward or away from it, but the anchor itself is always what
// you're looking at, the same way turning a globe in your hands never stops you
// from facing it.
//
// `frameToward` is not a gaze target -- it's a second body whose direction from
// the anchor sets the camera's default position around the anchor (its baseline
// yaw/pitch, before your own drag offset is added), recomputed fresh from the real
// position every frame. That's how "Earth, with the Moon in view" stays composed
// as the Moon moves along its real orbit, with no mode to switch and so no jump:
// the anchor was always Earth, and only the default vantage point drifts.
//
// Each Viewpoint just needs its own anchor/frameToward/distance/framing, reading
// whatever fields it needs off `frame`; the camera code itself never special-cases
// any of them.
// Earth now orbits the Sun at its real position (see renderFrame's earthDisplayPos),
// so these anchor on frame.earthDisplayPos rather than a fixed point -- the camera
// rides along with Earth the same way it already rides along with the Moon below.
const EARTH_TOWARD_MOON = {
  anchor: (frame) => frame.earthDisplayPos,
  frameToward: (frame) => frame.moonDisplayPos,
  distance: 5, // close enough that Earth reads as the foreground subject
  minDistance: 1.6, // stay just outside Earth's radius (1) even at max zoom
  defaultYaw: Math.PI, // sit on the far side of Earth from the Moon, so it reads behind Earth
  defaultPitch: 0.45,
};
const EARTH_TOWARD_SUN = {
  anchor: (frame) => frame.earthDisplayPos,
  frameToward: (frame) => frame.sunDisplayPos,
  distance: 8, // farther back than the Moon view: Earth's bulk eclipses the Sun at close range
  minDistance: 1.6,
  defaultYaw: Math.PI, // sit on the far side of Earth from the Sun, so it reads behind Earth
  defaultPitch: 0.15, // the Sun sits near the ecliptic plane, so a lower vantage keeps it in view
};
// Anchored on the Moon itself rather than Earth, and sitting on its near side (the
// Earth-facing side, since frameToward is Earth's own position and defaultYaw is 0,
// not Math.PI) -- the same side every Moon phase is actually observed from, just
// much closer than the view from Earth allows.
const MOON_NEAR_SIDE = {
  anchor: (frame) => frame.moonDisplayPos,
  frameToward: (frame) => frame.earthDisplayPos,
  distance: 1.2, // close enough to read surface texture and the terminator clearly
  minDistance: 0.35, // stay just outside the Moon's radius (0.2727) even at max zoom
  defaultYaw: 0,
  defaultPitch: 0.12,
};

// An arbitrary point distinct from SUN_ORIGIN -- frameToward just needs to differ
// from the anchor so the camera has a direction to compute its default yaw from, and
// this overview has no single subject to actually orient toward (unlike the Moon/Sun
// views, where the other body IS that subject).
const SYSTEM_FRAME_TOWARD = new THREE.Vector3(1, 0, 0);
const SYSTEM_VIEWPOINT = {
  anchor: () => SUN_ORIGIN,
  frameToward: () => SYSTEM_FRAME_TOWARD,
  distance: ORRERY_CAMERA_DISTANCE,
  minDistance: ORRERY_CAMERA_MIN_DISTANCE,
  defaultYaw: 0,
  defaultPitch: 0.95, // high enough to read the orbits as concentric rings, not edge-on
};

// Keyed by the view-selector button that activates it; see setActiveViewpoint(). All
// of these look at the same, always-populated scene -- the planets are always there,
// whichever Viewpoint you're using (this used to be a separate "Orrery" scene that
// hid the Earth/Moon/Sun view; now it's just another camera angle on the one scene).
const VIEWPOINTS = {
  moon: EARTH_TOWARD_MOON,
  sun: EARTH_TOWARD_SUN,
  phases: MOON_NEAR_SIDE,
  orrery: SYSTEM_VIEWPOINT,
};

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

  const textureLoader = new THREE.TextureLoader();

  function loadTexture(url) {
    const texture = textureLoader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    return texture;
  }

  // The real cloud photo is a grayscale density map (white = cloud), not an RGBA
  // image, so an opaque load of it would look like a solid black-and-white shell
  // instead of translucent cloud cover. Loads it, then rewrites its pixels in place
  // once decoded: brightness becomes the alpha channel, and the color becomes flat
  // white, the same way textureFrom's canvases already carry their own alpha.
  function loadCloudTexture(url) {
    const texture = new THREE.Texture();
    textureLoader.load(url, (loaded) => {
      const canvas = document.createElement("canvas");
      canvas.width = loaded.image.width;
      canvas.height = loaded.image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(loaded.image, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i + 3] = pixels[i]; // cloud brightness -> alpha
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 255; // flat white clouds
      }
      ctx.putImageData(imageData, 0, 0);
      texture.image = canvas;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = maxAnisotropy;
      texture.needsUpdate = true;
    });
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

  let earth, clouds, moon, sunMesh, sunGlow, boston, stars;
  const planetBodies = {}; // name -> { mesh, elements, rotationHours }, positioned each frame in renderFrame()
  const atmosphereUniforms = { sun: { value: new THREE.Vector3(1, 0, 0) } };

  // Earth's own composite (globe + clouds + atmosphere + Boston marker, below) lives
  // under this group so renderFrame can translate the whole thing to Earth's current
  // orbital position in one move, the same way earthFrame (also below) rotates it for
  // spin -- translation here, rotation on the nested group, composing normally.
  const earthSystem = new THREE.Group();
  scene.add(earthSystem);

  // Earth's spin (from sidereal time) is applied to this group, separately from its
  // orbital position (that's earthSystem, above), so the globe -- and anything
  // attached to it, like the cloud layer and the Boston marker -- turns with the
  // planet without disturbing where the planet itself sits.
  const earthFrame = new THREE.Group();
  earthFrame.matrixAutoUpdate = false;
  earthSystem.add(earthFrame);

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
        map: loadTexture(EARTH_TEXTURE_URL),
        roughness: 0.85,
        metalness: 0,
      }),
    );
    earthFrame.add(earth);

    clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.012, 96, 64),
      new THREE.MeshStandardMaterial({
        map: loadCloudTexture(EARTH_CLOUDS_TEXTURE_URL),
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
    earthSystem.add(atmosphere);

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
        map: loadTexture(MOON_TEXTURE_URL),
        roughness: 1,
        metalness: 0,
      }),
    );
    moon.receiveShadow = true;
    scene.add(moon); // not a child of earthSystem: its world position (earth + offset) is set explicitly each frame

    // The Sun sits fixed at SUN_ORIGIN for good -- every planet's orbit (including
    // Earth's) is drawn around it, so unlike everything else here its position and
    // scale never need to change after this.
    sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff2d6 }),
    );
    sunMesh.scale.setScalar(SUN_RADIUS_ILLUSTRATIVE);
    scene.add(sunMesh);
    sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(sunGlowTexture()),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    sunGlow.scale.setScalar(SUN_RADIUS_ILLUSTRATIVE * 3); // stays well inside Mercury's orbit (~40), so it doesn't wash out the inner planets
    scene.add(sunGlow);

    // No dedicated light for the other planets: sunLight (set up above) is
    // directional, so -- unlike a positioned light -- it already illuminates the
    // whole scene uniformly regardless of where an object sits, the same
    // simplification real distant starlight gets treated with (parallel rays). A
    // second, positioned light here would double up on Earth and the Moon (which
    // sunLight already lights correctly) and wash them out.
    stars = buildStarfield();
    scene.add(stars);

    buildPlanets();
  }

  // Every planet besides Earth: real relative size, real orbital angle and speed,
  // and real rotation, at a spaced-out illustrative distance from the Sun (see
  // ORRERY_ORBIT_RADII and orreryDisplayPlanetRadius in astronomy.js). Always part of
  // the scene -- there's no separate mode to switch into to see them.
  function buildPlanets() {
    function orbitRing(elements, assignedRadius) {
      const points = orreryOrbitPoints(elements, assignedRadius, ORRERY_ORBIT_SEGMENTS).map(
        vecFromArray,
      );
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: 0x3a4a6a,
        transparent: true,
        opacity: 0.6,
      });
      return new THREE.LineLoop(geometry, material);
    }

    scene.add(orbitRing(EARTH_ELEMENTS, ORRERY_ORBIT_RADII.Earth));

    for (const planet of PLANETS) {
      scene.add(orbitRing(planet.elements, ORRERY_ORBIT_RADII[planet.name]));

      // `pivot` carries the planet's orbital position; `sphere`, a child of it,
      // carries just its axial spin. Keeping those separate matters for Saturn: its
      // ring is also a child of `pivot`, not of `sphere`, so the ring travels with
      // the planet without spinning along with it at the planet's own (much faster)
      // rotation rate.
      const pivot = new THREE.Group();
      scene.add(pivot);

      const displayRadius = orreryDisplayPlanetRadius(planet.radiusEarths);
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(displayRadius, 64, 48),
        new THREE.MeshStandardMaterial({
          map: loadTexture(PLANET_TEXTURE_URLS[planet.name]),
          roughness: 0.9,
          metalness: 0,
        }),
      );
      pivot.add(sphere);
      planetBodies[planet.name] = {
        pivot,
        sphere,
        elements: planet.elements,
        rotationHours: planet.rotationHours,
      };

      if (planet.name === "Saturn") pivot.add(buildSaturnRing(displayRadius));
    }
  }

  // Saturn's rings, as a flat annulus textured with a radial alpha map. RingGeometry's
  // default UVs run angularly around the ring, which would smear that map instead of
  // showing its inner-to-outer gradient -- so each vertex's UV.x is remapped here to
  // its fraction of the way from the inner to the outer edge.
  function buildSaturnRing(planetRadius) {
    const innerRadius = planetRadius * 1.3;
    const outerRadius = planetRadius * 2.3;
    const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 128);
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const vertex = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i);
      uv.setXY(i, (vertex.length() - innerRadius) / (outerRadius - innerRadius), 1);
    }

    const ring = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        map: loadTexture(SATURN_RING_TEXTURE_URL),
        transparent: true,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2 + 0.47; // lie flat, tilted ~27 deg like Saturn's real obliquity
    return ring;
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
    // ---- simulated time and camera state ------------------------------------------
    let simulatedMs = Date.now();
    let playing = true;
    let speedSecondsPerSecond = 1;

    // Set by animateTimeTo() (the day-jump buttons, Now, and the date picker) to ease
    // simulatedMs to a new value over TIME_JUMP_DURATION_MS instead of snapping to it,
    // so the planets and Earth's rotation visibly sweep to their new positions. null
    // when no jump is in progress, in which case simulatedMs instead advances by
    // speedSecondsPerSecond every frame as usual.
    let timeTween = null; // { fromMs, toMs, startedAtMs }

    // Reassigned by setActiveViewpoint() when the user picks Moon or Sun.
    let activeViewpointKey = "moon";
    let activeViewpoint = VIEWPOINTS[activeViewpointKey];

    // The user's drag/keyboard offset from the active Viewpoint's own default
    // framing (defaultYaw/defaultPitch). Nonzero once the user has panned or
    // zoomed away from that default -- see markCustomFraming() -- and reset to 0
    // by setActiveViewpoint() when they pick Moon or Sun again.
    let cameraYawOffset = 0;
    let cameraPitchOffset = 0;
    let zoomFactor = 1;
    let cameraDistance = activeViewpoint.distance;
    const anchorPosition = new THREE.Vector3(); // smoothed toward the Viewpoint's anchor each frame

    // True once the user has panned or zoomed away from the active Viewpoint's
    // default framing -- shown in the view selector as "Custom" without actually
    // switching the anchor/frameToward the camera is built around.
    let isCustomFraming = false;

    let viewportWidth = 1,
      viewportHeight = 1;
    const X_AXIS = new THREE.Vector3(1, 0, 0);

    // ---- labels: Boston's marker, and an arrow pointing to the Sun when it's off-screen ----
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
    const tagBoston = createTag("Boston", "dot");
    const tagSunPointer = createTag("Sun", "ptr");
    tagSunPointer.insertAdjacentHTML(
      "afterbegin",
      '<svg viewBox="0 0 18 18"><path d="M3 9h10M9 4l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    );
    const sunPointerArrow = tagSunPointer.querySelector("svg");

    // ---- controls -----------------------------------------------------------------
    const playButton = $("play");
    const speedSelect = $("speed");
    const nowToggle = $("now-toggle");
    const dateBar = $("datebar");
    const whenInput = $("when");
    const headerTime = $("r-time");
    const phaseLitPath = $("phase-lit");
    const phaseInfo = $("phase-info");
    const phaseNameEl = $("phase-name");
    const phasePercentEl = $("phase-percent");
    const viewCustomButton = $("view-custom");
    // Keyed the same as VIEWPOINTS, so each preset button drives the matching entry.
    const presetViewButtons = Object.keys(VIEWPOINTS).map((key) => [key, $(`view-${key}`)]);

    // Reflects activeViewpointKey/isCustomFraming onto the view-selector buttons.
    function updateViewButtons() {
      for (const [key, button] of presetViewButtons) {
        button.setAttribute("aria-pressed", String(!isCustomFraming && activeViewpointKey === key));
      }
      viewCustomButton.setAttribute("aria-pressed", String(isCustomFraming));
    }

    // Marks the view selector as "Custom" the first time the user pans or zooms
    // away from the active Viewpoint's default framing; cheap to call repeatedly
    // since it only touches the DOM on the first call after a reset.
    function markCustomFraming() {
      if (isCustomFraming) return;
      isCustomFraming = true;
      updateViewButtons();
    }

    function setActiveViewpoint(key) {
      activeViewpointKey = key;
      activeViewpoint = VIEWPOINTS[key];
      cameraYawOffset = 0;
      cameraPitchOffset = 0;
      zoomFactor = 1;
      cameraDistance = activeViewpoint.distance;
      isCustomFraming = false;
      // Toggled here rather than waiting for the periodic update tick, so switching
      // away from the Phases view hides the panel immediately instead of up to 400ms
      // late; its text content still only refreshes on that tick, which is fine since
      // it's already showing the right phase by the time it reappears.
      phaseInfo.hidden = key !== "phases";
      updateViewButtons();
    }
    for (const [key, button] of presetViewButtons) {
      button.addEventListener("click", () => setActiveViewpoint(key));
    }
    updateViewButtons();

    playButton.textContent = playing ? "Pause" : "Play";
    playButton.addEventListener("click", () => {
      playing = !playing;
      playButton.textContent = playing ? "Pause" : "Play";
    });
    // Browsers restore a <select>'s previously-chosen option across reloads,
    // overriding the HTML's `selected` attribute -- force it back in sync with our
    // actual default so a stale dropdown choice from an earlier visit can't silently
    // disagree with the speed we're actually running at.
    speedSelect.value = String(speedSecondsPerSecond);
    speedSelect.addEventListener("change", () => {
      speedSecondsPerSecond = parseFloat(speedSelect.value);
    });
    nowToggle.addEventListener("click", () => {
      dateBar.hidden = !dateBar.hidden;
      nowToggle.setAttribute("aria-expanded", String(!dateBar.hidden));
      whenInput.value = unixMsToDatetimeInput(simulatedMs);
    });
    // Eases simulatedMs to targetMs over TIME_JUMP_DURATION_MS instead of snapping to
    // it; see renderFrame(), which advances the tween each frame. Restarting from
    // whatever simulatedMs has eased to so far (rather than from the previous target)
    // keeps repeated clicks -- e.g. mashing +1 day -- smooth instead of jumpy.
    function animateTimeTo(targetMs) {
      timeTween = { fromMs: simulatedMs, toMs: targetMs, startedAtMs: performance.now() };
    }

    whenInput.addEventListener("change", () => {
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(whenInput.value);
      if (match) {
        const [, year, month, day, hour, minute] = match;
        animateTimeTo(bostonTimeToUnixMs(+year, +month, +day, +hour, +minute));
      }
    });
    $("d-minus").addEventListener("click", () => animateTimeTo(simulatedMs - 86400000));
    $("d-plus").addEventListener("click", () => animateTimeTo(simulatedMs + 86400000));
    $("d-now").addEventListener("click", () => animateTimeTo(Date.now()));

    function zoomBy(factor) {
      zoomFactor = Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, zoomFactor * factor));
      markCustomFraming();
    }

    const activePointers = new Map();
    let lastPinchDistance = 0;
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastPinchDistance = 0;
    });
    canvas.addEventListener("pointermove", (e) => {
      const pointer = activePointers.get(e.pointerId);
      if (!pointer) return;
      const dx = e.clientX - pointer.x,
        dy = e.clientY - pointer.y;
      pointer.x = e.clientX;
      pointer.y = e.clientY;

      if (activePointers.size === 1) {
        if (dx || dy) markCustomFraming();
        cameraYawOffset -= dx * 0.006;
        cameraPitchOffset = Math.max(-1.45, Math.min(1.45, cameraPitchOffset + dy * 0.006));
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
    const ARROW_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
    canvas.addEventListener("keydown", (e) => {
      let handled = true;
      if (ARROW_KEYS.has(e.key)) markCustomFraming();
      if (e.key === "ArrowLeft") cameraYawOffset += 0.08;
      else if (e.key === "ArrowRight") cameraYawOffset -= 0.08;
      else if (e.key === "ArrowUp") cameraPitchOffset = Math.min(1.45, cameraPitchOffset + 0.08);
      else if (e.key === "ArrowDown") cameraPitchOffset = Math.max(-1.45, cameraPitchOffset - 0.08);
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

    let lastPeriodicUpdateMs = 0;
    let astro = {}; // latest per-frame astronomy computation, read by the render loop

    // ---- per-frame astronomy -------------------------------------------------------
    function computeAstronomy() {
      const jd = julianDateFromUnixMs(simulatedMs);
      const moonEcliptic = moonPosition(jd);
      const siderealDeg = greenwichSiderealTime(jd);
      const obliquityDeg = obliquityOfEcliptic(jd);

      // Earth's own position (true orbital angle and speed, spaced-out distance --
      // see orreryScenePosition/ORRERY_ORBIT_RADII in astronomy.js). Everything else
      // Earth-relative (the Moon, the Sun's apparent direction) is built from this.
      const earthDisplayPos = vecFromArray(
        orreryScenePosition(EARTH_ELEMENTS, ORRERY_ORBIT_RADII.Earth, jd),
      );
      // The Moon's offset from Earth (direction + distance), unaffected by where
      // Earth itself sits in the wider scene.
      const moonScenePos = vecFromArray(
        eclipticToScene(
          moonEcliptic.longitude,
          moonEcliptic.latitude,
          moonEcliptic.distanceEarthRadii,
        ),
      );

      astro = {
        jd,
        siderealDeg,
        obliquityDeg,
        earthDisplayPos,
        moonScenePos,
        moonDistanceEarthRadii: moonEcliptic.distanceEarthRadii,
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

    // Boston's marker shrinks/grows with Earth's apparent size, and its label only
    // shows once Earth is big enough on screen to read detail, and only when it's
    // facing the camera (not on the far side of the globe). Earth no longer sits at
    // the world origin (it orbits the Sun like everything else), so both the pixel
    // radius and the "which way is outward from Earth's center" normal need
    // `earthDisplayPos` rather than assuming the origin.
    function placeBostonTag(earthDisplayPos) {
      const earthPixelRadius =
        (1 / (camera.position.distanceTo(earthDisplayPos) * fovTan)) * (viewportHeight / 2);
      boston.getWorldPosition(tmpVec);
      const bostonWorldPos = tmpVec.clone();
      const facingCamera =
        bostonWorldPos
          .clone()
          .sub(earthDisplayPos)
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

    // True once the Sun is already visible somewhere on screen.
    function sunNeedsNoPointer(sunCameraSpacePos, sunProjectedPos) {
      return (
        sunCameraSpacePos.z < 0 &&
        Math.abs(sunProjectedPos.x) < 0.9 &&
        Math.abs(sunProjectedPos.y) < 0.9
      );
    }

    function absOrEpsilon(value) {
      return Math.abs(value) || 1e-6;
    }

    // Points to the Sun when it's off-screen, so you don't lose track of where the
    // light is coming from while exploring the rest of the scene.
    function updateSunPointer(sunDisplayPos) {
      tmpCameraSpace.copy(sunDisplayPos).applyMatrix4(camera.matrixWorldInverse);
      tmpVec.copy(sunDisplayPos).project(camera);

      if (sunNeedsNoPointer(tmpCameraSpace, tmpVec)) {
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

    // Orbits the active Viewpoint's anchor, always facing it -- for "Earth, toward
    // the Moon" or "Earth, toward the Sun," that's always facing Earth while
    // orbiting close to it, so Earth (the subject) is what's actually centered,
    // the way examining a globe never stops you from facing the globe. The other
    // body only comes in by steering the default vantage point: `frameToward`
    // gives its direction from the anchor, and that sets the camera's baseline
    // yaw/pitch so that body reads behind Earth, without ever being what the
    // camera is aimed at. That direction is read from `frame` fresh every frame,
    // so the default vantage point drifts with that body's real position on its
    // own, continuously -- dragging just adds your own yaw/pitch/zoom on top of
    // that moving baseline, so nothing ever jumps. `frame` carries whatever
    // positions any Viewpoint's anchor/frameToward functions need: today that's
    // moonDisplayPos and sunDisplayPos.
    function updateCamera(dt, frame) {
      const anchor = activeViewpoint.anchor(frame);
      const lookAtPosition = anchor;
      const frameTowardPosition = activeViewpoint.frameToward(frame);
      const directionToFrameTarget = frameTowardPosition.clone().sub(anchor).normalize();

      const goalDistance = Math.max(
        activeViewpoint.minDistance,
        activeViewpoint.distance * zoomFactor,
      );
      const cameraStep = 1 - Math.exp(-dt * 5);
      cameraDistance = Math.exp(
        Math.log(cameraDistance) + (Math.log(goalDistance) - Math.log(cameraDistance)) * cameraStep,
      );
      anchorPosition.lerp(anchor, cameraStep);

      const yaw =
        Math.atan2(directionToFrameTarget.x, directionToFrameTarget.z) +
        activeViewpoint.defaultYaw +
        cameraYawOffset;
      const pitch = activeViewpoint.defaultPitch + cameraPitchOffset;
      camera.position.set(
        anchorPosition.x + cameraDistance * Math.cos(pitch) * Math.sin(yaw),
        anchorPosition.y + cameraDistance * Math.sin(pitch),
        anchorPosition.z + cameraDistance * Math.cos(pitch) * Math.cos(yaw),
      );
      camera.lookAt(lookAtPosition);
      camera.near = Math.max(0.01, cameraDistance * 0.002);
      camera.far = Math.max(cameraDistance * 220, 2500);
      camera.updateProjectionMatrix();

      stars.position.copy(camera.position);
      stars.scale.setScalar(Math.max(1, ((camera.near + camera.far) * 0.5) / 1000));
    }

    // ---- render loop ------------------------------------------------------------------
    let lastFrameTime = performance.now();
    const moonDisplayPos = new THREE.Vector3();
    const sunDisplayPos = SUN_ORIGIN; // fixed forever; never copied/mutated in place

    function renderFrame(now) {
      const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
      lastFrameTime = now;
      if (timeTween) {
        const progress = Math.min(1, (now - timeTween.startedAtMs) / TIME_JUMP_DURATION_MS);
        simulatedMs =
          timeTween.fromMs + (timeTween.toMs - timeTween.fromMs) * easeInOutCubic(progress);
        if (progress >= 1) timeTween = null;
      } else if (playing) {
        simulatedMs += speedSecondsPerSecond * 1000 * dt;
      }
      computeAstronomy();

      const earthDisplayPos = astro.earthDisplayPos;
      const sunDirection = sunDisplayPos.clone().sub(earthDisplayPos).normalize();
      const moonDirection = astro.moonScenePos.clone().normalize();
      const moonDisplayDistance =
        (MOON_DISTANCE_ILLUSTRATIVE * astro.moonDistanceEarthRadii) / MOON_DISTANCE_TRUE_AVERAGE;
      moonDisplayPos.copy(earthDisplayPos).addScaledVector(moonDirection, moonDisplayDistance);

      // Translates Earth's whole composite (globe, clouds, atmosphere, Boston) to its
      // current orbital position; earthFrame's own matrix (below) layers rotation on
      // top of that, same as it always has.
      earthSystem.position.copy(earthDisplayPos);

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

      sunLight.position.copy(moonDisplayPos).addScaledVector(sunDirection, 300);
      sunLight.target.position.copy(moonDisplayPos);

      for (const name in planetBodies) {
        const { pivot, sphere, elements, rotationHours } = planetBodies[name];
        pivot.position.fromArray(orreryScenePosition(elements, ORRERY_ORBIT_RADII[name], astro.jd));
        sphere.rotation.y = planetRotationAngle(rotationHours, astro.jd);
      }

      updateCamera(dt, { earthDisplayPos, moonDisplayPos, sunDisplayPos });

      renderer.render(scene, camera);

      placeBostonTag(earthDisplayPos);
      updateSunPointer(sunDisplayPos);

      if (now - lastPeriodicUpdateMs > 400) {
        lastPeriodicUpdateMs = now;
        const elongation = moonSunElongation(astro.jd);
        headerTime.textContent = formatFullDate.format(simulatedMs);
        phaseLitPath.setAttribute("d", litDiscPath(50, 50, 46, elongation));
        if (!dateBar.hidden && document.activeElement !== whenInput) {
          whenInput.value = unixMsToDatetimeInput(simulatedMs);
        }
        if (activeViewpointKey === "phases") {
          phaseNameEl.textContent = moonPhaseName(elongation);
          const litPercent = Math.round(moonIlluminatedFraction(elongation) * 100);
          phasePercentEl.textContent = `${litPercent}% lit`;
        }
      }

      requestAnimationFrame(renderFrame);
    }

    computeAstronomy();
    requestAnimationFrame(renderFrame);
  }
}
