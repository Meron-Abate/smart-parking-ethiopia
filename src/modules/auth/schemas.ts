import { z } from "zod";

/** Normalises Ethiopian mobile numbers (09…, 07…, 2519…, +2519…) to +251XXXXXXXXX. */
export function normalizePhone(input: string): string | null {
  const s = input.replace(/[\s-]/g, "");
  const m = /^(?:\+?251|0)([79]\d{8})$/.exec(s);
  return m ? `+251${m[1]}` : null;
}

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a digit");

const identifier = z.object({
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") return undefined;
      const n = normalizePhone(v);
      if (!n) ctx.addIssue({ code: "custom", message: "Enter a valid Ethiopian mobile number" });
      return n ?? undefined;
    }),
});

export const registerSchema = identifier
  .extend({
    fullName: z.string().trim().min(2).max(100),
    password: passwordSchema,
  })
  .refine((v) => v.email || v.phone, { message: "Provide an email or a phone number", path: ["email"] });

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(200),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
