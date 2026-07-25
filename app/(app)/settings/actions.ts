"use server";

import { revalidatePath } from "next/cache";
import { eq, ne } from "drizzle-orm";
import { z } from "zod";

import { semesters, students, teams, topics } from "@/db/schema";
import { db } from "@/lib/db";
import { requireCoordinator } from "@/lib/guard";
import { diffChanges, recordAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(error: string): ActionResult {
  return { ok: false, error };
}

/* --------------------------------- semesters -------------------------------- */

const semesterSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  startsOn: z.string().trim().optional().or(z.literal("")),
  endsOn: z.string().trim().optional().or(z.literal("")),
});

export async function createSemester(input: unknown): Promise<ActionResult> {
  const user = await requireCoordinator();
  const parsed = semesterSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { name, startsOn, endsOn } = parsed.data;

  const [row] = await db
    .insert(semesters)
    .values({
      name,
      startsOn: startsOn || null,
      endsOn: endsOn || null,
    })
    .returning();

  await recordAudit({
    userId: user.id,
    entity: "semester",
    entityId: row.id,
    action: "create",
    changes: { name, startsOn, endsOn },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateSemester(
  id: number,
  input: unknown
): Promise<ActionResult> {
  const user = await requireCoordinator();
  const parsed = semesterSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { name, startsOn, endsOn } = parsed.data;

  const before = await db.query.semesters.findFirst({
    where: eq(semesters.id, id),
  });
  if (!before) return fail("Semester not found.");

  await db
    .update(semesters)
    .set({ name, startsOn: startsOn || null, endsOn: endsOn || null })
    .where(eq(semesters.id, id));

  await recordAudit({
    userId: user.id,
    entity: "semester",
    entityId: id,
    action: "update",
    changes: diffChanges(before, {
      name,
      startsOn: startsOn || null,
      endsOn: endsOn || null,
    }),
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Flag one semester as the active one (only one at a time). */
export async function setActiveSemester(id: number): Promise<ActionResult> {
  const user = await requireCoordinator();
  await db.transaction(async (tx) => {
    await tx
      .update(semesters)
      .set({ isActive: false })
      .where(ne(semesters.id, id));
    await tx
      .update(semesters)
      .set({ isActive: true })
      .where(eq(semesters.id, id));
    await recordAudit(
      {
        userId: user.id,
        entity: "semester",
        entityId: id,
        action: "update",
        changes: { isActive: { from: false, to: true } },
      },
      tx
    );
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteSemester(id: number): Promise<ActionResult> {
  const user = await requireCoordinator();
  try {
    await db.delete(semesters).where(eq(semesters.id, id));
  } catch {
    return fail(
      "This semester still has students attached. Remove or move them first."
    );
  }
  await recordAudit({
    userId: user.id,
    entity: "semester",
    entityId: id,
    action: "delete",
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/* ----------------------------------- teams ---------------------------------- */

const teamSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
});

export async function createTeam(input: unknown): Promise<ActionResult> {
  const user = await requireCoordinator();
  const parsed = teamSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  try {
    const [row] = await db
      .insert(teams)
      .values({ name: parsed.data.name })
      .returning();
    await recordAudit({
      userId: user.id,
      entity: "team",
      entityId: row.id,
      action: "create",
      changes: { name: parsed.data.name },
    });
  } catch {
    return fail("A team with that name already exists.");
  }
  revalidatePath("/settings", "layout");
  return { ok: true };
}

export async function updateTeam(
  id: number,
  input: unknown
): Promise<ActionResult> {
  const user = await requireCoordinator();
  const parsed = teamSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  try {
    await db
      .update(teams)
      .set({ name: parsed.data.name })
      .where(eq(teams.id, id));
  } catch {
    return fail("A team with that name already exists.");
  }
  await recordAudit({
    userId: user.id,
    entity: "team",
    entityId: id,
    action: "update",
    changes: { name: parsed.data.name },
  });
  revalidatePath("/settings", "layout");
  return { ok: true };
}

export async function deleteTeam(id: number): Promise<ActionResult> {
  const user = await requireCoordinator();
  try {
    await db.delete(teams).where(eq(teams.id, id));
  } catch {
    return fail(
      "This team still owns topics or assessors. Reassign those first."
    );
  }
  await recordAudit({
    userId: user.id,
    entity: "team",
    entityId: id,
    action: "delete",
  });
  revalidatePath("/settings", "layout");
  return { ok: true };
}

/* ---------------------------------- topics ---------------------------------- */

const topicSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160),
  teamId: z.coerce.number().int().positive("Pick the team that owns this topic."),
});

export async function createTopic(input: unknown): Promise<ActionResult> {
  const user = await requireCoordinator();
  const parsed = topicSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const [row] = await db.insert(topics).values(parsed.data).returning();
  await recordAudit({
    userId: user.id,
    entity: "topic",
    entityId: row.id,
    action: "create",
    changes: parsed.data,
  });
  revalidatePath("/settings", "layout");
  return { ok: true };
}

export async function updateTopic(
  id: number,
  input: unknown
): Promise<ActionResult> {
  const user = await requireCoordinator();
  const parsed = topicSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const before = await db.query.topics.findFirst({ where: eq(topics.id, id) });
  if (!before) return fail("Topic not found.");

  await db.update(topics).set(parsed.data).where(eq(topics.id, id));
  await recordAudit({
    userId: user.id,
    entity: "topic",
    entityId: id,
    action: "update",
    changes: diffChanges(before, parsed.data),
  });
  revalidatePath("/settings", "layout");
  return { ok: true };
}

export async function deleteTopic(id: number): Promise<ActionResult> {
  const user = await requireCoordinator();
  try {
    await db.delete(topics).where(eq(topics.id, id));
  } catch {
    return fail("Students are still assigned to this topic.");
  }
  await recordAudit({
    userId: user.id,
    entity: "topic",
    entityId: id,
    action: "delete",
  });
  revalidatePath("/settings", "layout");
  return { ok: true };
}

/* ---------------------------------- account --------------------------------- */

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters."),
  })
  .strict();

export async function changePassword(input: unknown): Promise<ActionResult> {
  await requireCoordinator();
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  try {
    await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });
  } catch {
    return fail("Could not change password. Is the current password correct?");
  }
  return { ok: true };
}

/* ----------------------------- clear all students ---------------------------- */

export async function deleteAllStudents(): Promise<ActionResult> {
  const user = await requireCoordinator();
  const count = await db.$count(students);
  if (count === 0) return fail("There are no students to delete.");

  await db.delete(students);
  await recordAudit({
    userId: user.id,
    entity: "student",
    entityId: "all",
    action: "delete",
    changes: { count },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

