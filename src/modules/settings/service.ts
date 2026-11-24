import { db } from "@/platform/db";

export async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const row = await db.platformSetting.findUnique({ where: { key } });
  return typeof row?.value === "number" ? row.value : fallback;
}

export async function depositLimits(): Promise<{ min: number; max: number }> {
  const [min, max] = await Promise.all([getNumberSetting("deposit.minPercent", 10), getNumberSetting("deposit.maxPercent", 100)]);
  return { min, max };
}
