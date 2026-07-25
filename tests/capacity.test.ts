import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  assessorCapacity,
  assessors,
  semesters,
  students,
  teams,
  topics,
} from "@/db/schema";
import {
  CapacityError,
  assertCanAssignFirst,
  capacityFor,
  getAssessorLoads,
} from "@/lib/capacity";

/**
 * These run against the real Postgres from docker-compose / DATABASE_URL and
 * clean up after themselves. Everything is namespaced with a marker so a failed
 * run never leaves rows behind that break the next one.
 */
const MARK = "__test__";

let teamId: number;
let semesterA: number;
let semesterB: number;

async function cleanup() {
  const testTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(sql`${teams.name} like ${MARK + "%"}`);
  const teamIds = testTeams.map((t) => t.id);

  const testSemesters = await db
    .select({ id: semesters.id })
    .from(semesters)
    .where(sql`${semesters.name} like ${MARK + "%"}`);
  const semesterIds = testSemesters.map((s) => s.id);

  if (semesterIds.length)
    await db.delete(students).where(inArray(students.semesterId, semesterIds));
  if (teamIds.length) {
    const testAssessors = await db
      .select({ id: assessors.id })
      .from(assessors)
      .where(inArray(assessors.teamId, teamIds));
    const assessorIds = testAssessors.map((a) => a.id);
    if (assessorIds.length)
      await db
        .delete(assessorCapacity)
        .where(inArray(assessorCapacity.assessorId, assessorIds));
    await db.delete(assessors).where(inArray(assessors.teamId, teamIds));
    await db.delete(topics).where(inArray(topics.teamId, teamIds));
  }
  if (semesterIds.length)
    await db.delete(semesters).where(inArray(semesters.id, semesterIds));
  if (teamIds.length) await db.delete(teams).where(inArray(teams.id, teamIds));
}

async function makeAssessor(name: string, max: number, semesterId: number) {
  const [a] = await db
    .insert(assessors)
    .values({ name: `${MARK} ${name}`, teamId })
    .returning();
  await db
    .insert(assessorCapacity)
    .values({ assessorId: a.id, semesterId, maxAsFirst: max });
  return a.id;
}

async function makeStudent(
  semesterId: number,
  number: string,
  firstAssessorId?: number,
  secondAssessorId?: number
) {
  const [s] = await db
    .insert(students)
    .values({
      semesterId,
      studentNumber: number,
      name: `Test ${number}`,
      firstAssessorId,
      secondAssessorId,
    })
    .returning();
  return s.id;
}

beforeEach(async () => {
  await cleanup();
  const [team] = await db
    .insert(teams)
    .values({ name: `${MARK} Team` })
    .returning();
  teamId = team.id;
  const [a] = await db
    .insert(semesters)
    .values({ name: `${MARK} S1` })
    .returning();
  const [b] = await db
    .insert(semesters)
    .values({ name: `${MARK} S2` })
    .returning();
  semesterA = a.id;
  semesterB = b.id;
});

afterAll(async () => {
  await cleanup();
});

describe("getAssessorLoads", () => {
  it("only lists assessors that have a capacity row for the semester", async () => {
    const available = await makeAssessor("Available", 2, semesterA);
    // An assessor with no capacity row in semester A is not available there.
    const [other] = await db
      .insert(assessors)
      .values({ name: `${MARK} Unavailable`, teamId })
      .returning();

    const loads = await getAssessorLoads(semesterA);
    const ids = loads.map((l) => l.assessorId);
    expect(ids).toContain(available);
    expect(ids).not.toContain(other.id);
  });

  it("counts 1st and 2nd assessor load separately", async () => {
    const a1 = await makeAssessor("First", 3, semesterA);
    const a2 = await makeAssessor("Second", 3, semesterA);
    await makeStudent(semesterA, "s1", a1, a2);
    await makeStudent(semesterA, "s2", a1, a2);

    const load1 = await capacityFor(a1, semesterA);
    const load2 = await capacityFor(a2, semesterA);
    expect(load1).toMatchObject({ usedAsFirst: 2, usedAsSecond: 0, remaining: 1 });
    // The 2nd-assessor load is displayed but never capped.
    expect(load2).toMatchObject({ usedAsFirst: 0, usedAsSecond: 2 });
  });

  it("keeps load per semester", async () => {
    const id = await makeAssessor("Split", 2, semesterA);
    await db
      .insert(assessorCapacity)
      .values({ assessorId: id, semesterId: semesterB, maxAsFirst: 2 });
    await makeStudent(semesterA, "s1", id);

    expect((await capacityFor(id, semesterA))?.usedAsFirst).toBe(1);
    expect((await capacityFor(id, semesterB))?.usedAsFirst).toBe(0);
  });

  it("reports isFull and never returns negative remaining", async () => {
    const id = await makeAssessor("Full", 1, semesterA);
    await makeStudent(semesterA, "s1", id);
    await makeStudent(semesterA, "s2", id); // deliberately over the max
    const load = await capacityFor(id, semesterA);
    expect(load?.isFull).toBe(true);
    expect(load?.remaining).toBe(0);
  });
});

