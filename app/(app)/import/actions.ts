"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { assessors, students, teams, topics } from "@/db/schema";
import { db } from "@/lib/db";
import { requireCoordinator } from "@/lib/guard";
import { recordAudit } from "@/lib/audit";
import { CapacityError, assertCanAssignFirst } from "@/lib/capacity";
import type { ParsedAssessorRow, ParsedRow } from "@/lib/excel/import";

export type ImportResult =
  | {
      ok: true;
      created: number;
      updated: number;
      skipped: number;
      capacityWarnings: string[];
    }
  | { ok: false; error: string };

/** Reference data the preview step needs to validate against. */
export async function getImportContext(semesterId: number) {
  await requireCoordinator();
  const [topicRows, assessorRows, studentRows, teamRows] = await Promise.all([
    db.select({ id: topics.id, name: topics.name }).from(topics),
    db
      .select({
        id: assessors.id,
        name: assessors.name,
        teamId: assessors.teamId,
      })
      .from(assessors),
    db
      .select({ studentNumber: students.studentNumber })
      .from(students)
      .where(eq(students.semesterId, semesterId)),
    db.select({ id: teams.id, name: teams.name }).from(teams),
  ]);
  return {
    topics: topicRows,
    assessors: assessorRows,
    existingStudentNumbers: studentRows.map((s) => s.studentNumber),
    teams: teamRows,
  };
}

/**
 * Commit the previewed rows in a single transaction: nothing is written unless
 * everything that should be written can be.
 *
 * Rows with errors are skipped (they were shown in the preview). Existing
 * student numbers are updated rather than duplicated. Capacity is still checked
 * per 1st-assessor assignment via lib/capacity.ts — when the file would push
 * someone over their maximum, that student is imported without a 1st assessor
 * and the reason is reported, rather than failing the whole import.
 */
