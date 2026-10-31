// Extracted from src/scene.js. Assumes $(), BOSTON_LATITUDE/BOSTON_LONGITUDE
// (stayed -- still used for the Boston marker), simulatedMs, astro, and the
// litDiscPath/moonPhaseName/skyColorsAt/rgbCss/compassDirection/formatShortDate/
// formatClockTime imports (ui.js.snippet.js) and nextMoonPhase/moonSunElongation
// (astronomy.js.snippet.js) from the scene.js this was cut from.

// ---- card DOM refs, captured alongside the other element refs ----
//
// const phaseLitPath = $("phase-lit");
// const skyMoonLitPath = $("sky-moon-lit");
// const skySunGroup = $("sky-sun");
// const skyMoonGroup = $("sky-moon");
// const skyTopStop = $("sky-top");
// const skyBottomStop = $("sky-bot");

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

// Called: once up front (alongside computeAstronomy()) and then every ~200ms from
// inside renderFrame()'s periodic-update block, alongside updateReadouts()
// (archive/scientific-text/).

// ---- the portion of computeAstronomy() that only existed to feed this card ----
//
// Before archiving, computeAstronomy() looked like this (astro.sun/astro.moon,
// needed elsewhere too, are omitted here -- see the live scene.js for what
// computeAstronomy() returns now):
//
// function computeAstronomy() {
//   const jd = julianDateFromUnixMs(simulatedMs);
//   const sun = sunPosition(jd);
//   const moonEcliptic = moonPosition(jd);
//   const siderealDeg = greenwichSiderealTime(jd);
//   const obliquityDeg = obliquityOfEcliptic(jd);
//
//   const sunScenePos = vecFromArray(
//     eclipticToScene(sun.longitude, 0, sun.distanceAu * AU_IN_EARTH_RADII),
//   );
//   const moonScenePos = vecFromArray(
//     eclipticToScene(moonEcliptic.longitude, moonEcliptic.latitude, moonEcliptic.distanceEarthRadii),
//   );
//
//   // Phase angle (Sun-Moon-Earth) from the Moon's point of view, to find how much
//   // of the near side is lit.
//   const moonToSun = sunScenePos.clone().sub(moonScenePos);
//   const cosPhaseAngle =
//     -moonScenePos.dot(moonToSun) / (moonScenePos.length() * moonToSun.length());
//
//   const frameNow = observerFrame(BOSTON_LATITUDE, BOSTON_LONGITUDE, siderealDeg, obliquityDeg);
//   // A frame one minute later, just to tell whether the Sun is rising or setting.
//   const jdSoon = jd + 1 / 1440;
//   const frameSoon = observerFrame(
//     BOSTON_LATITUDE,
//     BOSTON_LONGITUDE,
//     greenwichSiderealTime(jdSoon),
//     obliquityOfEcliptic(jdSoon),
//   );
//
//   const sunVec = [sunScenePos.x, sunScenePos.y, sunScenePos.z];
//   const sunAltAz = altitudeAzimuth(frameNow, sunVec);
//   // The Moon's position relative to the observer, not the Earth's center.
//   const moonTopocentric = [
//     moonScenePos.x - frameNow.up[0],
//     moonScenePos.y - frameNow.up[1],
//     moonScenePos.z - frameNow.up[2],
//   ];
//
//   astro = {
//     jd, siderealDeg, obliquityDeg, sunScenePos, moonScenePos, sun, moon: moonEcliptic,
//     elongationDeg: moonSunElongation(jd),
//     illuminatedFraction: (1 + cosPhaseAngle) / 2,
//     sunAltAz,
//     moonAltAz: altitudeAzimuth(frameNow, moonTopocentric),
//     sunIsRising: altitudeAzimuth(frameSoon, sunVec).alt > sunAltAz.alt,
//   };
// }
