import { and, eq, sql } from "drizzle-orm";

import { assessorCapacity, assessors, students } from "@/db/schema";
import { db, type DbOrTx, type Tx } from "@/lib/db";

/**
 * Capacity rules live here and nowhere else. The assessor combobox, the student
 * form action, the planning board and the Excel import validator all call into
 * this module — there is deliberately no second implementation of the cap.
 */

export type AssessorLoad = {
  assessorId: number;
  name: string;
  teamId: number;
  isActive: boolean;
  /** Max students this assessor takes as 1st assessor this semester. */
  maxAsFirst: number;
  /** How many they currently hold as 1st assessor this semester. */
  usedAsFirst: number;
  /** How many they hold as 2nd assessor. Displayed only — never capped. */
  usedAsSecond: number;
  /** maxAsFirst - usedAsFirst, floored at 0. */
  remaining: number;
  /** True when they cannot take another student as 1st assessor. */
  isFull: boolean;
};

/**
 * Load + capacity for every assessor that participates in this semester.
 * Availability is defined by the presence of an assessor_capacity row, so an
 * assessor without one simply does not appear.
 */
export async function getAssessorLoads(
  semesterId: number,
  dbOrTx: DbOrTx = db
): Promise<AssessorLoad[]> {
  // Correlated scalar subqueries: one row per available assessor, with their
  // load counted per semester.
  const rows = await dbOrTx
    .select({
      assessorId: assessors.id,
      name: assessors.name,
      teamId: assessors.teamId,
      isActive: assessors.isActive,
      maxAsFirst: assessorCapacity.maxAsFirst,
      usedAsFirst: sql<number>`(
        select count(*)::int from ${students}
        where ${students.semesterId} = ${semesterId}
          and ${students.firstAssessorId} = ${assessors.id}
      )`,
      usedAsSecond: sql<number>`(
        select count(*)::int from ${students}
        where ${students.semesterId} = ${semesterId}
          and ${students.secondAssessorId} = ${assessors.id}
      )`,
    })
    .from(assessorCapacity)
    .innerJoin(assessors, eq(assessors.id, assessorCapacity.assessorId))
    .where(eq(assessorCapacity.semesterId, semesterId))
    .orderBy(assessors.name);

  return rows.map((r) => ({
    ...r,
    remaining: Math.max(0, r.maxAsFirst - r.usedAsFirst),
    isFull: r.usedAsFirst >= r.maxAsFirst,
  }));
}

/** Load + capacity for a single assessor in a semester, or null if unavailable. */
export async function capacityFor(
  assessorId: number,
  semesterId: number,
  dbOrTx: DbOrTx = db
): Promise<AssessorLoad | null> {
  const loads = await getAssessorLoads(semesterId, dbOrTx);
  return loads.find((l) => l.assessorId === assessorId) ?? null;
}

export class CapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapacityError";
  }
}

/**
 * Hard-enforce the 1st-assessor maximum inside a transaction.
 *
 * Locks the assessor's capacity row with SELECT … FOR UPDATE, then counts the
 * students they already hold as 1st assessor in this semester. Two browser tabs
 * racing for the last slot serialise on that lock, so the database can never
 * exceed the maximum.
 *
 * `excludeStudentId` is the student being edited — it keeps re-saving a student
 * who already has this assessor from counting them twice.
 */
export async function assertCanAssignFirst(
  tx: Tx,
  opts: { assessorId: number; semesterId: number; excludeStudentId?: number }
): Promise<void> {
  const { assessorId, semesterId, excludeStudentId } = opts;

  // Lock the capacity row for this (assessor, semester) for the transaction.
  const [capacity] = await tx
    .select({
      maxAsFirst: assessorCapacity.maxAsFirst,
      name: assessors.name,
    })
    .from(assessorCapacity)
    .innerJoin(assessors, eq(assessors.id, assessorCapacity.assessorId))
    .where(
      and(
        eq(assessorCapacity.assessorId, assessorId),
        eq(assessorCapacity.semesterId, semesterId)
      )
    )
    .for("update", { of: assessorCapacity });

  if (!capacity) {
    throw new CapacityError(
      "This assessor has no capacity configured for this semester. Set their maximum on the Assessors page first."
    );
  }

  const [{ used }] = await tx
    .select({ used: sql<number>`count(*)::int` })
    .from(students)
    .where(
      and(
        eq(students.semesterId, semesterId),
        eq(students.firstAssessorId, assessorId),
        excludeStudentId
          ? sql`${students.id} <> ${excludeStudentId}`
          : sql`true`
      )
    );

  if (used + 1 > capacity.maxAsFirst) {
    throw new CapacityError(
      `${capacity.name} is at their maximum of ${capacity.maxAsFirst} student${
        capacity.maxAsFirst === 1 ? "" : "s"
      } as 1st assessor for this semester.`
    );
  }
}
