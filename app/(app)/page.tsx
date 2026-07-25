import Link from "next/link";
import { CircleAlert, TriangleAlert } from "lucide-react";

import { getActiveSemester } from "@/lib/semester";
import { getStudentsForSemester, type StudentRow } from "@/lib/students";
import { getAssessorOptions } from "@/lib/assessor-options";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const semester = await getActiveSemester();
  if (!semester) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <p className="text-sm">
              No semester exists yet. Create one to start coordinating.
            </p>
            <Button asChild>
              <Link href="/settings">Go to Settings</Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  const [students, assessors] = await Promise.all([
    getStudentsForSemester(semester.id),
    getAssessorOptions(semester.id),
  ]);

  const approved = students.filter((s) => s.internshipStatus === "approved");
  const fullyAssigned = students.filter(
    (s) => s.firstAssessorId && s.secondAssessorId
  );
  const missingFirst = students.filter((s) => !s.firstAssessorId);
  const missingSecond = students.filter((s) => !s.secondAssessorId);

  // The flag asked for: assessors assigned before the internship is approved.
  const assignedNotApproved = students.filter(
    (s) =>
      (s.firstAssessorId || s.secondAssessorId) &&
      s.internshipStatus !== "approved"
  );
  // And the mirror: approved but nobody assigned yet.
  const approvedNotAssigned = approved.filter(
    (s) => !s.firstAssessorId || !s.secondAssessorId
  );

  const remaining = assessors.reduce((n, a) => n + a.remaining, 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Overview for ${semester.name}.`}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Students" value={students.length} />
        <Stat
          label="Approved internship"
          value={approved.length}
          hint={`of ${students.length}`}
        />
        <Stat
          label="Fully assigned"
          value={fullyAssigned.length}
          hint="both assessors"
        />
        <Stat label="Missing 1st" value={missingFirst.length} />
        <Stat label="Remaining capacity" value={remaining} hint="1st slots" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AttentionList
          title="Assessors assigned, internship not approved"
          description="These students have an assessor but no approved internship yet."
          icon={<TriangleAlert className="text-warning size-4" />}
          students={assignedNotApproved}
          emptyMessage="Nothing to flag — every assigned student has an approved internship."
        />
        <AttentionList
          title="Approved internship, assessors missing"
          description="These students are approved but still need an assessor."
          icon={<CircleAlert className="text-destructive size-4" />}
          students={approvedNotAssigned}
          emptyMessage="Every approved student has both assessors."
        />
      </div>

      {missingSecond.length > 0 && (
        <p className="text-muted-foreground mt-4 text-sm">
          {missingSecond.length} student
          {missingSecond.length === 1 ? "" : "s"} still need a 2nd assessor.{" "}
          <Link href="/planning" className="underline">
            Open the planning board
          </Link>
          .
        </p>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent>
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function AttentionList({
  title,
  description,
  icon,
  students,
  emptyMessage,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  students: StudentRow[];
  emptyMessage: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
          <span className="text-muted-foreground ml-auto text-sm font-normal tabular-nums">
            {students.length}
          </span>
        </CardTitle>
        <p className="text-muted-foreground text-sm">{description}</p>
      </CardHeader>
      <CardContent>
        {students.length === 0 ? (
          <p className="text-muted-foreground text-sm">{emptyMessage}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {students.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <Link
                    href={`/students/${s.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {s.name}
                  </Link>
                  <p className="text-muted-foreground truncate text-xs">
                    {s.studentNumber}
                    {s.firstAssessorName ? ` · 1st: ${s.firstAssessorName}` : ""}
                    {s.secondAssessorName
                      ? ` · 2nd: ${s.secondAssessorName}`
                      : ""}
                  </p>
                </div>
                <StatusBadge status={s.internshipStatus} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
