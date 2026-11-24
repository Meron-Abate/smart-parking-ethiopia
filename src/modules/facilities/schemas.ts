import { z } from "zod";
import { FacilityType, InventoryModel, PricingUnit, RoundingMode, SpaceStatus, VehicleType } from "@prisma/client";
import { registerSchema } from "@/modules/auth/schemas";

// Ethiopia bounding box: catches swapped lat/lng and typos without needing a boundary dataset.
export const latitude = z.number().min(3.4).max(14.9);
export const longitude = z.number().min(33).max(48);

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

export const facilityCreateSchema = z
  .object({
    organizationId: z.string().optional(),
    name: z.string().trim().min(2).max(120),
    description: optionalText(2000),
    type: z.enum(FacilityType),
    address: z.string().trim().min(3).max(300),
    subCity: optionalText(80),
    neighborhood: optionalText(80),
    latitude,
    longitude,
    contactPhone: optionalText(30),
    contactEmail: z.string().trim().email().optional().or(z.literal("").transform(() => undefined)),
    inventoryModel: z.enum(InventoryModel).default("INDIVIDUAL_SPACES"),
    totalCapacity: z.number().int().min(0).max(5000).default(0),
    isCovered: z.boolean().default(false),
    isIndoor: z.boolean().default(false),
    is24Hours: z.boolean().default(false),
    features: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  })
  .refine((v) => v.inventoryModel !== "CAPACITY_BASED" || v.totalCapacity > 0, {
    message: "Capacity-based facilities need a capacity greater than 0",
    path: ["totalCapacity"],
  });

// inventoryModel and organization are fixed after creation.
export const facilityUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: optionalText(2000),
    type: z.enum(FacilityType),
    address: z.string().trim().min(3).max(300),
    subCity: optionalText(80),
    neighborhood: optionalText(80),
    latitude,
    longitude,
    contactPhone: optionalText(30),
    contactEmail: z.string().trim().email().optional(),
    totalCapacity: z.number().int().min(0).max(5000),
    isCovered: z.boolean(),
    isIndoor: z.boolean(),
    is24Hours: z.boolean(),
    features: z.array(z.string().trim().min(1).max(40)).max(20),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const facilityListQuery = z.object({
  status: z.enum(["PENDING_APPROVAL", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const organizationRegisterSchema = z.object({
  organization: z.object({
    name: z.string().trim().min(2).max(120),
    legalName: optionalText(160),
    taxId: optionalText(40),
    email: z.string().trim().email().optional(),
    phone: optionalText(30),
  }),
  admin: registerSchema,
});

export const hoursSchema = z
  .array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      opensMinute: z.number().int().min(0).max(1439),
      closesMinute: z.number().int().min(1).max(1440),
    }),
  )
  .max(7)
  .superRefine((rows, ctx) => {
    const seen = new Set<number>();
    rows.forEach((r, i) => {
      if (r.closesMinute <= r.opensMinute) ctx.addIssue({ code: "custom", path: [i, "closesMinute"], message: "Closing time must be after opening time" });
      if (seen.has(r.dayOfWeek)) ctx.addIssue({ code: "custom", path: [i, "dayOfWeek"], message: "Duplicate day" });
      seen.add(r.dayOfWeek);
    });
  });

const cents = z.number().int().min(0).max(100_000_00);

export const pricingRulesSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(60).default("Standard"),
      vehicleType: z.enum(VehicleType).nullable().default(null),
      unit: z.enum(PricingUnit).default("HOURLY"),
      firstUnitCents: cents,
      additionalUnitCents: cents,
      minimumChargeCents: cents.default(0),
      dailyCapCents: cents.nullable().default(null),
      rounding: z.enum(RoundingMode).default("UP_TO_HOUR"),
      active: z.boolean().default(true),
    }),
  )
  .max(10);

export const policiesSchema = z.object({
  reservation: z
    .object({
      depositPercent: z.number().int().min(0).max(100),
      graceMinutes: z.number().int().min(0).max(120),
      minAdvanceMinutes: z.number().int().min(0).max(1440),
      maxAdvanceDays: z.number().int().min(0).max(90),
      minDurationMinutes: z.number().int().min(15).max(1440),
      maxDurationMinutes: z.number().int().min(15).max(10080),
      allowExtensions: z.boolean(),
      allowGraceExtension: z.boolean(),
      depositRefundableOnEarlyExit: z.boolean(),
      extensionGraceMinutes: z.number().int().min(0).max(120),
    })
    .refine((v) => v.maxDurationMinutes >= v.minDurationMinutes, { message: "Max duration must be >= min duration", path: ["maxDurationMinutes"] }),
  cancellation: z.object({
    freeCancelBeforeMinutes: z.number().int().min(0).max(10080),
    refundPercentBefore: z.number().int().min(0).max(100),
    refundPercentAfter: z.number().int().min(0).max(100),
    noShowFeeCents: cents,
    forfeitDepositOnNoShow: z.boolean(),
  }),
});

export const floorSchema = z.object({ name: z.string().trim().min(1).max(40), level: z.number().int().min(-10).max(100).default(0) });
export const zoneSchema = z.object({ floorId: z.string().min(1), name: z.string().trim().min(1).max(40) });

const spaceCommon = {
  zoneId: z.string().min(1),
  vehicleTypes: z.array(z.enum(VehicleType)).min(1).default(["SEDAN", "SUV"]),
  isCovered: z.boolean().default(false),
};
export const spacesCreateSchema = z.union([
  z.object({ ...spaceCommon, label: z.string().trim().min(1).max(20) }),
  z.object({
    ...spaceCommon,
    prefix: z.string().trim().max(10).default(""),
    from: z.number().int().min(0).max(9999).default(1),
    count: z.number().int().min(1).max(200),
  }),
]);

export const spaceUpdateSchema = z
  .object({
    label: z.string().trim().min(1).max(20),
    status: z.enum(SpaceStatus),
    vehicleTypes: z.array(z.enum(VehicleType)).min(1),
    isCovered: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const rejectSchema = z.object({ reason: z.string().trim().min(5).max(500) });
export const suspendSchema = rejectSchema;
