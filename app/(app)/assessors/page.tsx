import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { assessors, students, teams } from "@/db/schema";
import { getActiveSemester } from "@/lib/semester";
import { getAssessorLoads } from "@/lib/capacity";
import { PageHeader } from "@/components/page-header";
import { AssessorsTable } from "./assessors-table";

export const metadata = { title: "Assessors — Internship Coordination" };

export default async function AssessorsPage() {
  const semester = await getActiveSemester();

  const [allAssessors, allTeams] = await Promise.all([
    db
      .select({
        id: assessors.id,
        name: assessors.name,
        email: assessors.email,
        teamId: assessors.teamId,
        teamName: teams.name,
        isActive: assessors.isActive,
      })
      .from(assessors)
      .innerJoin(teams, eq(teams.id, assessors.teamId))
      .orderBy(asc(assessors.name)),
    db.select().from(teams).orderBy(asc(teams.name)),
  ]);

  const loads = semester ? await getAssessorLoads(semester.id) : [];
  const loadById = new Map(loads.map((l) => [l.assessorId, l]));

  // Students held by each assessor this semester, for the expandable row.
  const held = semester
    ? await db
        .select({
          id: students.id,
          firstName: students.firstName,
          lastName: students.lastName,
          studentNumber: students.studentNumber,
          firstAssessorId: students.firstAssessorId,
          secondAssessorId: students.secondAssessorId,
        })
        .from(students)
        .where(eq(students.semesterId, semester.id))
        .orderBy(asc(students.lastName))
    : [];

  const rows = allAssessors.map((a) => {
    const load = loadById.get(a.id);
    return {
      ...a,
      available: Boolean(load),
      maxAsFirst: load?.maxAsFirst ?? null,
      usedAsFirst: load?.usedAsFirst ?? 0,
      usedAsSecond: load?.usedAsSecond ?? 0,
      remaining: load?.remaining ?? 0,
      firstStudents: held
        .filter((s) => s.firstAssessorId === a.id)
        .map((s) => `${s.studentNumber} · ${s.firstName} ${s.lastName}`),
      secondStudents: held
        .filter((s) => s.secondAssessorId === a.id)
        .map((s) => `${s.studentNumber} · ${s.firstName} ${s.lastName}`),
    };
  });

  return (
    <>
      <PageHeader
        title="Assessors"
        description={
          semester
            ? `Who assesses in ${semester.name}, and how many students each takes as 1st assessor. Availability and maximums are per semester; the team stays fixed.`
            : "Create a semester in Settings before setting capacity."
        }
      />
      <AssessorsTable
        rows={rows}
        teams={allTeams}
        semesterId={semester?.id ?? null}
        semesterName={semester?.name ?? null}
      />
    </>
  );
}
