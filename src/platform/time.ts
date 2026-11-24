export const ADDIS_TZ = "Africa/Addis_Ababa";

/** Storage is UTC; this is the ONLY place that turns an instant into local display text. */
export const formatLocal = (d: Date, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }): string =>
  new Intl.DateTimeFormat("en-GB", { timeZone: ADDIS_TZ, ...opts }).format(d);
