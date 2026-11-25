import { ADDIS_OFFSET_MIN, localParts } from "@/platform/time";

export interface HoursRow {
  dayOfWeek: number;
  opensMinute: number;
  closesMinute: number;
}

/**
 * True when the facility is open for the WHOLE stay [start, end). Hours are local minutes after midnight;
 * the stay is split at local midnights and each day-segment must fall inside that day's opening hours.
 * Facilities without any hours row for a day are treated as closed that day.
 */
export function isOpenForWindow(is24Hours: boolean, hours: HoursRow[], start: Date, end: Date): boolean {
  if (is24Hours) return true;
  const DAY_MS = 86_400_000;
  let cursor = start.getTime();
  const endMs = end.getTime();
  while (cursor < endMs) {
    const { dow, minute } = localParts(new Date(cursor));
    // next local midnight, as a UTC instant
    const localMs = cursor + ADDIS_OFFSET_MIN * 60_000;
    const nextMidnight = (Math.floor(localMs / DAY_MS) + 1) * DAY_MS - ADDIS_OFFSET_MIN * 60_000;
    const segEnd = Math.min(endMs, nextMidnight);
    const segEndMinute = segEnd === nextMidnight ? 1440 : localParts(new Date(segEnd)).minute;
    const row = hours.find((h) => h.dayOfWeek === dow);
    if (!row || row.opensMinute > minute || row.closesMinute < segEndMinute) return false;
    cursor = segEnd;
  }
  return true;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Human label for the day of `at`, e.g. "08:00–20:00", "24 hours", "Closed". */
export function hoursLabel(is24Hours: boolean, hours: HoursRow[], at: Date): string {
  if (is24Hours) return "24 hours";
  const row = hours.find((h) => h.dayOfWeek === localParts(at).dow);
  return row ? `${hhmm(row.opensMinute)}–${row.closesMinute === 1440 ? "24:00" : hhmm(row.closesMinute)}` : "Closed";
}
