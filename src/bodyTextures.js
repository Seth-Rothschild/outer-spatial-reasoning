// Real photographic textures for the Sun's family: the Earth, the Moon, and the
// seven other planets. Unlike textures.js (which still draws the Sun's glow
// procedurally), these are actual NASA-derived imagery -- 2K equirectangular maps
// from Solar System Scope (solarsystemscope.com/textures), licensed CC BY 4.0. Vite
// inlines them as base64 data URIs (see vite-plugin-singlefile's assetsInlineLimit),
// so the build stays a single portable HTML file.

import earthDaymapImg from "./assets/earth-daymap.jpg";
import earthCloudsImg from "./assets/earth-clouds.jpg";
import moonImg from "./assets/moon.jpg";
import mercuryImg from "./assets/planets/mercury.jpg";
import venusImg from "./assets/planets/venus.jpg";
import marsImg from "./assets/planets/mars.jpg";
import jupiterImg from "./assets/planets/jupiter.jpg";
import saturnImg from "./assets/planets/saturn.jpg";
import uranusImg from "./assets/planets/uranus.jpg";
import neptuneImg from "./assets/planets/neptune.jpg";
import saturnRingImg from "./assets/planets/saturn-ring.png";

export const EARTH_TEXTURE_URL = earthDaymapImg;
// A grayscale cloud-density map, not an RGBA image -- scene.js turns its brightness
// into an alpha channel at load time so clouds render as translucent white rather
// than an opaque black-and-white shell.
export const EARTH_CLOUDS_TEXTURE_URL = earthCloudsImg;
export const MOON_TEXTURE_URL = moonImg;

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
