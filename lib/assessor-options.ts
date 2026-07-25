import { asc, eq } from "drizzle-orm";

import { assessors, teams } from "@/db/schema";
import { db } from "@/lib/db";
import { getAssessorLoads } from "@/lib/capacity";
import type { AssessorOption } from "@/components/assessor-combobox";

/**
 * Options for the assessor combobox: everyone available in this semester, with
 * their live load. Capacity numbers come from lib/capacity.ts — this only
 * decorates them with the team name for display.
 */
export async function getAssessorOptions(
  semesterId: number
): Promise<AssessorOption[]> {
  const [loads, teamRows] = await Promise.all([
    getAssessorLoads(semesterId),
    db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .orderBy(asc(teams.name)),
  ]);
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]));

  return loads.map((l) => ({
    ...l,
    teamName: teamName.get(l.teamId) ?? "—",
  }));
}

/** Assessors regardless of semester availability (for reference lists). */
export async function getAllAssessors() {
  return db
    .select({
      id: assessors.id,
      name: assessors.name,
      teamId: assessors.teamId,
      teamName: teams.name,
      isActive: assessors.isActive,
    })
    .from(assessors)
    .innerJoin(teams, eq(teams.id, assessors.teamId))
    .orderBy(asc(assessors.name));
}
