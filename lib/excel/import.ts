import * as XLSX from "xlsx";

import type { InternshipStatus } from "@/db/schema";

/** Fields an imported column can be mapped onto. */
export const IMPORT_FIELDS = [
  "studentNumber",
  "firstName",
  "lastName",
  "fullName",
  "email",
  "topic",
  "internshipStatus",
  "company",
  "assignmentDescription",
  "remarks",
  "firstAssessor",
  "secondAssessor",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export const FIELD_LABELS: Record<ImportField, string> = {
  studentNumber: "Student number",
  firstName: "First name",
  lastName: "Last name",
  fullName: "Full name (split automatically)",
  email: "Email",
  topic: "Topic",
  internshipStatus: "Internship status",
  company: "Company",
  assignmentDescription: "Assignment description",
  remarks: "Remarks",
  firstAssessor: "1st assessor",
  secondAssessor: "2nd assessor",
};

/** Column header → field, for the remembered default mapping. */
const HEADER_HINTS: Record<string, ImportField> = {
  studentnumber: "studentNumber",
  studentnummer: "studentNumber",
  studentnr: "studentNumber",
  nummer: "studentNumber",
  number: "studentNumber",
  pcn: "studentNumber",
  firstname: "firstName",
  voornaam: "firstName",
  lastname: "lastName",
  achternaam: "lastName",
  name: "fullName",
  naam: "fullName",
  fullname: "fullName",
  student: "fullName",
  email: "email",
  mail: "email",
  "e-mail": "email",
  topic: "topic",
  onderwerp: "topic",
  semestertopic: "topic",
  status: "internshipStatus",
  internshipstatus: "internshipStatus",
  stage: "internshipStatus",
  approved: "internshipStatus",
  akkoord: "internshipStatus",
  company: "company",
  bedrijf: "company",
  organisatie: "company",
  description: "assignmentDescription",
  assignmentdescription: "assignmentDescription",
  opdracht: "assignmentDescription",
  assignment: "assignmentDescription",
  omschrijving: "assignmentDescription",
  remarks: "remarks",
  opmerkingen: "remarks",
  notes: "remarks",
  "1eassessor": "firstAssessor",
  "1stassessor": "firstAssessor",
  firstassessor: "firstAssessor",
  assessor1: "firstAssessor",
  coach: "firstAssessor",
  "2eassessor": "secondAssessor",
  "2ndassessor": "secondAssessor",
  secondassessor: "secondAssessor",
  assessor2: "secondAssessor",
};

function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[\s_.]/g, "");
}

/** Best-guess mapping of sheet headers onto fields. */
export function suggestMapping(headers: string[]): Record<string, ImportField> {
  const mapping: Record<string, ImportField> = {};
  const taken = new Set<ImportField>();
  for (const header of headers) {
    const hint = HEADER_HINTS[normaliseHeader(header)];
    if (hint && !taken.has(hint)) {
      mapping[header] = hint;
      taken.add(hint);
    }
  }
  return mapping;
}

export type SheetData = { name: string; headers: string[]; rows: RawRow[] };
export type RawRow = Record<string, string>;

/** Read a workbook into per-sheet headers + string rows. */
export function readWorkbook(data: ArrayBuffer | Uint8Array): SheetData[] {
  const wb = XLSX.read(data, { type: "array" });
  return wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
    const headers =
      json.length > 0
        ? Object.keys(json[0])
        : (XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] ?? []);
    const rows: RawRow[] = json.map((row) => {
      const out: RawRow = {};
      for (const key of Object.keys(row)) {
        out[key] = String(row[key] ?? "").trim();
      }
      return out;
    });
    return { name, headers: headers.map(String), rows };
  });
}

/** Map free-text status values from the spreadsheet onto the enum. */
export function parseStatus(value: string): InternshipStatus {
  const v = value.trim().toLowerCase();
  if (!v) return "none";
  if (["ja", "yes", "y", "approved", "akkoord", "goedgekeurd", "ok", "true", "x", "1"].includes(v))
    return "approved";
  if (["nee", "no", "n", "rejected", "afgekeurd", "false", "0"].includes(v))
    return "rejected";
  if (["pending", "in behandeling", "aangevraagd", "wacht", "submitted"].includes(v))
    return "pending";
  if (v.startsWith("approve") || v.startsWith("akkoord")) return "approved";
  if (v.startsWith("reject") || v.startsWith("afgekeur")) return "rejected";
  if (v.startsWith("pend") || v.startsWith("behandel")) return "pending";
  return "none";
}

