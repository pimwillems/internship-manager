import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
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
import { parseRows, type ImportField, type RawRow } from "@/lib/excel/import";

// The commit action pulls in next/cache + the auth guard; stub both so the
// transactional import logic can be exercised directly.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/guard", () => ({
  requireCoordinator: async () => ({ id: null, email: "test@example.com" }),
}));

const { commitImport } = await import("@/app/(app)/import/actions");

const MARK = "__test_import__";

let teamId: number;
let semesterId: number;

const MAPPING: Record<string, ImportField> = {
  Nummer: "studentNumber",
  Naam: "fullName",
  Topic: "topic",
  Status: "internshipStatus",
  Bedrijf: "company",
  "1e assessor": "firstAssessor",
  "2e assessor": "secondAssessor",
};

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

function parse(rows: RawRow[], known: { topics?: string[]; assessors?: string[]; existing?: string[] } = {}) {
  return parseRows(rows, MAPPING, {
    knownTopics: new Set((known.topics ?? []).map((t) => t.toLowerCase())),
    knownAssessors: new Set((known.assessors ?? []).map((a) => a.toLowerCase())),
    existingStudentNumbers: new Set(known.existing ?? []),
  });
}

beforeEach(async () => {
  await cleanup();
  const [team] = await db
    .insert(teams)
    .values({ name: `${MARK} Team` })
    .returning();
  teamId = team.id;
  const [sem] = await db
    .insert(semesters)
    .values({ name: `${MARK} S1` })
    .returning();
  semesterId = sem.id;
});

afterAll(async () => {
  await cleanup();
});

const OPTS = {
  createMissingTopics: false,
  createMissingAssessors: false,
  defaultTeamId: null as number | null,
};

