// Extracted from src/ui.js. Only used by updateReadouts() (see scene.js.snippet.js).
// BOSTON_TZ was a module-level const this relied on: const BOSTON_TZ = "America/New_York";

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
export const formatUtcDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatInteger(n) {
  return Math.round(n).toLocaleString("en-US");
}
