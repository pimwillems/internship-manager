import { getActiveSemester } from "@/lib/semester";
import { getStudentsForSemester } from "@/lib/students";
import { getAssessorOptions } from "@/lib/assessor-options";
import { PageHeader } from "@/components/page-header";
import { PlanningBoard } from "./planning-board";

export const metadata = { title: "Planning — Internship Coordination" };

export default async function PlanningPage() {
  const semester = await getActiveSemester();
  if (!semester) {
    return (
      <>
        <PageHeader title="Planning" />
        <p className="text-muted-foreground text-sm">
          Create a semester in Settings first.
        </p>
      </>
    );
  }

  const [students, assessorOptions] = await Promise.all([
    getStudentsForSemester(semester.id),
    getAssessorOptions(semester.id),
  ]);

  const totalCapacity = assessorOptions.reduce((n, a) => n + a.maxAsFirst, 0);
  const totalRemaining = assessorOptions.reduce((n, a) => n + a.remaining, 0);
  const needFirst = students.filter((s) => !s.firstAssessorId).length;
  const needSecond = students.filter((s) => !s.secondAssessorId).length;

  return (
    <>
      <PageHeader
        title="Planning"
        description={`Capacity across ${semester.name} — the overview the spreadsheet could not give you.`}
      />
      <PlanningBoard
        assessors={assessorOptions}
        students={students}
        totals={{ totalCapacity, totalRemaining, needFirst, needSecond }}
      />
    </>
  );
}
