import type { VehicleType } from "@prisma/client";
import { selectRule, type PricingRuleLike } from "@/modules/pricing/calculate";
import { isOpenForWindow, type HoursRow } from "./hours";

export interface BookableFacility<R extends PricingRuleLike = PricingRuleLike> {
  is24Hours: boolean;
  hours: HoursRow[];
  pricingRules: R[];
  reservationPolicy: {
    minDurationMinutes: number;
    maxDurationMinutes: number;
    minAdvanceMinutes: number;
    maxAdvanceDays: number;
  } | null;
}

export type RuleCheck<R> =
  | { ok: true; rule: R }
  | { ok: false; status: "CLOSED" | "NOT_BOOKABLE" | "NO_PRICE"; reason: string };

/**
 * The ONE place that decides whether a stay is allowed by a facility's own rules
 * (opening hours, stay length, advance-booking window, price for the vehicle).
 * Discovery uses it to label results; reservation creation uses it to enforce them.
 */
export function checkBookingRules<R extends PricingRuleLike>(
  f: BookableFacility<R>,
  vehicleType: VehicleType,
  start: Date,
  durationMinutes: number,
  now: Date,
): RuleCheck<R> {
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const p = f.reservationPolicy;
  const lead = (start.getTime() - now.getTime()) / 60_000;
  if (!isOpenForWindow(f.is24Hours, f.hours, start, end)) return { ok: false, status: "CLOSED", reason: "Closed for part or all of your stay." };
  if (p && (durationMinutes < p.minDurationMinutes || durationMinutes > p.maxDurationMinutes))
    return { ok: false, status: "NOT_BOOKABLE", reason: `Stay must be ${p.minDurationMinutes}–${p.maxDurationMinutes} minutes here.` };
  if (p && lead < p.minAdvanceMinutes) return { ok: false, status: "NOT_BOOKABLE", reason: `Must be booked at least ${p.minAdvanceMinutes} minutes ahead.` };
  if (p && lead > p.maxAdvanceDays * 1440) return { ok: false, status: "NOT_BOOKABLE", reason: `Can be booked at most ${p.maxAdvanceDays} days ahead.` };
  const rule = selectRule(f.pricingRules, vehicleType);
  if (!rule) return { ok: false, status: "NO_PRICE", reason: "No price is set for this vehicle type." };
  return { ok: true, rule };
}