describe("commitImport", () => {
  it("creates students from clean rows", async () => {
    const rows = parse([
      { Nummer: `${MARK}1`, Naam: "Sam Visser", Bedrijf: "Acme", Status: "ja" },
      { Nummer: `${MARK}2`, Naam: "Robin Koning", Status: "nee" },
    ]);
    const result = await commitImport(semesterId, rows, OPTS);
    expect(result).toMatchObject({ ok: true, created: 2, updated: 0, skipped: 0 });

    const written = await db
      .select()
      .from(students)
      .where(eq(students.semesterId, semesterId));
    expect(written).toHaveLength(2);
    expect(written.find((s) => s.studentNumber === `${MARK}1`)).toMatchObject({
      firstName: "Sam",
      lastName: "Visser",
      company: "Acme",
      internshipStatus: "approved",
    });
  });

  it("updates rather than duplicates an existing student number", async () => {
    await db.insert(students).values({
      semesterId,
      studentNumber: `${MARK}1`,
      firstName: "Old",
      lastName: "Name",
      company: "Old Co",
    });

    const rows = parse(
      [{ Nummer: `${MARK}1`, Naam: "New Name", Bedrijf: "New Co" }],
      { existing: [`${MARK}1`] }
    );
    const result = await commitImport(semesterId, rows, OPTS);
    expect(result).toMatchObject({ ok: true, created: 0, updated: 1 });

    const written = await db
      .select()
      .from(students)
      .where(eq(students.semesterId, semesterId));
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ firstName: "New", company: "New Co" });
  });

  it("skips rows with errors and imports the rest", async () => {
    const rows = parse([
      { Nummer: `${MARK}1`, Naam: "Good Row" },
      { Nummer: "", Naam: "" }, // missing number and name
    ]);
    const result = await commitImport(semesterId, rows, OPTS);
    expect(result).toMatchObject({ ok: true, created: 1, skipped: 1 });
  });

  it("refuses an import where every row is broken, writing nothing", async () => {
    const rows = parse([{ Nummer: "", Naam: "" }]);
    const result = await commitImport(semesterId, rows, OPTS);
    expect(result.ok).toBe(false);
    const written = await db
      .select()
      .from(students)
      .where(eq(students.semesterId, semesterId));
    expect(written).toHaveLength(0);
  });

  it("creates missing topics and assessors only when asked, on the chosen team", async () => {
    const rows = parse([
      { Nummer: `${MARK}1`, Naam: "Sam Visser", Topic: "NewTopic", "1e assessor": "New Assessor" },
    ]);

    // Off by default: the names are simply not resolved.
    await commitImport(semesterId, rows, OPTS);
    let student = (
      await db.select().from(students).where(eq(students.semesterId, semesterId))
    )[0];
    expect(student.topicId).toBeNull();
    expect(student.firstAssessorId).toBeNull();

    // On: both get created under the given team.
    await commitImport(semesterId, parse([
      { Nummer: `${MARK}1`, Naam: "Sam Visser", Topic: "NewTopic", "1e assessor": "New Assessor" },
    ], { existing: [`${MARK}1`] }), {
      createMissingTopics: true,
      createMissingAssessors: true,
      defaultTeamId: teamId,
    });

    const topic = await db.query.topics.findFirst({
      where: eq(topics.name, "NewTopic"),
    });
    const assessor = await db.query.assessors.findFirst({
      where: eq(assessors.name, "New Assessor"),
    });
    expect(topic?.teamId).toBe(teamId);
    expect(assessor?.teamId).toBe(teamId);

    student = (
      await db.select().from(students).where(eq(students.semesterId, semesterId))
    )[0];
    expect(student.topicId).toBe(topic!.id);
    // A newly created assessor has no capacity row yet, so the cap check
    // deliberately leaves them off the student.
    expect(student.firstAssessorId).toBeNull();
  });

  it("honours the 1st-assessor maximum: the overflow student is imported without one", async () => {
    const [a] = await db
      .insert(assessors)
      .values({ name: `${MARK} Cap`, teamId })
      .returning();
    await db
      .insert(assessorCapacity)
      .values({ assessorId: a.id, semesterId, maxAsFirst: 1 });

    const rows = parse(
      [
        { Nummer: `${MARK}1`, Naam: "First Student", "1e assessor": `${MARK} Cap` },
        { Nummer: `${MARK}2`, Naam: "Second Student", "1e assessor": `${MARK} Cap` },
      ],
      { assessors: [`${MARK} Cap`] }
    );

    const result = await commitImport(semesterId, rows, OPTS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(2);
    expect(result.capacityWarnings).toHaveLength(1);
    expect(result.capacityWarnings[0]).toMatch(/maximum of 1/);

    const written = await db
      .select()
      .from(students)
      .where(eq(students.semesterId, semesterId));
    const assigned = written.filter((s) => s.firstAssessorId === a.id);
    // The database never exceeded the maximum.
    expect(assigned).toHaveLength(1);
  });

  it("never writes the same person into both assessor slots", async () => {
    const [a] = await db
      .insert(assessors)
      .values({ name: `${MARK} Solo`, teamId })
      .returning();
    await db
      .insert(assessorCapacity)
      .values({ assessorId: a.id, semesterId, maxAsFirst: 5 });

    // parseRows flags an exact duplicate as an error, so use differing case
    // in a way that still resolves to the same assessor id.
    const rows = parse(
      [
        {
          Nummer: `${MARK}1`,
          Naam: "Sam Visser",
          "1e assessor": `${MARK} Solo`,
          "2e assessor": ` ${MARK} Solo `,
        },
      ],
      { assessors: [`${MARK} Solo`] }
    );
    // Clear the parser's duplicate error to test the commit-side guard.
    rows[0].errors = [];

    const result = await commitImport(semesterId, rows, OPTS);
    expect(result.ok).toBe(true);

    const [written] = await db
      .select()
      .from(students)
      .where(eq(students.semesterId, semesterId));
    expect(written.firstAssessorId).toBe(a.id);
    expect(written.secondAssessorId).toBeNull();
  });

  it("imports into the given semester only", async () => {
    const [other] = await db
      .insert(semesters)
      .values({ name: `${MARK} S2` })
      .returning();
    await commitImport(semesterId, parse([{ Nummer: `${MARK}1`, Naam: "A B" }]), OPTS);

    const inOther = await db
      .select()
      .from(students)
      .where(eq(students.semesterId, other.id));
    expect(inOther).toHaveLength(0);
  });
});
