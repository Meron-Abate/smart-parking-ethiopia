import { describe, expect, it } from "vitest";
import {
  facilityCreateSchema, hoursSchema, policiesSchema, pricingRulesSchema, spacesCreateSchema,
} from "@/modules/facilities/schemas";
import { nextFacilityStatus } from "@/modules/facilities/transitions";

const facility = {
  name: "Bole Lot", type: "MALL", address: "Bole Road", latitude: 8.99, longitude: 38.78,
};

describe("facility schema", () => {
  it("accepts a valid facility and defaults to individual spaces", () => {
    const r = facilityCreateSchema.parse(facility);
    expect(r.inventoryModel).toBe("INDIVIDUAL_SPACES");
  });
  it("rejects swapped lat/lng (outside Ethiopia)", () => {
    expect(facilityCreateSchema.safeParse({ ...facility, latitude: 38.78, longitude: 8.99 }).success).toBe(false);
  });
  it("requires capacity for capacity-based facilities", () => {
    expect(facilityCreateSchema.safeParse({ ...facility, inventoryModel: "CAPACITY_BASED" }).success).toBe(false);
    expect(facilityCreateSchema.safeParse({ ...facility, inventoryModel: "CAPACITY_BASED", totalCapacity: 20 }).success).toBe(true);
  });
  it("ignores a client-supplied status (mass assignment)", () => {
    expect(facilityCreateSchema.parse({ ...facility, status: "APPROVED" })).not.toHaveProperty("status");
  });
});

describe("operating hours", () => {
  it("accepts valid hours", () => {
    expect(hoursSchema.safeParse([{ dayOfWeek: 1, opensMinute: 480, closesMinute: 1320 }]).success).toBe(true);
  });
  it("rejects closing before opening and duplicate days", () => {
    expect(hoursSchema.safeParse([{ dayOfWeek: 1, opensMinute: 600, closesMinute: 500 }]).success).toBe(false);
    const d = { dayOfWeek: 2, opensMinute: 0, closesMinute: 600 };
    expect(hoursSchema.safeParse([d, d]).success).toBe(false);
  });
});

describe("pricing, policies, spaces", () => {
  it("rejects negative or fractional money", () => {
    expect(pricingRulesSchema.safeParse([{ firstUnitCents: -1, additionalUnitCents: 0 }]).success).toBe(false);
    expect(pricingRulesSchema.safeParse([{ firstUnitCents: 10.5, additionalUnitCents: 0 }]).success).toBe(false);
    expect(pricingRulesSchema.safeParse([{ firstUnitCents: 3000, additionalUnitCents: 2500 }]).success).toBe(true);
  });
  it("rejects max duration below min duration", () => {
    const base = {
      reservation: { depositPercent: 20, graceMinutes: 15, minAdvanceMinutes: 0, maxAdvanceDays: 7, minDurationMinutes: 60, maxDurationMinutes: 30,
        allowExtensions: true, allowGraceExtension: false, depositRefundableOnEarlyExit: false, extensionGraceMinutes: 15 },
      cancellation: { freeCancelBeforeMinutes: 60, refundPercentBefore: 100, refundPercentAfter: 0, noShowFeeCents: 0, forfeitDepositOnNoShow: true },
    };
    expect(policiesSchema.safeParse(base).success).toBe(false);
  });
  it("supports single and bulk space creation, capped at 200", () => {
    expect(spacesCreateSchema.safeParse({ zoneId: "z", label: "A1" }).success).toBe(true);
    expect(spacesCreateSchema.safeParse({ zoneId: "z", prefix: "A", count: 10 }).success).toBe(true);
    expect(spacesCreateSchema.safeParse({ zoneId: "z", prefix: "A", count: 201 }).success).toBe(false);
  });
});

describe("facility status transitions", () => {
  it("allows the documented moves", () => {
    expect(nextFacilityStatus("PENDING_APPROVAL", "approve")).toBe("APPROVED");
    expect(nextFacilityStatus("PENDING_APPROVAL", "reject")).toBe("REJECTED");
    expect(nextFacilityStatus("APPROVED", "suspend")).toBe("SUSPENDED");
    expect(nextFacilityStatus("SUSPENDED", "approve")).toBe("APPROVED");
    expect(nextFacilityStatus("REJECTED", "resubmit")).toBe("PENDING_APPROVAL");
  });
  it.each([
    ["APPROVED", "approve"], ["REJECTED", "approve"], ["APPROVED", "reject"], ["PENDING_APPROVAL", "suspend"], ["APPROVED", "resubmit"],
  ] as const)("refuses %s -> %s", (s, a) => expect(() => nextFacilityStatus(s, a)).toThrow(/Cannot/));
});
