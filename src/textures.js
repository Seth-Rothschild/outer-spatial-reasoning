// Procedural textures for the Earth, clouds, Moon and Sun glow, all drawn onto 2D
// canvases and later used as Three.js textures. Land/ocean outlines come from
// Natural Earth (via world-atlas), encoded in land-outlines.json as delta-coded
// polygon vertices in tenths of a degree.

import landOutlines from "./land-outlines.json" with { type: "json" };

// ---- noise -------------------------------------------------------------------------
// A simple 3D value-noise function (hash the corners of a unit cube, smooth-interpolate
// between them), combined at a few octaves (fractal Brownian motion) for natural-looking
// terrain, clouds and crater shading.

export function hash(x, y, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440670441)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function noise3(x, y, z) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z);
  const u = smoothstep(x - xi),
    v = smoothstep(y - yi),
    w = smoothstep(z - zi);

  const topFace = lerp(
    lerp(hash(xi, yi, zi), hash(xi + 1, yi, zi), u),
    lerp(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u),
    v,
  );
  const bottomFace = lerp(
    lerp(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u),
    lerp(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u),
    v,
  );
  return lerp(topFace, bottomFace, w);
}

export function fractalNoise(x, y, z, octaves) {
  let sum = 0,
    weight = 0,
    amplitude = 1,
    frequency = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * noise3(x * frequency, y * frequency, z * frequency);
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / weight;
}

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function mixColor(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Box blur of a land/ocean mask (raw 0-255 pixel values, thresholded to 0/1 here),
// wrapped horizontally (so coastlines don't seam at +/-180deg) and clamped vertically
// (no wrap at the poles). Used to soften the land/ocean edge into a shoreline glow.
export function blurMask(rawMask, width, height, radius) {
  const binaryMask = new Float32Array(width * height);
  for (let i = 0; i < binaryMask.length; i++) binaryMask[i] = rawMask[i] > 127 ? 1 : 0;

  const horizontallyBlurred = new Float32Array(width * height);
  const blurred = new Float32Array(width * height);
  const normalize = 1 / (2 * radius + 1);

  for (let row = 0; row < height; row++) {
    const rowStart = row * width;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += binaryMask[rowStart + ((k + width) % width)];
    for (let col = 0; col < width; col++) {
      horizontallyBlurred[rowStart + col] = sum * normalize;
      sum +=
        binaryMask[rowStart + ((col + radius + 1) % width)] -
        binaryMask[rowStart + ((col - radius + width) % width)];
    }
  }

  for (let col = 0; col < width; col++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      sum += horizontallyBlurred[Math.min(height - 1, Math.max(0, k)) * width + col];
    }
    for (let row = 0; row < height; row++) {
      blurred[row * width + col] = sum * normalize;
      sum +=
        horizontallyBlurred[Math.min(height - 1, row + radius + 1) * width + col] -
        horizontallyBlurred[Math.max(0, row - radius) * width + col];
    }
  }

  return blurred;
}

// ---- Earth ---------------------------------------------------------------------------

function landMask(width, height) {
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const ctx = maskCanvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#fff";

  // Each polygon's coordinates are stored as [firstLon, firstLat, dLon1, dLat1, dLon2, ...]
  // in tenths of a degree, so we accumulate deltas into (lon, lat) as we trace each ring.
  const toPixel = (lon, lat) => [
    ((lon / 10 + 180) / 360) * width,
    ((90 - lat / 10) / 180) * height,
  ];
  for (const polygon of landOutlines) {
    ctx.beginPath();
    for (const ring of polygon) {
      let lon = ring[0],
        lat = ring[1];
      ctx.moveTo(...toPixel(lon, lat));
      for (let i = 2; i < ring.length; i += 2) {
        lon += ring[i];
        lat += ring[i + 1];
        ctx.lineTo(...toPixel(lon, lat));
      }
      ctx.closePath();
    }
    ctx.fill("evenodd");
  }

  const pixels = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4];
  return mask;
}

const OCEAN_DEEP = [8, 30, 74],
  OCEAN_SHALLOW = [46, 124, 176],
  ICE = [220, 232, 244];
const GRASS = [46, 100, 54],
  DESERT = [190, 160, 102],
  FOREST = [30, 80, 48],
  MOUNTAIN = [128, 118, 104],
  SNOW = [238, 243, 250];

