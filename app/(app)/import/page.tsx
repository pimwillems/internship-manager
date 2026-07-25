import { asc } from "drizzle-orm";

import { db } from "@/lib/db";
import { teams } from "@/db/schema";
import { getActiveSemester } from "@/lib/semester";
import { getImportContext } from "./actions";
import { PageHeader } from "@/components/page-header";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import / Export — Internship Coordination" };

export default async function ImportPage() {
  const semester = await getActiveSemester();
  if (!semester) {
    return (
      <>
        <PageHeader title="Import / Export" />
        <p className="text-muted-foreground text-sm">
          Create a semester in Settings first.
        </p>
      </>
    );
  }

  const [context, allTeams] = await Promise.all([
    getImportContext(semester.id),
    db.select().from(teams).orderBy(asc(teams.name)),
  ]);

  return (
    <>
      <PageHeader
        title="Import / Export"
        description={`Bring the workbook into ${semester.name}, or export the current data back to Excel.`}
      />
      <ImportWizard
        semesterId={semester.id}
        semesterName={semester.name}
        context={context}
        teams={allTeams}
      />
    </>
  );
}
