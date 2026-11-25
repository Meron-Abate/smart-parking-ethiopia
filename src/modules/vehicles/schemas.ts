import { z } from "zod";
import { VehicleType } from "@prisma/client";

/** Plates are stored upper-case without spaces ("AA 12345" == "aa-12345" is NOT assumed; only case/space are normalised). */
export const normalizePlate = (s: string): string => s.replace(/\s+/g, "").toUpperCase();

export const vehicleSchema = z.object({
  plateNumber: z
    .string()
    .transform(normalizePlate)
    .pipe(z.string().min(3, "Plate number is too short").max(15, "Plate number is too long").regex(/^[A-Z0-9-]+$/, "Use letters, digits and hyphens only")),
  type: z.enum(VehicleType).default("SEDAN"),
  make: z.string().trim().max(40).optional().transform((v) => v || undefined),
  model: z.string().trim().max(40).optional().transform((v) => v || undefined),
  color: z.string().trim().max(30).optional().transform((v) => v || undefined),
});
export type VehicleInput = z.infer<typeof vehicleSchema>;
