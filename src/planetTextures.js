// Real photographic textures for the orrery planets. Unlike textures.js (which draws
// Earth/Moon procedurally), these are actual NASA-derived imagery -- 2K equirectangular
// maps from Solar System Scope (solarsystemscope.com/textures), licensed CC BY 4.0.
// Vite inlines them as base64 data URIs (see vite-plugin-singlefile's assetsInlineLimit),
// so the build stays a single portable HTML file.

import mercuryImg from "./assets/planets/mercury.jpg";
import venusImg from "./assets/planets/venus.jpg";
import marsImg from "./assets/planets/mars.jpg";
import jupiterImg from "./assets/planets/jupiter.jpg";
import saturnImg from "./assets/planets/saturn.jpg";
import uranusImg from "./assets/planets/uranus.jpg";
import neptuneImg from "./assets/planets/neptune.jpg";
import saturnRingImg from "./assets/planets/saturn-ring.png";

export const PLANET_TEXTURE_URLS = {
  Mercury: mercuryImg,
  Venus: venusImg,
  Mars: marsImg,
  Jupiter: jupiterImg,
  Saturn: saturnImg,
  Uranus: uranusImg,
  Neptune: neptuneImg,
};

export const SATURN_RING_TEXTURE_URL = saturnRingImg;
