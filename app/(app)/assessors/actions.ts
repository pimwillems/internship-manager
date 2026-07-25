"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { assessorCapacity, assessors } from "@/db/schema";
import { db } from "@/lib/db";
import { requireCoordinator } from "@/lib/guard";
import { diffChanges, recordAudit } from "@/lib/audit";

export type ActionResult = { ok: true } | { ok: false; error: string };

const assessorSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160),
  email: z.string().trim().email("Enter a valid email.").or(z.literal("")),
  teamId: z.coerce.number().int().positive("Pick a team."),
  isActive: z.boolean().default(true),
});

export async function createAssessor(input: unknown): Promise<ActionResult> {
  const user = await requireCoordinator();
  const parsed = assessorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { name, email, teamId, isActive } = parsed.data;

  const [row] = await db
    .insert(assessors)
    .values({ name, email: email || null, teamId, isActive })
    .returning();

  await recordAudit({
    userId: user.id,
    entity: "assessor",
    entityId: row.id,
    action: "create",
    changes: { name, email, teamId, isActive },
  });
  revalidatePath("/assessors");
  return { ok: true };
}

export async function updateAssessor(
  id: number,
  input: unknown
): Promise<ActionResult> {
  const user = await requireCoordinator();
  const parsed = assessorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { name, email, teamId, isActive } = parsed.data;

  const before = await db.query.assessors.findFirst({
    where: eq(assessors.id, id),
  });
  if (!before) return { ok: false, error: "Assessor not found." };

  await db
    .update(assessors)
    .set({ name, email: email || null, teamId, isActive })
    .where(eq(assessors.id, id));

  await recordAudit({
    userId: user.id,
    entity: "assessor",
    entityId: id,
    action: "update",
    changes: diffChanges(before, {
      name,
      email: email || null,
      teamId,
      isActive,
    }),
  });
  revalidatePath("/assessors");
  revalidatePath("/planning");
  return { ok: true };
}

/**
 * Set an assessor's maximum as 1st assessor for a semester. Creating the row is
 * what makes them available that semester; `null` removes it again.
 *
 * Lowering the max below what they already hold is allowed (people do get
 * reassigned) but is surfaced as an over-capacity warning in the UI rather than
 * silently accepted.
 */
export async function setCapacity(
  assessorId: number,
  semesterId: number,
  maxAsFirst: number | null
): Promise<ActionResult> {
  const user = await requireCoordinator();

  if (maxAsFirst === null) {
    await db
      .delete(assessorCapacity)
      .where(
        and(
          eq(assessorCapacity.assessorId, assessorId),
          eq(assessorCapacity.semesterId, semesterId)
        )
      );
    await recordAudit({
      userId: user.id,
      entity: "assessor_capacity",
      entityId: `${assessorId}:${semesterId}`,
      action: "delete",
    });
    revalidatePath("/assessors");
    revalidatePath("/planning");
    return { ok: true };
  }

  const parsed = z.coerce
    .number()
    .int()
    .min(0, "Maximum cannot be negative.")
    .max(99, "That maximum looks too high.")
    .safeParse(maxAsFirst);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  await db
    .insert(assessorCapacity)
    .values({ assessorId, semesterId, maxAsFirst: parsed.data })
    .onConflictDoUpdate({
      target: [assessorCapacity.assessorId, assessorCapacity.semesterId],
      set: { maxAsFirst: parsed.data },
    });

  await recordAudit({
    userId: user.id,
    entity: "assessor_capacity",
    entityId: `${assessorId}:${semesterId}`,
    action: "update",
    changes: { maxAsFirst: parsed.data },
  });
  revalidatePath("/assessors");
  revalidatePath("/planning");
  revalidatePath("/students");
  return { ok: true };
}

export async function deleteAssessor(id: number): Promise<ActionResult> {
  const user = await requireCoordinator();
  try {
    await db.delete(assessors).where(eq(assessors.id, id));
  } catch {
    return {
      ok: false,
      error:
        "This assessor still holds students. Reassign those students first, or deactivate the assessor instead.",
    };
  }
  await recordAudit({
    userId: user.id,
    entity: "assessor",
    entityId: id,
    action: "delete",
  });
  revalidatePath("/assessors");
  return { ok: true };
}
