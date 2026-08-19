import Link from "next/link";
import { asc } from "drizzle-orm";
import { Download, Printer } from "lucide-react";

import { db } from "@/lib/db";
import { teams } from "@/db/schema";
import { getActiveSemester } from "@/lib/semester";
import { getAssessorImportContext, getImportContext } from "./actions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImportWizard } from "./import-wizard";
import { AssessorImportWizard } from "./assessor-import-wizard";

export const metadata = { title: "Import / Export — Internship Coordination" };

export default async function ImportPage() {
  const semester = await getActiveSemester();
  const [allTeams, assessorContext, studentContext] = await Promise.all([
    db.select().from(teams).orderBy(asc(teams.name)),
    getAssessorImportContext(),
    semester ? getImportContext(semester.id) : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title="Import / Export"
        description={
          semester
            ? `Bring the workbook into ${semester.name}, or export the current data back to Excel.`
            : "Create a semester in Settings to import students."
        }
      />
      <div className="flex flex-col gap-4">
        {semester && (
          <Card>
            <CardHeader>
              <CardTitle>Export</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <p className="text-muted-foreground text-sm">
                Download every student in {semester.name} as a spreadsheet.
              </p>
              <Button asChild variant="outline" className="ml-auto">
                <a href="/api/export">
                  <Download /> Export to .xlsx
                </a>
              </Button>
            </CardContent>
          </Card>
        )}

        {semester && (
          <Card>
            <CardHeader>
              <CardTitle>Assignment list</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <p className="text-muted-foreground text-sm">
                A printable list of approved assignments — student, topic, and
                both assessors only — for sharing publicly.
              </p>
              <Button asChild variant="outline" className="ml-auto">
                <Link href="/students/print" target="_blank">
                  <Printer /> Open printable list
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Import</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="students">
              <TabsList>
                <TabsTrigger value="students">Students</TabsTrigger>
                <TabsTrigger value="assessors">Assessors</TabsTrigger>
              </TabsList>
              <TabsContent value="students" className="pt-4">
                {semester && studentContext ? (
                  <ImportWizard
                    semesterId={semester.id}
                    semesterName={semester.name}
                    context={studentContext}
                    teams={allTeams}
                  />
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Create a semester in Settings first.
                  </p>
                )}
              </TabsContent>
              <TabsContent value="assessors" className="pt-4">
                <AssessorImportWizard context={assessorContext} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
