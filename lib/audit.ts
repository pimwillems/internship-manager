import { auditLog } from "@/db/schema";
import { db, type DbOrTx } from "@/lib/db";

export type AuditAction = "create" | "update" | "delete";

/**
 * Record a mutation in the audit log. Pass the transaction handle when the
 * mutation runs inside one, so the log entry commits or rolls back with it.
 */
export async function recordAudit(
  opts: {
    userId: string | null;
    entity: string;
    entityId: string | number;
    action: AuditAction;
    changes?: unknown;
  },
  tx: DbOrTx = db
) {
  await tx.insert(auditLog).values({
    userId: opts.userId,
    entity: opts.entity,
    entityId: String(opts.entityId),
    action: opts.action,
    changes: opts.changes ?? null,
  });
}

/**
 * Diff two records down to the fields that actually changed, so the audit log
 * stores `{ field: { from, to } }` rather than whole rows.
 */
export function diffChanges<T extends Record<string, unknown>>(
  before: T | null,
  after: Partial<T>
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, next] of Object.entries(after)) {
    const prev = before ? before[key as keyof T] : undefined;
    // Normalise null/undefined so "unset" doesn't look like a change.
    const a = prev ?? null;
    const b = (next as unknown) ?? null;
    if (a !== b) changes[key] = { from: a, to: b };
  }
  return changes;
}
