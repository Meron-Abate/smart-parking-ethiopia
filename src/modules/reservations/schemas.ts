import { z } from "zod";
import { latitude, longitude } from "@/modules/facilities/schemas";
import { MAX_DURATION_MIN } from "@/modules/discovery/schemas";

export const createReservationSchema = z.object({
  facilityId: z.string().min(1),
  vehicleId: z.string().min(1),
  startAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(15).max(MAX_DURATION_MIN),
  /** Individual-space facilities only; omit to let the system assign a space. */
  spaceId: z.string().min(1).optional(),
  /** Where the driver is going; stored for context only (never used for pricing or allocation). */
  destination: z
    .object({ name: z.string().trim().max(120).optional(), latitude: latitude.optional(), longitude: longitude.optional() })
    .optional(),
});
export type CreateReservationInput = z.infer<typeof createReservationSchema>;

export const extendSchema = z.object({ extraMinutes: z.number().int().min(15).max(24 * 60) });

export const myReservationsQuery = z.object({ scope: z.enum(["upcoming", "past", "all"]).default("all") });

export const quoteQuery = z.object({
  facilityId: z.string().min(1),
  startAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.coerce.number().int().min(15).max(MAX_DURATION_MIN),
  vehicleType: z.enum(["MOTORCYCLE", "SEDAN", "SUV", "MINIBUS", "TRUCK"]).default("SEDAN"),
});
