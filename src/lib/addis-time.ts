/** Client+server safe helpers for <input type="datetime-local"> in Addis Ababa time (UTC+3, no DST). */
const OFFSET_MS = 3 * 3_600_000;

/** Date -> "YYYY-MM-DDTHH:mm" as seen on a clock in Addis Ababa. */
export const toAddisInput = (d: Date): string => new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 16);

/** "YYYY-MM-DDTHH:mm" typed in Addis time -> ISO instant. Null when invalid. */
export function fromAddisInput(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const fmtAddis = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
