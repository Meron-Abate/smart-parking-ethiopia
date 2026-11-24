import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { normalizePhone, registerSchema, passwordSchema } from "@/modules/auth/schemas";
import { signSession, verifySession } from "@/modules/auth/session";
import { hashPassword, verifyPassword } from "@/modules/auth/password";

const SECRET = "unit-test-secret-unit-test-secret-1234";

describe("phone normalisation", () => {
  it.each([
    ["0911234567", "+251911234567"],
    ["+251 911 234 567", "+251911234567"],
    ["251711234567", "+251711234567"],
    ["09-11-23-45-67", "+251911234567"],
  ])("%s -> %s", (input, out) => expect(normalizePhone(input)).toBe(out));

  it.each(["0111234567", "12345", "+1 202 555 0100", ""])("rejects %s", (input) =>
    expect(normalizePhone(input)).toBeNull(),
  );
});

describe("register schema", () => {
  const base = { fullName: "Abebe Kebede", password: "Passw0rd!" };
  it("requires email or phone", () => expect(registerSchema.safeParse(base).success).toBe(false));
  it("accepts a phone only and normalises it", () => {
    const r = registerSchema.parse({ ...base, phone: "0911234567" });
    expect(r.phone).toBe("+251911234567");
  });
  it("lowercases email", () => expect(registerSchema.parse({ ...base, email: "A@B.com" }).email).toBe("a@b.com"));
  it("ignores a client-supplied role (mass-assignment)", () => {
    const r = registerSchema.parse({ ...base, email: "a@b.com", role: "SUPER_ADMIN" });
    expect(r).not.toHaveProperty("role");
  });
  it("enforces password strength and bcrypt's 72-byte limit", () => {
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("allletters").success).toBe(false);
    expect(passwordSchema.safeParse("a1".repeat(40)).success).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips and carries only the user id", async () => {
    const tok = await signSession("user_1", SECRET, 1);
    expect(await verifySession(tok, SECRET)).toEqual({ sub: "user_1" });
  });
  it("rejects a token signed with another secret", async () => {
    const tok = await signSession("user_1", "another-secret-another-secret-12345678", 1);
    expect(await verifySession(tok, SECRET)).toBeNull();
  });
  it("rejects expired tokens", async () => {
    const tok = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifySession(tok, SECRET)).toBeNull();
  });
  it("rejects alg=none tokens", async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const forged = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: "admin" })}.`;
    expect(await verifySession(forged, SECRET)).toBeNull();
  });
});

describe("passwords", () => {
  it("verifies correct and rejects wrong passwords", async () => {
    const h = await hashPassword("Passw0rd!");
    expect(await verifyPassword("Passw0rd!", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
  it("returns false (not throw) for unknown accounts", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
  });
});
