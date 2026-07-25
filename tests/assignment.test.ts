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
import { getAssessorOptions } from "@/lib/assessor-options";
import { getStudentsForSemester, getTopicOptions } from "@/lib/students";

/**
 * Covers the read side that the UI depends on: the options fed to the assessor
 * combobox (which drives disabling at the maximum and the team preference) and
 * the joined student rows shared by the table, dashboard, planning board and
 * the Excel export.
 */
const MARK = "__test_assign__";

let teamOwning: number;
let teamOther: number;
let semesterId: number;
let topicId: number;

async function cleanup() {
  const t = await db
    .select({ id: teams.id })
    .from(teams)
    .where(sql`${teams.name} like ${MARK + "%"}`);
  const teamIds = t.map((x) => x.id);
  const s = await db
    .select({ id: semesters.id })
    .from(semesters)
    .where(sql`${semesters.name} like ${MARK + "%"}`);
  const semesterIds = s.map((x) => x.id);

  if (semesterIds.length)
    await db.delete(students).where(inArray(students.semesterId, semesterIds));
  if (teamIds.length) {
    const a = await db
      .select({ id: assessors.id })
      .from(assessors)
      .where(inArray(assessors.teamId, teamIds));
    const ids = a.map((x) => x.id);
    if (ids.length)
      await db
        .delete(assessorCapacity)
        .where(inArray(assessorCapacity.assessorId, ids));
    await db.delete(assessors).where(inArray(assessors.teamId, teamIds));
    await db.delete(topics).where(inArray(topics.teamId, teamIds));
  }
  if (semesterIds.length)
    await db.delete(semesters).where(inArray(semesters.id, semesterIds));
  if (teamIds.length) await db.delete(teams).where(inArray(teams.id, teamIds));
}

beforeEach(async () => {
  await cleanup();
  const [owning] = await db
    .insert(teams)
    .values({ name: `${MARK} Owning` })
    .returning();
  const [other] = await db
    .insert(teams)
    .values({ name: `${MARK} Other` })
    .returning();
  teamOwning = owning.id;
  teamOther = other.id;

  const [sem] = await db
    .insert(semesters)
    .values({ name: `${MARK} S1` })
    .returning();
  semesterId = sem.id;

  const [topic] = await db
    .insert(topics)
    .values({ name: `${MARK} Topic`, teamId: teamOwning })
    .returning();
  topicId = topic.id;
});

afterAll(async () => {
  await cleanup();
});

describe("getAssessorOptions", () => {
  it("returns only semester-available assessors, decorated with their team", async () => {
    const [inSem] = await db
      .insert(assessors)
      .values({ name: `${MARK} In`, teamId: teamOwning })
      .returning();
    const [notInSem] = await db
      .insert(assessors)
      .values({ name: `${MARK} Out`, teamId: teamOther })
      .returning();
    await db
      .insert(assessorCapacity)
      .values({ assessorId: inSem.id, semesterId, maxAsFirst: 2 });

    const options = await getAssessorOptions(semesterId);
    const mine = options.filter((o) => o.name.startsWith(MARK));
    expect(mine.map((o) => o.assessorId)).toEqual([inSem.id]);
    expect(mine[0].teamName).toBe(`${MARK} Owning`);
    expect(mine[0]).toMatchObject({ maxAsFirst: 2, remaining: 2, isFull: false });
    expect(options.map((o) => o.assessorId)).not.toContain(notInSem.id);
  });

  it("marks an assessor at their maximum as full, which is what disables them in the picker", async () => {
    const [a] = await db
      .insert(assessors)
      .values({ name: `${MARK} Full`, teamId: teamOwning })
      .returning();
    await db
      .insert(assessorCapacity)
      .values({ assessorId: a.id, semesterId, maxAsFirst: 1 });
    await db.insert(students).values({
      semesterId,
      studentNumber: `${MARK}-1`,
      name: "A B",
      firstAssessorId: a.id,
    });

    const option = (await getAssessorOptions(semesterId)).find(
      (o) => o.assessorId === a.id
    );
    expect(option).toMatchObject({ isFull: true, remaining: 0, usedAsFirst: 1 });
  });
});