export function earthTexture() {
  const width = 2048,
    height = 1024;
  const mask = landMask(width, height);
  const coastlineGlow = blurMask(mask, width, height, 6);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(width, height);
  const pixels = image.data;

  let i = 0;
  for (let row = 0; row < height; row++) {
    const latitude = (0.5 - (row + 0.5) / height) * Math.PI;
    const cosLat = Math.cos(latitude),
      sinLat = Math.sin(latitude);
    const absLatNorm = Math.abs(latitude);

    for (let col = 0; col < width; col++, i++) {
      const longitude = ((col + 0.5) / width) * 2 * Math.PI - Math.PI;
      const x = cosLat * Math.cos(longitude),
        z = cosLat * Math.sin(longitude);

      let color;
      if (mask[i] > 127) {
        const terrainNoise = fractalNoise(x * 3 + 7, sinLat * 3 + 7, z * 3 + 7, 4);
        const aridity =
          clamp01((terrainNoise - 0.45) * 4) * clamp01(1 - Math.abs(absLatNorm - 0.47) / 0.4);
        color = mixColor(GRASS, DESERT, aridity);
        const forestCover =
          clamp01(1 - absLatNorm / 0.7) * clamp01((0.55 - terrainNoise) * 3) * 0.7;
        color = mixColor(color, FOREST, forestCover);
        color = mixColor(color, MOUNTAIN, clamp01((terrainNoise - 0.6) * 4));
        const snowLine = 1.16 + (terrainNoise - 0.5) * 0.3;
        if (absLatNorm > snowLine)
          color = mixColor(color, SNOW, clamp01((absLatNorm - snowLine) * 14));
      } else {
        const shallowness = clamp01(coastlineGlow[i] * 2.3);
        color = mixColor(OCEAN_DEEP, OCEAN_SHALLOW, Math.pow(shallowness, 1.2));
        if (absLatNorm > 1.38) color = mixColor(color, ICE, clamp01((absLatNorm - 1.38) * 8) * 0.9);
      }

      const o = i * 4;
      pixels[o] = color[0];
      pixels[o + 1] = color[1];
      pixels[o + 2] = color[2];
      pixels[o + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

// ---- Clouds, Moon, Sun glow -----------------------------------------------------------

// Renders an equirectangular sphere texture by sampling `pixelAt(x, y, z)` (a point on
// the unit sphere) for each pixel. `pixelAt` returns [r, g, b] or [r, g, b, a] (0-255).
function sphereTexture(width, height, pixelAt) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(width, height);
  const pixels = image.data;

  let i = 0;
  for (let row = 0; row < height; row++) {
    const latitude = (0.5 - (row + 0.5) / height) * Math.PI;
    const cosLat = Math.cos(latitude),
      sinLat = Math.sin(latitude);
    for (let col = 0; col < width; col++) {
      const longitude = ((col + 0.5) / width) * Math.PI * 2;
      const [r, g, b, a] = pixelAt(
        cosLat * Math.cos(longitude),
        sinLat,
        cosLat * Math.sin(longitude),
      );
      pixels[i++] = r;
      pixels[i++] = g;
      pixels[i++] = b;
      pixels[i++] = a ?? 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function cloudTexture() {
  return sphereTexture(1024, 512, (x, y, z) => {
    const density = fractalNoise(x * 3.2 + 90, y * 3.2 + 90, z * 3.2 + 90, 4);
    return [255, 255, 255, Math.round(clamp01((density - 0.53) * 4) * 200)];
  });
}

export function moonTexture() {
  const width = 1024,
    height = 512;
  const canvas = sphereTexture(width, height, (x, y, z) => {
    const surfaceNoise = fractalNoise(x * 3 + 5, y * 3 + 5, z * 3 + 5, 5);
    const mareDarkening = clamp01(
      (fractalNoise(x * 1.3 + 30, y * 1.3 + 30, z * 1.3 + 30, 3) - 0.5) * 6,
    );
    const brightness = (128 + (surfaceNoise - 0.5) * 120) * (1 - 0.3 * mareDarkening);
    return [brightness * 1.02, brightness, brightness * 0.96];
  });

  const ctx = canvas.getContext("2d");
  const CRATER_COUNT = 260;
  for (let i = 0; i < CRATER_COUNT; i++) {
    const x = Math.random() * width;
    const y = height * (0.1 + 0.8 * Math.random());
    const radius = 2 + Math.pow(Math.random(), 3) * 22;

    const shadow = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius);
    shadow.addColorStop(0, "rgba(0,0,0,0.34)");
    shadow.addColorStop(0.75, "rgba(0,0,0,0.12)");
    shadow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = Math.max(0.6, radius * 0.08);
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.82, 0, Math.PI * 2);
    ctx.stroke();
  }

  return canvas;
}

export function sunGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,246,220,1)");
  gradient.addColorStop(0.18, "rgba(255,226,160,0.55)");
  gradient.addColorStop(0.5, "rgba(255,190,90,0.12)");
  gradient.addColorStop(1, "rgba(255,170,60,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return canvas;
}
