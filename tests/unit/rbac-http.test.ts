import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { CAPABILITIES, can, assertCan, type Capability } from "@/modules/rbac/policy";
import { assertSameOrigin } from "@/platform/http";
import { rateLimit, resetRateLimits } from "@/platform/rate-limit";
import { AppError } from "@/platform/errors";

describe("capability matrix", () => {
  it("only SUPER_ADMIN can approve facilities (test #26)", () => {
    for (const role of ["DRIVER", "ATTENDANT", "FACILITY_ADMIN"] as const) {
      expect(can(role, "facility.approve")).toBe(false);
    }
    expect(can("SUPER_ADMIN", "facility.approve")).toBe(true);
  });
  it("attendants have no financial or platform capabilities (test #24)", () => {
    for (const c of ["finance.view", "platform.admin", "facility.manage", "staff.manage"] as Capability[]) {
      expect(can("ATTENDANT", c)).toBe(false);
    }
    expect(can("ATTENDANT", "attendant.operate")).toBe(true);
  });
  it("drivers have no administrative capabilities (test #25)", () => {
    const admin = Object.keys(CAPABILITIES).filter((c) => c !== "booking.create" && c !== "vehicle.manage") as Capability[];
    for (const c of admin) expect(can("DRIVER", c)).toBe(false);
  });
  it("assertCan throws FORBIDDEN", () => {
    expect(() => assertCan("DRIVER", "platform.admin")).toThrowError(AppError);
  });
});

describe("CSRF origin check", () => {
  const req = (method: string, origin?: string) =>
    new NextRequest("http://localhost:3000/api/x", { method, headers: origin ? { origin } : {} });
  it("allows GET without origin", () => expect(() => assertSameOrigin(req("GET"))).not.toThrow());
  it("allows same-origin POST", () => expect(() => assertSameOrigin(req("POST", "http://localhost:3000"))).not.toThrow());
  it("rejects cross-origin POST", () => expect(() => assertSameOrigin(req("POST", "https://evil.example"))).toThrow(/Cross-origin/));
  it("rejects POST with no Origin header", () => expect(() => assertSameOrigin(req("POST"))).toThrow(AppError));
});

describe("rate limiter", () => {
  it("blocks after the limit and recovers after the window", () => {
    resetRateLimits();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) rateLimit("k", 3, 1000, t0);
    expect(() => rateLimit("k", 3, 1000, t0 + 1)).toThrow(AppError);
    expect(() => rateLimit("k", 3, 1000, t0 + 1001)).not.toThrow();
  });
});
