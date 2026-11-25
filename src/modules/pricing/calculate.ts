import type { PricingUnit, RoundingMode, VehicleType } from "@prisma/client";

export interface PricingRuleLike {
  vehicleType: VehicleType | null;
  unit: PricingUnit;
  firstUnitCents: number;
  additionalUnitCents: number;
  minimumChargeCents: number;
  dailyCapCents: number | null;
  rounding: RoundingMode;
  priority: number;
  active: boolean;
}

/**
 * Pick the rule that applies to a vehicle: a vehicle-specific rule beats an "all vehicles" rule,
 * then higher priority wins. Returns null when no active rule applies.
 * LIMITATION: weekday/time-band columns (dayOfWeekMask/startMinute/endMinute) are not evaluated yet;
 * the facility form does not expose them. When it does, selection must take the stay window into account.
 */
export function selectRule<T extends PricingRuleLike>(rules: T[], vehicleType: VehicleType): T | null {
  const applicable = rules.filter((r) => r.active && (r.vehicleType === null || r.vehicleType === vehicleType));
  applicable.sort((a, b) => Number(b.vehicleType === vehicleType) - Number(a.vehicleType === vehicleType) || b.priority - a.priority);
  return applicable[0] ?? null;
}

const ROUND_TO: Record<RoundingMode, number> = { NONE: 1, UP_TO_HOUR: 60, UP_TO_30_MIN: 30, UP_TO_15_MIN: 15 };
const DAY = 1440;

/**
 * Server-side fee estimate in integer santim for a stay of `minutes`.
 * HOURLY: first hour at firstUnitCents, then additionalUnitCents per hour, prorated by the rounding step.
 * DAILY: first day at firstUnitCents, then additionalUnitCents per started day.
 * dailyCap applies per started 24h block; minimumCharge applies to the total.
 */
export function estimateFeeCents(rule: PricingRuleLike, minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  if (rule.unit === "DAILY") {
    const days = Math.ceil(minutes / DAY);
    return Math.max(rule.firstUnitCents + (days - 1) * rule.additionalUnitCents, rule.minimumChargeCents);
  }
  const step = ROUND_TO[rule.rounding];
  const billable = Math.ceil(minutes / step) * step;
  const feeFor = (m: number) => (m <= 60 ? rule.firstUnitCents : rule.firstUnitCents + Math.round((rule.additionalUnitCents * (m - 60)) / 60));
  const capped = (m: number) => (rule.dailyCapCents == null ? feeFor(m) : Math.min(feeFor(m), rule.dailyCapCents));
  const fullDays = rule.dailyCapCents == null ? 0 : Math.floor(billable / DAY);
  const rem = rule.dailyCapCents == null ? billable : billable - fullDays * DAY;
  const total = fullDays * capped(DAY) + (rem > 0 ? capped(rem) : 0);
  return Math.max(total, rule.minimumChargeCents);
}