export async function commitImport(
  semesterId: number,
  rows: ParsedRow[],
  options: {
    createMissingTopics: boolean;
    createMissingAssessors: boolean;
    /** Team new assessors and topics are attached to. */
    defaultTeamId: number | null;
  }
): Promise<ImportResult> {
  const user = await requireCoordinator();

  const valid = rows.filter((r) => r.errors.length === 0);
  const skipped = rows.length - valid.length;
  if (valid.length === 0) {
    return { ok: false, error: "No importable rows — every row has an error." };
  }

  const capacityWarnings: string[] = [];

  try {
    const { created, updated } = await db.transaction(async (tx) => {
      // Resolve (and optionally create) topics and assessors first.
      const topicRows = await tx
        .select({ id: topics.id, name: topics.name })
        .from(topics);
      const topicByName = new Map(
        topicRows.map((t) => [t.name.toLowerCase(), t.id])
      );

      const assessorRows = await tx
        .select({ id: assessors.id, name: assessors.name })
        .from(assessors);
      const assessorByName = new Map(
        assessorRows.map((a) => [a.name.toLowerCase(), a.id])
      );

      if (options.defaultTeamId) {
        if (options.createMissingTopics) {
          const missing = [
            ...new Set(
              valid
                .map((r) => r.topic)
                .filter((t) => t && !topicByName.has(t.toLowerCase()))
            ),
          ];
          for (const name of missing) {
            const [row] = await tx
              .insert(topics)
              .values({ name, teamId: options.defaultTeamId })
              .returning();
            topicByName.set(name.toLowerCase(), row.id);
          }
        }
        if (options.createMissingAssessors) {
          const teamRows = await tx
            .select({ id: teams.id, name: teams.name })
            .from(teams);
          const teamByName = new Map(
            teamRows.map((t) => [t.name.toLowerCase(), t.id])
          );

          // The sheet's Team column (if mapped) tells us which team a new
          // assessor belongs to; the first row that names them and carries a
          // recognised team wins. Falls back to the default team below.
          const teamForAssessor = new Map<string, number>();
          for (const row of valid) {
            for (const assessorName of [row.firstAssessor, row.secondAssessor]) {
              if (!assessorName || !row.team) continue;
              const key = assessorName.toLowerCase();
              if (teamForAssessor.has(key)) continue;
              const teamId = teamByName.get(row.team.toLowerCase());
              if (teamId) teamForAssessor.set(key, teamId);
            }
          }

          const missing = [
            ...new Set(
              valid
                .flatMap((r) => [r.firstAssessor, r.secondAssessor])
                .filter((a) => a && !assessorByName.has(a.toLowerCase()))
            ),
          ];
          for (const name of missing) {
            const teamId =
              teamForAssessor.get(name.toLowerCase()) ?? options.defaultTeamId;
            const [row] = await tx
              .insert(assessors)
              .values({ name, teamId })
              .returning();
            assessorByName.set(name.toLowerCase(), row.id);
            // New assessors start unavailable: the coordinator sets their
            // maximum on the Assessors page, which is what makes them
            // assignable this semester.
          }
        }
      }

      const existing = await tx
        .select({ id: students.id, studentNumber: students.studentNumber })
        .from(students)
        .where(eq(students.semesterId, semesterId));
      const existingByNumber = new Map(
        existing.map((s) => [s.studentNumber, s.id])
      );

      let created = 0;
      let updated = 0;

      for (const row of valid) {
        const topicId = row.topic
          ? (topicByName.get(row.topic.toLowerCase()) ?? null)
          : null;
        let firstAssessorId = row.firstAssessor
          ? (assessorByName.get(row.firstAssessor.toLowerCase()) ?? null)
          : null;
        const secondAssessorId = row.secondAssessor
          ? (assessorByName.get(row.secondAssessor.toLowerCase()) ?? null)
          : null;

        const studentId = existingByNumber.get(row.studentNumber);

        // The 1st-assessor maximum still applies to imported data.
        if (firstAssessorId) {
          try {
            await assertCanAssignFirst(tx, {
              assessorId: firstAssessorId,
              semesterId,
              excludeStudentId: studentId,
            });
          } catch (err) {
            if (err instanceof CapacityError) {
              capacityWarnings.push(
                `Row ${row.rowNumber} (${row.studentNumber}): ${err.message} Imported without a 1st assessor.`
              );
              firstAssessorId = null;
            } else {
              throw err;
            }
          }
        }

        // Never write the same person into both slots.
        const safeSecond =
          secondAssessorId && secondAssessorId === firstAssessorId
            ? null
            : secondAssessorId;

        const values = {
          studentNumber: row.studentNumber,
          name: row.name,
          email: row.email || null,
          topicId,
          internshipStatus: row.internshipStatus,
          company: row.company || null,
          assignmentDescription: row.assignmentDescription || null,
          remarks: row.remarks || null,
          firstAssessorId,
          secondAssessorId: safeSecond,
        };

        if (studentId) {
          await tx
            .update(students)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(students.id, studentId));
          updated++;
        } else {
          await tx.insert(students).values({ ...values, semesterId });
          created++;
        }
      }

      await recordAudit(
        {
          userId: user.id,
          entity: "import",
          entityId: semesterId,
          action: "create",
          changes: {
            created,
            updated,
            skipped,
            capacityWarnings: capacityWarnings.length,
          },
        },
        tx
      );

      return { created, updated };
    });

    revalidatePath("/students");
    revalidatePath("/planning");
    revalidatePath("/");
    revalidatePath("/assessors");
    return { ok: true, created, updated, skipped, capacityWarnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Import failed and nothing was written: ${message}`,
    };
  }
}

export type AssessorImportResult =
  | { ok: true; created: number; updated: number; skipped: number }
  | { ok: false; error: string };

/** Reference data the assessor-import preview step needs. */
export async function getAssessorImportContext() {
  await requireCoordinator();
  const [teamRows, assessorRows] = await Promise.all([
    db.select({ id: teams.id, name: teams.name }).from(teams),
    db.select({ id: assessors.id, name: assessors.name }).from(assessors),
  ]);
  return {
    teams: teamRows,
    existingAssessorNames: assessorRows.map((a) => a.name),
  };
}

/**
 * Commit previewed assessor rows in a single transaction: nothing is written
 * unless everything that should be written can be.
 *
 * Matches on name (case-insensitive): an assessor that already exists is
 * updated in place rather than duplicated, the same convention as the student
 * import. Assessors aren't semester-scoped, so this has no semesterId — team
 * is a hard NOT NULL column, so a row whose team can't be resolved (unknown
 * name, and creation not enabled) is skipped rather than failing the import.
 */
export async function commitAssessorImport(
  rows: ParsedAssessorRow[],
  options: { createMissingTeams: boolean }
): Promise<AssessorImportResult> {
  const user = await requireCoordinator();

  const valid = rows.filter((r) => r.errors.length === 0);
  let skipped = rows.length - valid.length;
  if (valid.length === 0) {
    return { ok: false, error: "No importable rows — every row has an error." };
  }

  try {
    const { created, updated } = await db.transaction(async (tx) => {
      const teamRows = await tx
        .select({ id: teams.id, name: teams.name })
        .from(teams);
      const teamByName = new Map(
        teamRows.map((t) => [t.name.toLowerCase(), t.id])
      );

      if (options.createMissingTeams) {
        const missing = [
          ...new Set(
            valid
              .map((r) => r.team)
              .filter((t) => t && !teamByName.has(t.toLowerCase()))
          ),
        ];
        for (const name of missing) {
          const [row] = await tx.insert(teams).values({ name }).returning();
          teamByName.set(name.toLowerCase(), row.id);
        }
      }

      const existing = await tx
        .select({ id: assessors.id, name: assessors.name })
        .from(assessors);
      const existingByName = new Map(
        existing.map((a) => [a.name.toLowerCase(), a.id])
      );

      let created = 0;
      let updated = 0;

      for (const row of valid) {
        const teamId = teamByName.get(row.team.toLowerCase());
        if (!teamId) {
          skipped++;
          continue;
        }

        const values = {
          name: row.name,
          email: row.email || null,
          teamId,
          isActive: row.isActive,
        };

        const assessorId = existingByName.get(row.name.toLowerCase());
        if (assessorId) {
          await tx
            .update(assessors)
            .set(values)
            .where(eq(assessors.id, assessorId));
          updated++;
        } else {
          const [inserted] = await tx
            .insert(assessors)
            .values(values)
            .returning();
          existingByName.set(row.name.toLowerCase(), inserted.id);
          created++;
        }
      }

      await recordAudit(
        {
          userId: user.id,
          entity: "import",
          entityId: "assessors",
          action: "create",
          changes: { created, updated, skipped },
        },
        tx
      );

      return { created, updated };
    });

    revalidatePath("/assessors");
    revalidatePath("/students");
    revalidatePath("/planning");
    revalidatePath("/import");
    return { ok: true, created, updated, skipped };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Import failed and nothing was written: ${message}`,
    };
  }
}
