// Extracted from src/scene.js. Assumes $(), trueScale, AU_KM, EARTH_RADIUS_KM
// (these would need to be re-exported from astronomy.js -- see README.md),
// formatFullDate/formatUtcDate/formatInteger (ui.js.snippet.js), and `astro`
// (the per-frame computeAstronomy() result) from the scene.js this was cut from.
// astro.sun and astro.moon (the raw sunPosition()/moonPosition() results) were
// also needed here -- by the time this comes back, computeAstronomy() in the live
// scene.js will likely only be keeping a trimmed-down `astro` shape, so this will
// need rewiring, not just pasting back in.

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

// Called from inside renderFrame()'s periodic-update block (originally throttled
// to every ~200ms alongside updateCards()):
//   updateReadouts();