describe("getStudentsForSemester", () => {
  it("resolves topic, owning team and both assessor names", async () => {
    const [first] = await db
      .insert(assessors)
      .values({ name: `${MARK} First`, teamId: teamOwning })
      .returning();
    const [second] = await db
      .insert(assessors)
      .values({ name: `${MARK} Second`, teamId: teamOther })
      .returning();

    await db.insert(students).values({
      semesterId,
      studentNumber: `${MARK}-42`,
      name: "Sam Visser",
      topicId,
      internshipStatus: "approved",
      firstAssessorId: first.id,
      secondAssessorId: second.id,
    });

    const rows = await getStudentsForSemester(semesterId);
    const row = rows.find((r) => r.studentNumber === `${MARK}-42`)!;
    expect(row).toMatchObject({
      topicName: `${MARK} Topic`,
      topicTeamId: teamOwning,
      topicTeamName: `${MARK} Owning`,
      firstAssessorName: `${MARK} First`,
      secondAssessorName: `${MARK} Second`,
      internshipStatus: "approved",
    });
  });

  it("keeps unassigned students visible with null assessors", async () => {
    await db.insert(students).values({
      semesterId,
      studentNumber: `${MARK}-none`,
      name: "No Assessor",
    });
    const rows = await getStudentsForSemester(semesterId);
    const row = rows.find((r) => r.studentNumber === `${MARK}-none`)!;
    expect(row.firstAssessorId).toBeNull();
    expect(row.firstAssessorName).toBeNull();
    expect(row.topicName).toBeNull();
  });

  it("does not leak students from another semester", async () => {
    const [otherSem] = await db
      .insert(semesters)
      .values({ name: `${MARK} S2` })
      .returning();
    await db.insert(students).values({
      semesterId: otherSem.id,
      studentNumber: `${MARK}-other`,
      name: "Other Semester",
    });
    const rows = await getStudentsForSemester(semesterId);
    expect(rows.map((r) => r.studentNumber)).not.toContain(`${MARK}-other`);
  });
});

describe("topic catalog", () => {
  it("exposes each topic with its owning team, which drives the soft preference", async () => {
    const options = await getTopicOptions();
    const mine = options.find((t) => t.id === topicId)!;
    expect(mine).toMatchObject({
      teamId: teamOwning,
      teamName: `${MARK} Owning`,
    });
  });
});

describe("database guarantees", () => {
  it("rejects the same person as both assessors", async () => {
    const [a] = await db
      .insert(assessors)
      .values({ name: `${MARK} Same`, teamId: teamOwning })
      .returning();
    await expect(
      db.insert(students).values({
        semesterId,
        studentNumber: `${MARK}-same`,
        name: "X Y",
        firstAssessorId: a.id,
        secondAssessorId: a.id,
      })
    ).rejects.toThrow();
  });

  it("allows a student with no assessors at all", async () => {
    await expect(
      db.insert(students).values({
        semesterId,
        studentNumber: `${MARK}-blank`,
        name: "X Y",
      })
    ).resolves.toBeDefined();
  });

  it("rejects a duplicate student number within a semester but allows it across semesters", async () => {
    await db.insert(students).values({
      semesterId,
      studentNumber: `${MARK}-dup`,
      name: "X Y",
    });
    await expect(
      db.insert(students).values({
        semesterId,
        studentNumber: `${MARK}-dup`,
        name: "Z W",
      })
    ).rejects.toThrow();

    const [otherSem] = await db
      .insert(semesters)
      .values({ name: `${MARK} S3` })
      .returning();
    await expect(
      db.insert(students).values({
        semesterId: otherSem.id,
        studentNumber: `${MARK}-dup`,
        name: "Z W",
      })
    ).resolves.toBeDefined();
  });

  it("refuses to delete an assessor who still holds a student", async () => {
    const [a] = await db
      .insert(assessors)
      .values({ name: `${MARK} Held`, teamId: teamOwning })
      .returning();
    await db.insert(students).values({
      semesterId,
      studentNumber: `${MARK}-held`,
      name: "X Y",
      firstAssessorId: a.id,
    });
    await expect(
      db.delete(assessors).where(eq(assessors.id, a.id))
    ).rejects.toThrow();
  });
});
