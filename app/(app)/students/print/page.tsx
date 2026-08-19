import { getActiveSemester } from "@/lib/semester";
import { getStudentsForSemester } from "@/lib/students";
import { PrintButton } from "./print-button";

export const metadata = { title: "Assignments — Internship Coordination" };

export default async function StudentsPrintPage() {
  const semester = await getActiveSemester();
  if (!semester) {
    return (
      <p className="text-muted-foreground p-6 text-sm">
        Create a semester in Settings first.
      </p>
    );
  }

  const rows = (await getStudentsForSemester(semester.id)).filter(
    (r) => r.internshipStatus === "approved"
  );

  return (
    <div className="mx-auto max-w-3xl p-6 print:p-0">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Internship assignments
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {semester.name} &middot; {rows.length} approved assignment
            {rows.length === 1 ? "" : "s"}
          </p>
        </div>
        <PrintButton />
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No approved assignments yet.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4 font-medium">Student</th>
              <th className="py-2 pr-4 font-medium">Topic</th>
              <th className="py-2 pr-4 font-medium">1st assessor</th>
              <th className="py-2 font-medium">2nd assessor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="py-2 pr-4">{r.name}</td>
                <td className="py-2 pr-4">{r.topicName ?? "—"}</td>
                <td className="py-2 pr-4">{r.firstAssessorName ?? "—"}</td>
                <td className="py-2">{r.secondAssessorName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
