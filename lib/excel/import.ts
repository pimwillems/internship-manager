import * as XLSX from "xlsx";

import type { InternshipStatus } from "@/db/schema";

/** Fields an imported column can be mapped onto. */
export const IMPORT_FIELDS = [
  "studentNumber",
  "name",
  "email",
  "topic",
  "internshipStatus",
  "company",
  "assignmentDescription",
  "remarks",
  "firstAssessor",
  "secondAssessor",
  "team",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export const FIELD_LABELS: Record<ImportField, string> = {
  studentNumber: "Student number",
  name: "Name",
  email: "Email",
  topic: "Topic",
  internshipStatus: "Internship status",
  company: "Company",
  assignmentDescription: "Assignment description",
  remarks: "Remarks",
  firstAssessor: "1st assessor",
  secondAssessor: "2nd assessor",
  team: "Team",
};

/** Column header → field, for the remembered default mapping. */
const HEADER_HINTS: Record<string, ImportField> = {
  studentnumber: "studentNumber",
  studentnummer: "studentNumber",
  studentnr: "studentNumber",
  nummer: "studentNumber",
  number: "studentNumber",
  pcn: "studentNumber",
  name: "name",
  naam: "name",
  fullname: "name",
  student: "name",
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
  team: "team",
  teamnaam: "team",
  teamname: "team",
};

function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[\s_.]/g, "");
}

function suggestMappingFrom<F extends string>(
  headers: string[],
  hints: Record<string, F>
): Record<string, F> {
  const mapping: Record<string, F> = {};
  const taken = new Set<F>();
  for (const header of headers) {
    const hint = hints[normaliseHeader(header)];
    if (hint && !taken.has(hint)) {
      mapping[header] = hint;
      taken.add(hint);
    }
  }
  return mapping;
}

/** Best-guess mapping of sheet headers onto fields. */
export function suggestMapping(headers: string[]): Record<string, ImportField> {
  return suggestMappingFrom(headers, HEADER_HINTS);
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

export type ParsedRow = {
  rowNumber: number;
  studentNumber: string;
  name: string;
  email: string;
  topic: string;
  internshipStatus: InternshipStatus;
  company: string;
  assignmentDescription: string;
  remarks: string;
  firstAssessor: string;
  secondAssessor: string;
  team: string;
  errors: string[];
  warnings: string[];
};

export type ParseContext = {
  /** Known topic names (lower-cased) → id. */
  knownTopics: Set<string>;
  /** Known assessor names (lower-cased). */
  knownAssessors: Set<string>;
  /** Known team names (lower-cased). */
  knownTeams: Set<string>;
  /** Assessor name (lower-cased) → their fixed team name, for mismatch warnings. */
  assessorTeams: Map<string, string>;
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

    const name = get("name");
    const studentNumber = get("studentNumber");
    const topic = get("topic");
    const firstAssessor = get("firstAssessor");
    const secondAssessor = get("secondAssessor");
    const team = get("team");

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!studentNumber) errors.push("Missing student number.");
    if (!name) errors.push("Missing name.");
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

    if (team && !context.knownTeams.has(team.toLowerCase()))
      warnings.push(`Unknown team "${team}".`);
    for (const [role, assessorName] of [
      ["1st", firstAssessor],
      ["2nd", secondAssessor],
    ] as const) {
      if (!team || !assessorName) continue;
      const actualTeam = context.assessorTeams.get(assessorName.toLowerCase());
      if (actualTeam && actualTeam.toLowerCase() !== team.toLowerCase())
        warnings.push(
          `${role} assessor "${assessorName}" belongs to team "${actualTeam}", not "${team}".`
        );
    }

    return {
      rowNumber: index + 2,
      studentNumber,
      name,
      email: get("email"),
      topic,
      internshipStatus: parseStatus(get("internshipStatus")),
      company: get("company"),
      assignmentDescription: get("assignmentDescription"),
      remarks: get("remarks"),
      firstAssessor,
      secondAssessor,
      team,
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

/* ------------------------------------------------------------------ *
 * Assessor import — same shape as the student import above, but for
 * bulk-loading assessors and their team.
 * ------------------------------------------------------------------ */

export const ASSESSOR_IMPORT_FIELDS = ["name", "email", "team", "isActive"] as const;
export type AssessorImportField = (typeof ASSESSOR_IMPORT_FIELDS)[number];

export const ASSESSOR_FIELD_LABELS: Record<AssessorImportField, string> = {
  name: "Name",
  email: "Email",
  team: "Team",
  isActive: "Active",
};

const ASSESSOR_HEADER_HINTS: Record<string, AssessorImportField> = {
  name: "name",
  naam: "name",
  assessor: "name",
  fullname: "name",
  email: "email",
  mail: "email",
  "e-mail": "email",
  team: "team",
  teamname: "team",
  teamnaam: "team",
  active: "isActive",
  isactive: "isActive",
  available: "isActive",
  actief: "isActive",
  beschikbaar: "isActive",
};

/** Best-guess mapping of sheet headers onto assessor fields. */
export function suggestAssessorMapping(
  headers: string[]
): Record<string, AssessorImportField> {
  return suggestMappingFrom(headers, ASSESSOR_HEADER_HINTS);
}

function parseBoolean(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (["nee", "no", "n", "false", "0", "inactief", "inactive"].includes(v))
    return false;
  return true; // blank or anything else defaults to active, same as the manual form
}

export type ParsedAssessorRow = {
  rowNumber: number;
  name: string;
  email: string;
  team: string;
  isActive: boolean;
  errors: string[];
  warnings: string[];
};

export type AssessorParseContext = {
  /** Known team names (lower-cased). */
  knownTeams: Set<string>;
  /** Assessor names already in the database (lower-cased). */
  existingAssessorNames: Set<string>;
};

/**
 * Turn mapped spreadsheet rows into validated assessor records. Same
 * write-nothing-here contract as parseRows: every problem is reported per row
 * so the coordinator sees it in the preview before committing.
 */
export function parseAssessorRows(
  rows: RawRow[],
  mapping: Record<string, AssessorImportField>,
  context: AssessorParseContext
): ParsedAssessorRow[] {
  const seenNames = new Set<string>();
  const columnFor = (field: AssessorImportField) =>
    Object.keys(mapping).find((col) => mapping[col] === field);

  return rows.map((raw, index) => {
    const get = (field: AssessorImportField) => {
      const col = columnFor(field);
      return col ? (raw[col] ?? "").trim() : "";
    };

    const name = get("name");
    const team = get("team");

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!name) errors.push("Missing name.");
    if (!team) errors.push("Missing team.");
    if (name && seenNames.has(name.toLowerCase()))
      errors.push("Duplicate assessor name within this file.");
    if (name) seenNames.add(name.toLowerCase());
    if (name && context.existingAssessorNames.has(name.toLowerCase()))
      warnings.push("Already exists — will be updated.");
    if (team && !context.knownTeams.has(team.toLowerCase()))
      warnings.push(
        `Unknown team "${team}" — enable "create missing teams" below, or this row will be skipped.`
      );

    return {
      rowNumber: index + 2,
      name,
      email: get("email"),
      team,
      isActive: parseBoolean(get("isActive")),
      errors,
      warnings,
    };
  });
}

/** Distinct unknown team names found in a parsed file, offered for creation. */
export function collectUnknownTeams(
  rows: ParsedAssessorRow[],
  context: AssessorParseContext
): string[] {
  const teamNames = new Set<string>();
  for (const row of rows) {
    if (row.team && !context.knownTeams.has(row.team.toLowerCase()))
      teamNames.add(row.team);
  }
  return [...teamNames].sort();
}
