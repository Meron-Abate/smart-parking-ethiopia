import { describe, expect, it } from "vitest";
import { peakLoad, type Interval } from "@/modules/reservations/availability";
import { applyReservationAction } from "@/modules/reservations/transitions";
import { cancellationRefundCents, isExclusionViolation } from "@/modules/reservations/service";
import { createReservationSchema } from "@/modules/reservations/schemas";
import { vehicleSchema } from "@/modules/vehicles/schemas";

const t = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 23, h, m));
const iv = (a: number, b: number, units = 1): Interval => ({ start: t(a), end: t(b), units });

describe("peakLoad (capacity accounting)", () => {
  it("is the highest concurrent load, not the number of overlapping bookings", () => {
    // 9-10 and 10-11 never overlap each other, so a 9-11 request only ever sees 1 busy unit
    expect(peakLoad([iv(9, 10), iv(10, 11)], t(9), t(11))).toBe(1);
    expect(peakLoad([iv(9, 11), iv(9, 10)], t(9), t(11))).toBe(2);
  });
  it("ignores intervals outside the window and clips to it", () => {
    expect(peakLoad([iv(6, 8), iv(12, 14)], t(9), t(11))).toBe(0);
    expect(peakLoad([iv(8, 9, 5)], t(9), t(11))).toBe(0); // ends exactly at window start
    expect(peakLoad([iv(8, 10)], t(9), t(11))).toBe(1); // started earlier, still counts
    expect(peakLoad([iv(11, 12)], t(9), t(11))).toBe(0); // starts exactly at window end
  });
  it("adds multi-unit maintenance blocks", () => {
    expect(peakLoad([iv(9, 10, 3), iv(9, 11)], t(9), t(11))).toBe(4);
  });
});

describe("reservation state machine", () => {
  it("allows only the documented transitions", () => {
    expect(applyReservationAction("PENDING_PAYMENT", "confirm")).toEqual({ status: "CONFIRMED", blocksInventory: true });
    expect(applyReservationAction("PENDING_PAYMENT", "expire")).toEqual({ status: "EXPIRED", blocksInventory: false });
    expect(applyReservationAction("CONFIRMED", "cancel")).toEqual({ status: "CANCELLED", blocksInventory: false });
    expect(applyReservationAction("CONFIRMED", "noShow")).toEqual({ status: "NO_SHOW", blocksInventory: false });
  });
  it("refuses everything else", () => {
    for (const s of ["EXPIRED", "CANCELLED", "COMPLETED", "NO_SHOW", "ACTIVE"] as const) {
      expect(() => applyReservationAction(s, "confirm")).toThrow();
      expect(() => applyReservationAction(s, "cancel")).toThrow();
    }
    expect(() => applyReservationAction("PENDING_PAYMENT", "noShow")).toThrow();
    expect(() => applyReservationAction("CONFIRMED", "expire")).toThrow();
  });
});

describe("cancellation refund", () => {
  const snap = { cancellation: { freeCancelBeforeMinutes: 60, refundPercentBefore: 100, refundPercentAfter: 25 } };
  const r = (status: string) => ({ status, startAt: t(12), depositCents: 10001, policySnapshot: snap });
  it("refunds nothing for an unpaid hold", () => expect(cancellationRefundCents(r("PENDING_PAYMENT"), t(8))).toBe(0));
  it("refunds the policy percentage before / after the free-cancel deadline", () => {
    expect(cancellationRefundCents(r("CONFIRMED"), t(10, 59))).toBe(10001);
    expect(cancellationRefundCents(r("CONFIRMED"), t(11))).toBe(10001); // exactly at the deadline is still free
    expect(cancellationRefundCents(r("CONFIRMED"), t(11, 1))).toBe(2500); // rounded half-up, integer santim
  });
});

describe("input contracts", () => {
  it("reservation input cannot carry price, status or ownership fields", () => {
    const parsed = createReservationSchema.parse({
      facilityId: "f", vehicleId: "v", startAt: "2026-11-23T08:00:00Z", durationMinutes: 60,
      estimatedFeeCents: 1, depositCents: 0, status: "CONFIRMED", userId: "someone-else", blocksInventory: false, holdExpiresAt: "2099-01-01T00:00:00Z",
    });
    expect(Object.keys(parsed).sort()).toEqual(["durationMinutes", "facilityId", "startAt", "vehicleId"]);
  });
  it("normalises plates and rejects junk", () => {
    expect(vehicleSchema.parse({ plateNumber: " aa 12345 " }).plateNumber).toBe("AA12345");
    expect(vehicleSchema.safeParse({ plateNumber: "ab" }).success).toBe(false);
    expect(vehicleSchema.safeParse({ plateNumber: "AA<script>" }).success).toBe(false);
  });
  it("recognises exclusion-constraint errors", () => {
    expect(isExclusionViolation(new Error('conflicting key value violates exclusion constraint "Reservation_no_space_overlap"'))).toBe(true);
    expect(isExclusionViolation({ meta: { code: "23P01" } })).toBe(true);
    expect(isExclusionViolation(new Error("something else"))).toBe(false);
  });
});
