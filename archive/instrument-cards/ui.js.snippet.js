// Extracted from src/ui.js. normalizeDegrees (imported from ./astronomy.js in the
// live file) and BOSTON_TZ are the only outside names these relied on.

export const formatShortDate = new Intl.DateTimeFormat("en-US", {
  timeZone: BOSTON_TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
export const formatClockTime = new Intl.DateTimeFormat("en-US", {
  timeZone: BOSTON_TZ,
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

// SVG path for the lit part of a disc of radius `r` centered at (cx, cy), given the
// Moon-Sun elongation `elongationDeg` (0 = new, 180 = full). Draws two arcs: the full
// circle's edge and an ellipse representing the terminator (the light/dark boundary),
// foreshortened by how face-on the Sun is.
export function litDiscPath(cx, cy, r, elongationDeg) {
  const waxing = elongationDeg < 180;
  const terminatorRadius = r * Math.abs(Math.cos(elongationDeg * (Math.PI / 180)));
  const isCrescent = elongationDeg < 90 || elongationDeg > 270;

  const edgeSweep = waxing ? 1 : 0;
  const terminatorSweep = waxing ? (isCrescent ? 0 : 1) : isCrescent ? 1 : 0;
  return (
    `M${cx} ${cy - r}` +
    `A${r} ${r} 0 0 ${edgeSweep} ${cx} ${cy + r}` +
    `A${terminatorRadius.toFixed(2)} ${r} 0 0 ${terminatorSweep} ${cx} ${cy - r}Z`
  );
}

export function moonPhaseName(elongationDeg) {
  if (elongationDeg < 10 || elongationDeg >= 350) return "New moon";
  if (elongationDeg < 80) return "Waxing crescent";
  if (elongationDeg < 100) return "First quarter";
  if (elongationDeg < 170) return "Waxing gibbous";
  if (elongationDeg < 190) return "Full moon";
  if (elongationDeg < 260) return "Waning gibbous";
  if (elongationDeg < 280) return "Last quarter";
  return "Waning crescent";
}

// Sky color stops as [sunAltitudeDeg, topColor, bottomColor], from midday down through
// sunset to full night. skyColorsAt() interpolates between adjacent stops.
const SKY_STOPS = [
  [10, [63, 143, 224], [168, 214, 247]],
  [0, [44, 63, 122], [240, 154, 88]],
  [-6, [26, 37, 80], [85, 69, 111]],
  [-18, [5, 8, 22], [13, 20, 48]],
];

function mixColor(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function skyColorsAt(sunAltitudeDeg) {
  const brightest = SKY_STOPS[0];
  if (sunAltitudeDeg >= brightest[0]) return { top: brightest[1], bottom: brightest[2] };

  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    const brighter = SKY_STOPS[i],
      darker = SKY_STOPS[i + 1];
    if (sunAltitudeDeg >= darker[0]) {
      const t = (sunAltitudeDeg - darker[0]) / (brighter[0] - darker[0]);
      return {
        top: mixColor(darker[1], brighter[1], t),
        bottom: mixColor(darker[2], brighter[2], t),
      };
    }
  }

  const darkest = SKY_STOPS[SKY_STOPS.length - 1];
  return { top: darkest[1], bottom: darkest[2] };
}

export function rgbCss([r, g, b]) {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

export function compassDirection(azimuthDeg) {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return points[Math.round(normalizeDegrees(azimuthDeg) / 45) % 8];
}
