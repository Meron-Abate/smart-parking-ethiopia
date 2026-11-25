export const ADDIS_TZ = "Africa/Addis_Ababa";

/** Storage is UTC; this is the ONLY place that turns an instant into local display text. */
export const formatLocal = (d: Date, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }): string =>
  new Intl.DateTimeFormat("en-GB", { timeZone: ADDIS_TZ, ...opts }).format(d);

/**
 * Africa/Addis_Ababa is UTC+3 all year (no daylight saving). Used for opening-hours arithmetic,
 * which is stored as LOCAL minutes after midnight. If the platform ever serves another timezone,
 * replace this with per-facility `timezone` handling.
 */
export const ADDIS_OFFSET_MIN = 180;

/** Local (Addis) day-of-week (0 = Sunday) and minute-of-day for a UTC instant. */
export function localParts(d: Date): { dow: number; minute: number } {
  const local = new Date(d.getTime() + ADDIS_OFFSET_MIN * 60_000);
  return { dow: local.getUTCDay(), minute: local.getUTCHours() * 60 + local.getUTCMinutes() };
}
