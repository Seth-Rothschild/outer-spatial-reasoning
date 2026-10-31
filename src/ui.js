// Pure display logic: turning simulation state into the strings, SVG paths and colors
// the page shows. Nothing here touches Three.js or holds state across frames.

import { normalizeDegrees } from "./astronomy.js";

// ---- Boston local time --------------------------------------------------------------
// The date picker works in Boston time, so we convert between a Unix timestamp and
// Boston's wall-clock fields by asking Intl for the offset and correcting for DST.

const BOSTON_TZ = "America/New_York";

function bostonTimeParts(unixMs) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BOSTON_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = {};
  for (const { type, value } of formatter.formatToParts(new Date(unixMs))) parts[type] = value;
  return parts;
}

function bostonOffsetMs(unixMs) {
  const parts = bostonTimeParts(unixMs);
  const asIfUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour,
    +parts.minute,
    +parts.second,
  );
  return asIfUtc - Math.floor(unixMs / 1000) * 1000;
}

// Converts Boston wall-clock fields to a Unix timestamp, resolving DST by checking
// the offset twice (once with a guess, once with the offset that guess implies).
export function bostonTimeToUnixMs(year, month, day, hour, minute) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset = bostonOffsetMs(guess);
  const corrected = guess - offset;
  const offsetAtCorrected = bostonOffsetMs(corrected);
  return offsetAtCorrected === offset ? corrected : guess - offsetAtCorrected;
}

// Formats a Unix timestamp for the <input type="datetime-local"> in the date bar.
export function unixMsToDatetimeInput(unixMs) {
  const p = bostonTimeParts(unixMs);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export const formatFullDate = new Intl.DateTimeFormat("en-US", {
  timeZone: BOSTON_TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});
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
export const formatUtcDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// ---- Moon phase ------------------------------------------------------------------------

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

// ---- Boston sky ------------------------------------------------------------------------

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

export function formatInteger(n) {
  return Math.round(n).toLocaleString("en-US");
}
