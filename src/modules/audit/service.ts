import type { Prisma, UserRole } from "@prisma/client";
import { db } from "@/platform/db";

export interface AuditEntry {
  action: string;
  actorId?: string | null;
  actorRole?: UserRole | null;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}

/** Append-only. Never put passwords, tokens or full card/phone data in metadata. */
export async function audit(entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      action: entry.action,
      actorId: entry.actorId ?? null,
      actorRole: entry.actorRole ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata,
      ip: entry.ip ?? null,
    },
  });
}