describe("assertCanAssignFirst", () => {
  it("allows an assignment below the maximum", async () => {
    const id = await makeAssessor("Room", 2, semesterA);
    await makeStudent(semesterA, "s1", id);
    await expect(
      db.transaction((tx) =>
        assertCanAssignFirst(tx, { assessorId: id, semesterId: semesterA })
      )
    ).resolves.toBeUndefined();
  });

  it("rejects the assignment that would exceed the maximum", async () => {
    const id = await makeAssessor("Cap", 2, semesterA);
    await makeStudent(semesterA, "s1", id);
    await makeStudent(semesterA, "s2", id);
    await expect(
      db.transaction((tx) =>
        assertCanAssignFirst(tx, { assessorId: id, semesterId: semesterA })
      )
    ).rejects.toBeInstanceOf(CapacityError);
  });

  it("rejects when the assessor has no capacity row for this semester", async () => {
    const [a] = await db
      .insert(assessors)
      .values({ name: `${MARK} NoCap`, teamId })
      .returning();
    await expect(
      db.transaction((tx) =>
        assertCanAssignFirst(tx, { assessorId: a.id, semesterId: semesterA })
      )
    ).rejects.toThrow(/no capacity configured/i);
  });

  it("does not count the student being edited twice", async () => {
    const id = await makeAssessor("Resave", 1, semesterA);
    const studentId = await makeStudent(semesterA, "s1", id);
    // Re-saving the same student with the same 1st assessor must still pass.
    await expect(
      db.transaction((tx) =>
        assertCanAssignFirst(tx, {
          assessorId: id,
          semesterId: semesterA,
          excludeStudentId: studentId,
        })
      )
    ).resolves.toBeUndefined();
  });

  it("counts capacity per semester", async () => {
    const id = await makeAssessor("PerSem", 1, semesterA);
    await db
      .insert(assessorCapacity)
      .values({ assessorId: id, semesterId: semesterB, maxAsFirst: 1 });
    await makeStudent(semesterA, "s1", id);

    // Full in A …
    await expect(
      db.transaction((tx) =>
        assertCanAssignFirst(tx, { assessorId: id, semesterId: semesterA })
      )
    ).rejects.toBeInstanceOf(CapacityError);
    // … but untouched in B.
    await expect(
      db.transaction((tx) =>
        assertCanAssignFirst(tx, { assessorId: id, semesterId: semesterB })
      )
    ).resolves.toBeUndefined();
  });

  it("serialises concurrent claims on the last slot: one wins, one fails", async () => {
    const id = await makeAssessor("Race", 1, semesterA);
    const sA = await makeStudent(semesterA, "race-1");
    const sB = await makeStudent(semesterA, "race-2");

    async function claim(studentId: number) {
      return db.transaction(async (tx) => {
        await assertCanAssignFirst(tx, {
          assessorId: id,
          semesterId: semesterA,
          excludeStudentId: studentId,
        });
        await tx
          .update(students)
          .set({ firstAssessorId: id })
          .where(eq(students.id, studentId));
      });
    }

    const results = await Promise.allSettled([claim(sA), claim(sB)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // And the database itself never exceeded the maximum.
    const load = await capacityFor(id, semesterA);
    expect(load?.usedAsFirst).toBe(1);
  });
});
