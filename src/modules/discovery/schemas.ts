import { z } from "zod";
import { VehicleType } from "@prisma/client";
import { latitude, longitude } from "@/modules/facilities/schemas";

export const RADII = [500, 1000, 2000, 5000] as const;
export const MAX_DURATION_MIN = 7 * 24 * 60;

const flag = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

export const destinationSearchQuery = z.object({ q: z.string().trim().min(2).max(80) });

/** Query-string contract for GET /api/parking/discover. The destination is ALWAYS explicit; GPS is never used. */
export const discoverQuery = z.object({
  lat: z.coerce.number().pipe(latitude),
  lng: z.coerce.number().pipe(longitude),
  destinationName: z.string().trim().max(120).optional(),
  radius: z.coerce.number().refine((v) => (RADII as readonly number[]).includes(v), { message: "radius must be 500, 1000, 2000 or 5000 metres" }).default(1000),
  arrivalAt: z.iso.datetime({ offset: true }).optional(),
  durationMinutes: z.coerce.number().int().min(15).max(MAX_DURATION_MIN).default(120),
  vehicleType: z.enum(VehicleType).default("SEDAN"),
  covered: flag.optional(),
  indoor: flag.optional(),
  open24: flag.optional(),
  features: z.string().max(200).optional().transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10) : [])),
  maxPriceCents: z.coerce.number().int().min(0).optional(),
  showUnavailable: flag.default(false),
  sort: z.enum(["distance", "price", "availability"]).default("distance"),
});
export type DiscoverInput = z.infer<typeof discoverQuery>;
