import * as XLSX from "xlsx";

import type { StudentRow } from "@/lib/students";
import { STATUS_LABELS } from "@/lib/status-labels";

/** Column order of the exported sheet — mirrors the original workbook. */
const COLUMNS = [
  "Student number",
  "Name",
  "Email",
  "Topic",
  "Team",
  "Internship status",
  "Company",
  "Assignment description",
  "1st assessor",
  "2nd assessor",
  "Remarks",
] as const;

export function buildStudentsWorkbook(
  rows: StudentRow[],
  semesterName: string
): Uint8Array {
  const data = rows.map((r) => ({
    "Student number": r.studentNumber,
    Name: r.name,
    Email: r.email ?? "",
    Topic: r.topicName ?? "",
    Team: r.topicTeamName ?? "",
    "Internship status": STATUS_LABELS[r.internshipStatus],
    Company: r.company ?? "",
    "Assignment description": r.assignmentDescription ?? "",
    "1st assessor": r.firstAssessorName ?? "",
    "2nd assessor": r.secondAssessorName ?? "",
    Remarks: r.remarks ?? "",
  }));

  const sheet = XLSX.utils.json_to_sheet(data, {
    header: [...COLUMNS],
  });

  // Roughly size the columns so the file is readable when opened.
  sheet["!cols"] = COLUMNS.map((col) => {
    const longest = data.reduce(
      (max, row) => Math.max(max, String(row[col] ?? "").length),
      col.length
    );
    return { wch: Math.min(60, Math.max(12, longest + 2)) };
  });

  const wb = XLSX.utils.book_new();
  // Sheet names cannot exceed 31 chars or contain []:*?/\
  const safeName = semesterName.replace(/[[\]:*?/\\]/g, "-").slice(0, 31);
  XLSX.utils.book_append_sheet(wb, sheet, safeName || "Students");

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}

export function exportFileName(semesterName: string): string {
  const slug = semesterName.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-|-$/g, "");
  const today = new Date().toISOString().slice(0, 10);
  return `students-${slug || "export"}-${today}.xlsx`;
}
