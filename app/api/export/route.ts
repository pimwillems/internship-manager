import { getSession } from "@/lib/session";
import { getActiveSemester } from "@/lib/semester";
import { getStudentsForSemester } from "@/lib/students";
import { buildStudentsWorkbook, exportFileName } from "@/lib/excel/export";

/** Download the active semester's students as .xlsx. */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const semester = await getActiveSemester();
  if (!semester) return new Response("No semester to export", { status: 400 });

  const rows = await getStudentsForSemester(semester.id);
  const workbook = buildStudentsWorkbook(rows, semester.name);

  return new Response(workbook as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFileName(semester.name)}"`,
      "Cache-Control": "no-store",
    },
  });
}
