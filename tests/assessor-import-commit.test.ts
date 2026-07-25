import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { assessorCapacity, assessors, teams } from "@/db/schema";
import {
  parseAssessorRows,
  type AssessorImportField,
  type RawRow,
} from "@/lib/excel/import";

// The commit action pulls in next/cache + the auth guard; stub both so the
// transactional import logic can be exercised directly.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/guard", () => ({
  requireCoordinator: async () => ({ id: null, email: "test@example.com" }),
}));

const { commitAssessorImport } = await import("@/app/(app)/import/actions");

const MARK = "__test_assessor_import__";

let teamId: number;

const MAPPING: Record<string, AssessorImportField> = {
  Naam: "name",
  Email: "email",
  Team: "team",
  Actief: "isActive",
};

async function cleanup() {
  const t = await db
    .select({ id: teams.id })
    .from(teams)
    .where(sql`${teams.name} like ${MARK + "%"}`);
  const teamIds = t.map((x) => x.id);
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
  }
  if (teamIds.length) await db.delete(teams).where(inArray(teams.id, teamIds));
}

function parse(rows: RawRow[], known: { teams?: string[]; existing?: string[] } = {}) {
  return parseAssessorRows(rows, MAPPING, {
    knownTeams: new Set((known.teams ?? []).map((t) => t.toLowerCase())),
    existingAssessorNames: new Set(
      (known.existing ?? []).map((a) => a.toLowerCase())
    ),
  });
}

beforeEach(async () => {
  await cleanup();
  const [team] = await db
    .insert(teams)
    .values({ name: `${MARK} Team` })
    .returning();
  teamId = team.id;
});

afterAll(async () => {
  await cleanup();
});

describe("commitAssessorImport", () => {
  it("creates assessors from clean rows", async () => {
    const rows = parse(
      [
        { Naam: `${MARK} Alex`, Email: "alex@example.com", Team: `${MARK} Team` },
        { Naam: `${MARK} Bo`, Team: `${MARK} Team`, Actief: "nee" },
      ],
      { teams: [`${MARK} Team`] }
    );
    const result = await commitAssessorImport(rows, { createMissingTeams: false });
    expect(result).toMatchObject({ ok: true, created: 2, updated: 0, skipped: 0 });

    const written = await db
      .select()
      .from(assessors)
      .where(eq(assessors.teamId, teamId));
    expect(written).toHaveLength(2);
    expect(written.find((a) => a.name === `${MARK} Alex`)).toMatchObject({
      email: "alex@example.com",
      isActive: true,
    });
    expect(written.find((a) => a.name === `${MARK} Bo`)).toMatchObject({
      isActive: false,
    });
  });

  it("updates rather than duplicates an existing assessor name", async () => {
    await db
      .insert(assessors)
      .values({ name: `${MARK} Alex`, teamId, email: "old@example.com" });

    const rows = parse(
      [{ Naam: `${MARK} Alex`, Email: "new@example.com", Team: `${MARK} Team` }],
      { teams: [`${MARK} Team`], existing: [`${MARK} Alex`] }
    );
    const result = await commitAssessorImport(rows, { createMissingTeams: false });
    expect(result).toMatchObject({ ok: true, created: 0, updated: 1 });

    const written = await db
      .select()
      .from(assessors)
      .where(eq(assessors.teamId, teamId));
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ email: "new@example.com" });
  });

  it("skips rows with errors and imports the rest", async () => {
    const rows = parse(
      [
        { Naam: `${MARK} Good`, Team: `${MARK} Team` },
        { Naam: "", Team: "" },
      ],
      { teams: [`${MARK} Team`] }
    );
    const result = await commitAssessorImport(rows, { createMissingTeams: false });
    expect(result).toMatchObject({ ok: true, created: 1, skipped: 1 });
  });

  it("refuses an import where every row is broken, writing nothing", async () => {
    const rows = parse([{ Naam: "", Team: "" }]);
    const result = await commitAssessorImport(rows, { createMissingTeams: false });
    expect(result.ok).toBe(false);
  });

  it("skips rows whose team can't be resolved when creation is off", async () => {
    const rows = parse([{ Naam: `${MARK} Orphan`, Team: `${MARK} Unknown Team` }]);
    const result = await commitAssessorImport(rows, { createMissingTeams: false });
    expect(result).toMatchObject({ ok: true, created: 0, updated: 0, skipped: 1 });

    const written = await db.query.assessors.findFirst({
      where: eq(assessors.name, `${MARK} Orphan`),
    });
    expect(written).toBeUndefined();
  });

  it("creates missing teams only when asked", async () => {
    const rows = parse([{ Naam: `${MARK} New`, Team: `${MARK} Brand New Team` }]);

    const result = await commitAssessorImport(rows, { createMissingTeams: true });
    expect(result).toMatchObject({ ok: true, created: 1, skipped: 0 });

    const team = await db.query.teams.findFirst({
      where: eq(teams.name, `${MARK} Brand New Team`),
    });
    expect(team).toBeDefined();

    const assessor = await db.query.assessors.findFirst({
      where: eq(assessors.name, `${MARK} New`),
    });
    expect(assessor?.teamId).toBe(team!.id);

    // Clean up the extra team this test created.
    await db.delete(assessors).where(eq(assessors.id, assessor!.id));
    await db.delete(teams).where(eq(teams.id, team!.id));
  });
});
