"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { students } from "@/db/schema";
import { db } from "@/lib/db";
import { requireCoordinator } from "@/lib/guard";
import { diffChanges, recordAudit } from "@/lib/audit";
import { CapacityError, assertCanAssignFirst } from "@/lib/capacity";

export type ActionResult =
  | { ok: true; id?: number }
  | { ok: false; error: string };

const optionalId = z
  .union([z.coerce.number().int().positive(), z.literal(""), z.null()])
  .transform((v) => (v === "" || v === null ? null : (v as number)));

const studentSchema = z.object({
  studentNumber: z.string().trim().min(1, "Student number is required.").max(40),
  firstName: z.string().trim().min(1, "First name is required.").max(120),
  lastName: z.string().trim().min(1, "Last name is required.").max(120),
  email: z.string().trim().email("Enter a valid email.").or(z.literal("")),
  topicId: optionalId,
  internshipStatus: z.enum(["none", "pending", "approved", "rejected"]),
  company: z.string().trim().max(200),
  assignmentDescription: z.string().trim().max(4000),
  remarks: z.string().trim().max(4000),
  firstAssessorId: optionalId,
  secondAssessorId: optionalId,
});

function normalise(data: z.infer<typeof studentSchema>) {
  return {
    studentNumber: data.studentNumber,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email || null,
    topicId: data.topicId,
    internshipStatus: data.internshipStatus,
    company: data.company || null,
    assignmentDescription: data.assignmentDescription || null,
    remarks: data.remarks || null,
    firstAssessorId: data.firstAssessorId,
    secondAssessorId: data.secondAssessorId,
  };
}

function friendlyDbError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("students_semester_number")) {
    return "Another student in this semester already has that student number.";
  }
  if (message.includes("students_distinct_assessors")) {
    return "The 1st and 2nd assessor cannot be the same person.";
  }
  return "Could not save the student.";
}

export async function createStudent(
  semesterId: number,
  input: unknown
): Promise<ActionResult> {
  const user = await requireCoordinator();
  const parsed = studentSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const values = normalise(parsed.data);

  try {
    const id = await db.transaction(async (tx) => {
      // Enforce the 1st-assessor maximum before writing.
      if (values.firstAssessorId) {
        await assertCanAssignFirst(tx, {
          assessorId: values.firstAssessorId,
          semesterId,
        });
      }
      const [row] = await tx
        .insert(students)
        .values({ ...values, semesterId })
        .returning();
      await recordAudit(
        {
          userId: user.id,
          entity: "student",
          entityId: row.id,
          action: "create",
          changes: values,
        },
        tx
      );
      return row.id;
    });

    revalidatePath("/students");
    revalidatePath("/planning");
    revalidatePath("/");
    return { ok: true, id };
  } catch (err) {
    if (err instanceof CapacityError) return { ok: false, error: err.message };
    return { ok: false, error: friendlyDbError(err) };
  }
}

export async function updateStudent(
  id: number,
  input: unknown
): Promise<ActionResult> {
  const user = await requireCoordinator();
  const parsed = studentSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const values = normalise(parsed.data);

  try {
    await db.transaction(async (tx) => {
      const before = await tx.query.students.findFirst({
        where: eq(students.id, id),
      });
      if (!before) throw new Error("Student not found.");

      // Only re-check capacity when the 1st assessor actually changes to
      // someone new; excludeStudentId keeps a re-save from counting twice.
      if (
        values.firstAssessorId &&
        values.firstAssessorId !== before.firstAssessorId
      ) {
        await assertCanAssignFirst(tx, {
          assessorId: values.firstAssessorId,
          semesterId: before.semesterId,
          excludeStudentId: id,
        });
      }

      await tx
        .update(students)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(students.id, id));

      await recordAudit(
        {
          userId: user.id,
          entity: "student",
          entityId: id,
          action: "update",
          changes: diffChanges(before, values),
        },
        tx
      );
    });

    revalidatePath("/students");
    revalidatePath(`/students/${id}`);
    revalidatePath("/planning");
    revalidatePath("/");
    return { ok: true, id };
  } catch (err) {
    if (err instanceof CapacityError) return { ok: false, error: err.message };
    if (err instanceof Error && err.message === "Student not found.")
      return { ok: false, error: err.message };
    return { ok: false, error: friendlyDbError(err) };
  }
}

/**
 * Assign (or clear) a single assessor slot. Used by the inline pickers on the
 * students table and the planning board, so they go through the same
 * transactional capacity check as the full form.
 */
export async function assignAssessor(
  studentId: number,
  slot: "first" | "second",
  assessorId: number | null
): Promise<ActionResult> {
  const user = await requireCoordinator();

  try {
    await db.transaction(async (tx) => {
      const before = await tx.query.students.findFirst({
        where: eq(students.id, studentId),
      });
      if (!before) throw new Error("Student not found.");

      if (slot === "first" && assessorId && assessorId !== before.firstAssessorId) {
        await assertCanAssignFirst(tx, {
          assessorId,
          semesterId: before.semesterId,
          excludeStudentId: studentId,
        });
      }

      const patch =
        slot === "first"
          ? { firstAssessorId: assessorId }
          : { secondAssessorId: assessorId };

      await tx
        .update(students)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(students.id, studentId));

      await recordAudit(
        {
          userId: user.id,
          entity: "student",
          entityId: studentId,
          action: "update",
          changes: diffChanges(before, patch),
        },
        tx
      );
    });

    revalidatePath("/students");
    revalidatePath(`/students/${studentId}`);
    revalidatePath("/planning");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    if (err instanceof CapacityError) return { ok: false, error: err.message };
    return { ok: false, error: friendlyDbError(err) };
  }
}

/** Inline edits from the students table (status and remarks only). */
export async function quickUpdateStudent(
  id: number,
  patch: { internshipStatus?: string; remarks?: string }
): Promise<ActionResult> {
  const user = await requireCoordinator();
  const parsed = z
    .object({
      internshipStatus: z
        .enum(["none", "pending", "approved", "rejected"])
        .optional(),
      remarks: z.string().trim().max(4000).optional(),
    })
    .safeParse(patch);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };

  const before = await db.query.students.findFirst({
    where: eq(students.id, id),
  });
  if (!before) return { ok: false, error: "Student not found." };

  await db
    .update(students)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(students.id, id));

  await recordAudit({
    userId: user.id,
    entity: "student",
    entityId: id,
    action: "update",
    changes: diffChanges(before, parsed.data),
  });

  revalidatePath("/students");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteStudent(id: number): Promise<ActionResult> {
  const user = await requireCoordinator();
  await db.delete(students).where(eq(students.id, id));
  await recordAudit({
    userId: user.id,
    entity: "student",
    entityId: id,
    action: "delete",
  });
  revalidatePath("/students");
  revalidatePath("/planning");
  revalidatePath("/");
  return { ok: true };
}
