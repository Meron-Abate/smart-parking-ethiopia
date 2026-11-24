import bcrypt from "bcryptjs";

const COST = 12;
// Valid hash of a random string; compared when the account doesn't exist so response timing doesn't reveal it.
const DUMMY_HASH = bcrypt.hashSync("timing-equaliser-not-a-real-password", COST);

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, COST);

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  const ok = await bcrypt.compare(plain, hash ?? DUMMY_HASH);
  return hash !== null && ok;
}
