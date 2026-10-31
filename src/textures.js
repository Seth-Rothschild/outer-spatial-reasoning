// The Sun's glow: the one texture still drawn procedurally rather than from a photo
// (see bodyTextures.js for the rest) -- it's an artistic bloom effect, not a surface.

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
