import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const pageArgs = ({ page, limit }: { page: number; limit: number }) => ({ skip: (page - 1) * limit, take: limit });
export const pageMeta = (p: { page: number; limit: number }, total: number) => ({ page: p.page, limit: p.limit, total });