/** Split "Sam Visser" / "Visser, Sam" into first + last name. */
export function splitName(full: string): { firstName: string; lastName: string } {
  const value = full.trim().replace(/\s+/g, " ");
  if (!value) return { firstName: "", lastName: "" };
  if (value.includes(",")) {
    const [last, first] = value.split(",", 2);
    return { firstName: (first ?? "").trim(), lastName: last.trim() };
  }
  const parts = value.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export type ParsedRow = {
  rowNumber: number;
  studentNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  topic: string;
  internshipStatus: InternshipStatus;
  company: string;
  assignmentDescription: string;
  remarks: string;
  firstAssessor: string;
  secondAssessor: string;
  errors: string[];
  warnings: string[];
};

export type ParseContext = {
  /** Known topic names (lower-cased) → id. */
  knownTopics: Set<string>;
  /** Known assessor names (lower-cased). */
  knownAssessors: Set<string>;
  /** Student numbers already in this semester. */
  existingStudentNumbers: Set<string>;
};

/**
 * Turn mapped spreadsheet rows into validated records. Nothing is written here
 * — every problem is reported per row so the coordinator sees it in the preview
 * before committing.
 */
export function parseRows(
  rows: RawRow[],
  mapping: Record<string, ImportField>,
  context: ParseContext
): ParsedRow[] {
  const seenNumbers = new Set<string>();
  const columnFor = (field: ImportField) =>
    Object.keys(mapping).find((col) => mapping[col] === field);

  return rows.map((raw, index) => {
    const get = (field: ImportField) => {
      const col = columnFor(field);
      return col ? (raw[col] ?? "").trim() : "";
    };

    let firstName = get("firstName");
    let lastName = get("lastName");
    const fullName = get("fullName");
    if (fullName && !firstName && !lastName) {
      const split = splitName(fullName);
      firstName = split.firstName;
      lastName = split.lastName;
    }

    const studentNumber = get("studentNumber");
    const topic = get("topic");
    const firstAssessor = get("firstAssessor");
    const secondAssessor = get("secondAssessor");

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!studentNumber) errors.push("Missing student number.");
    if (!firstName && !lastName) errors.push("Missing name.");
    if (studentNumber && seenNumbers.has(studentNumber))
      errors.push("Duplicate student number within this file.");
    if (studentNumber && context.existingStudentNumbers.has(studentNumber))
      warnings.push("Already exists in this semester — will be updated.");
    if (studentNumber) seenNumbers.add(studentNumber);

    if (topic && !context.knownTopics.has(topic.toLowerCase()))
      warnings.push(`Unknown topic "${topic}" — will be left empty.`);
    if (firstAssessor && !context.knownAssessors.has(firstAssessor.toLowerCase()))
      warnings.push(`Unknown 1st assessor "${firstAssessor}".`);
    if (secondAssessor && !context.knownAssessors.has(secondAssessor.toLowerCase()))
      warnings.push(`Unknown 2nd assessor "${secondAssessor}".`);
    if (
      firstAssessor &&
      secondAssessor &&
      firstAssessor.toLowerCase() === secondAssessor.toLowerCase()
    )
      errors.push("1st and 2nd assessor are the same person.");

    return {
      rowNumber: index + 2, // +1 for the header row, +1 for 1-based rows
      studentNumber,
      firstName,
      lastName,
      email: get("email"),
      topic,
      internshipStatus: parseStatus(get("internshipStatus")),
      company: get("company"),
      assignmentDescription: get("assignmentDescription"),
      remarks: get("remarks"),
      firstAssessor,
      secondAssessor,
      errors,
      warnings,
    };
  });
}

/** Distinct unknown names found in a parsed file, offered for creation. */
export function collectUnknowns(
  rows: ParsedRow[],
  context: ParseContext
): { topics: string[]; assessors: string[] } {
  const topics = new Set<string>();
  const assessors = new Set<string>();
  for (const row of rows) {
    if (row.topic && !context.knownTopics.has(row.topic.toLowerCase()))
      topics.add(row.topic);
    for (const name of [row.firstAssessor, row.secondAssessor]) {
      if (name && !context.knownAssessors.has(name.toLowerCase()))
        assessors.add(name);
    }
  }
  return {
    topics: [...topics].sort(),
    assessors: [...assessors].sort(),
  };
}
