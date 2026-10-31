// Pure display logic for Boston local time: turning a Unix timestamp into (and back
// from) the wall-clock fields the date picker works in. Nothing here touches Three.js
// or holds state across frames.

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
