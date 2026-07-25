import Link from "next/link";
import { Plus } from "lucide-react";

import { getActiveSemester } from "@/lib/semester";
import { getStudentsForSemester, getTopicOptions } from "@/lib/students";
import { getAssessorOptions } from "@/lib/assessor-options";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StudentsTable } from "./students-table";

export const metadata = { title: "Students — Internship Coordination" };

export default async function StudentsPage() {
  const semester = await getActiveSemester();
  if (!semester) {
    return (
      <>
        <PageHeader title="Students" />
        <p className="text-muted-foreground text-sm">
          Create a semester in Settings first.
        </p>
      </>
    );
  }

  const [rows, topicOptions, assessorOptions] = await Promise.all([
    getStudentsForSemester(semester.id),
    getTopicOptions(),
    getAssessorOptions(semester.id),
  ]);

  return (
    <>
      <PageHeader
        title="Students"
        description={`${rows.length} student${rows.length === 1 ? "" : "s"} in ${semester.name}.`}
      >
        <Button asChild variant="outline">
          <Link href="/import">Import / Export</Link>
        </Button>
        <Button asChild>
          <Link href="/students/new">
            <Plus /> New student
          </Link>
        </Button>
      </PageHeader>
      <StudentsTable
        rows={rows}
        topics={topicOptions}
        assessorOptions={assessorOptions}
      />
    </>
  );
}
