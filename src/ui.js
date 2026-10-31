// Pure display logic: turning a Unix timestamp into the wall-clock fields the date
// picker works in (and back), a human-readable date/time string, and the SVG path for
// the Moon's current lit phase. Nothing here touches Three.js or holds state across
// frames.

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

// The date/time shown at the top of the page, e.g. "Fri, Oct 30, 2026, 8:36:05 PM EDT".
export const formatFullDate = new Intl.DateTimeFormat("en-US", {
  timeZone: BOSTON_TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short",
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
