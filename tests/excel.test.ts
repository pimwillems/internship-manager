import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  collectUnknowns,
  collectUnknownTeams,
  parseAssessorRows,
  parseRows,
  parseStatus,
  readWorkbook,
  suggestAssessorMapping,
  suggestMapping,
  type AssessorParseContext,
  type ParseContext,
  type RawRow,
} from "@/lib/excel/import";
import { buildStudentsWorkbook, exportFileName } from "@/lib/excel/export";
import type { StudentRow } from "@/lib/students";

const emptyContext: ParseContext = {
  knownTopics: new Set(),
  knownAssessors: new Set(),
  existingStudentNumbers: new Set(),
};

function ctx(overrides: Partial<ParseContext> = {}): ParseContext {
  return { ...emptyContext, ...overrides };
}

describe("parseStatus", () => {
  it("maps the yes/no spellings the spreadsheet actually uses", () => {
    for (const yes of ["ja", "Yes", "AKKOORD", "approved", "x", "1", "ok"])
      expect(parseStatus(yes)).toBe("approved");
    for (const no of ["nee", "No", "afgekeurd", "rejected", "0"])
      expect(parseStatus(no)).toBe("rejected");
    for (const pending of ["pending", "In behandeling", "aangevraagd"])
      expect(parseStatus(pending)).toBe("pending");
  });

  it("falls back to none for blank or unrecognised values", () => {
    expect(parseStatus("")).toBe("none");
    expect(parseStatus("   ")).toBe("none");
    expect(parseStatus("wat dan ook")).toBe("none");
  });
});

describe("suggestMapping", () => {
  it("recognises English and Dutch headers", () => {
    const mapping = suggestMapping([
      "Studentnummer",
      "Naam",
      "Bedrijf",
      "Opmerkingen",
      "1e assessor",
    ]);
    expect(mapping).toMatchObject({
      Studentnummer: "studentNumber",
      Naam: "name",
      Bedrijf: "company",
      Opmerkingen: "remarks",
      "1e assessor": "firstAssessor",
    });
  });

  it("never maps two columns onto the same field", () => {
    const mapping = suggestMapping(["Name", "Naam"]);
    const fields = Object.values(mapping);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("leaves unknown headers unmapped", () => {
    expect(suggestMapping(["Totally unrelated"])).toEqual({});
  });
});

describe("parseRows", () => {
  const mapping = {
    Nummer: "studentNumber",
    Naam: "name",
    Bedrijf: "company",
    Status: "internshipStatus",
    "1e assessor": "firstAssessor",
    "2e assessor": "secondAssessor",
    Topic: "topic",
  } as const;

  const rows: RawRow[] = [
    {
      Nummer: "2100001",
      Naam: "Sam Visser",
      Bedrijf: "Acme",
      Status: "ja",
      "1e assessor": "Alex de Vries",
      "2e assessor": "Bo Jansen",
      Topic: "FED",
    },
  ];

  it("parses a clean row with no errors", () => {
    const parsed = parseRows(rows, { ...mapping }, ctx({
      knownTopics: new Set(["fed"]),
      knownAssessors: new Set(["alex de vries", "bo jansen"]),
    }));
    expect(parsed[0]).toMatchObject({
      studentNumber: "2100001",
      name: "Sam Visser",
      company: "Acme",
      internshipStatus: "approved",
      errors: [],
      warnings: [],
    });
  });

  it("numbers rows the way the spreadsheet does (header is row 1)", () => {
    const parsed = parseRows(rows, { ...mapping }, ctx());
    expect(parsed[0].rowNumber).toBe(2);
  });

  it("flags missing student number and missing name as errors", () => {
    const parsed = parseRows(
      [{ Nummer: "", Naam: "", Bedrijf: "Acme" }],
      { ...mapping },
      ctx()
    );
    expect(parsed[0].errors).toContain("Missing student number.");
    expect(parsed[0].errors).toContain("Missing name.");
  });

  it("flags duplicates inside the file as an error", () => {
    const parsed = parseRows(
      [
        { Nummer: "1", Naam: "A B" },
        { Nummer: "1", Naam: "C D" },
      ],
      { ...mapping },
      ctx()
    );
    expect(parsed[0].errors).toHaveLength(0);
    expect(parsed[1].errors).toContain(
      "Duplicate student number within this file."
    );
  });

  it("warns (not errors) when the student already exists — that is an update", () => {
    const parsed = parseRows(rows, { ...mapping }, ctx({
      existingStudentNumbers: new Set(["2100001"]),
      knownTopics: new Set(["fed"]),
      knownAssessors: new Set(["alex de vries", "bo jansen"]),
    }));
    expect(parsed[0].errors).toHaveLength(0);
    expect(parsed[0].warnings.join(" ")).toMatch(/already exists/i);
  });

  it("warns about unknown topics and assessors without blocking the import", () => {
    const parsed = parseRows(rows, { ...mapping }, ctx());
    expect(parsed[0].errors).toHaveLength(0);
    expect(parsed[0].warnings.join(" ")).toMatch(/Unknown topic "FED"/);
    expect(parsed[0].warnings.join(" ")).toMatch(/Unknown 1st assessor/);
  });

  it("errors when both assessors are the same person", () => {
    const parsed = parseRows(
      [
        {
          Nummer: "1",
          Naam: "A B",
          "1e assessor": "Alex de Vries",
          "2e assessor": "alex de vries",
        },
      ],
      { ...mapping },
      ctx({ knownAssessors: new Set(["alex de vries"]) })
    );
    expect(parsed[0].errors).toContain(
      "1st and 2nd assessor are the same person."
    );
  });

  it("reads the name column directly", () => {
    const parsed = parseRows(
      [{ Nummer: "1", Naam: "Sam Visser" }],
      {
        Nummer: "studentNumber",
        Naam: "name",
      },
      ctx()
    );
    expect(parsed[0]).toMatchObject({ name: "Sam Visser" });
  });
});

describe("collectUnknowns", () => {
  it("collects distinct unknown topics and assessors for creation", () => {
    const parsed = parseRows(
      [
        { Nummer: "1", Naam: "A B", Topic: "FED", "1e assessor": "Alex" },
        { Nummer: "2", Naam: "C D", Topic: "FED", "1e assessor": "Bo" },
      ],
      {
        Nummer: "studentNumber",
        Naam: "name",
        Topic: "topic",
        "1e assessor": "firstAssessor",
      },
      ctx()
    );
    const unknowns = collectUnknowns(parsed, ctx());
    expect(unknowns.topics).toEqual(["FED"]);
    expect(unknowns.assessors).toEqual(["Alex", "Bo"]);
  });
});

describe("workbook round-trip", () => {
  const students = [
    {
      id: 1,
      studentNumber: "2100001",
      name: "Sam Visser",
      email: "sam@example.com",
      topicId: 1,
      topicName: "FED",
      topicTeamId: 2,
      topicTeamName: "Team 2",
      internshipStatus: "approved",
      company: "Acme",
      assignmentDescription: "Build a component library.",
      remarks: "Fine",
      firstAssessorId: 1,
      firstAssessorName: "Alex de Vries",
      secondAssessorId: 2,
      secondAssessorName: "Bo Jansen",
    },
  ] as unknown as StudentRow[];

  it("exports the expected columns and values", () => {
    const buffer = buildStudentsWorkbook(students, "2026-2027 S1");
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
      defval: "",
    });
    expect(json[0]).toMatchObject({
      "Student number": "2100001",
      Name: "Sam Visser",
      Topic: "FED",
      Team: "Team 2",
      "Internship status": "Approved",
      Company: "Acme",
      "1st assessor": "Alex de Vries",
      "2nd assessor": "Bo Jansen",
    });
  });

  it("survives export → readWorkbook → parseRows unchanged", () => {
    const buffer = buildStudentsWorkbook(students, "2026-2027 S1");
    const sheets = readWorkbook(buffer);
    expect(sheets).toHaveLength(1);

    const mapping = suggestMapping(sheets[0].headers);
    const parsed = parseRows(
      sheets[0].rows,
      mapping,
      ctx({
        knownTopics: new Set(["fed"]),
        knownAssessors: new Set(["alex de vries", "bo jansen"]),
      })
    );
    expect(parsed[0]).toMatchObject({
      studentNumber: "2100001",
      name: "Sam Visser",
      company: "Acme",
      internshipStatus: "approved",
      firstAssessor: "Alex de Vries",
      secondAssessor: "Bo Jansen",
      assignmentDescription: "Build a component library.",
      errors: [],
    });
  });

  it("sanitises the sheet name and builds a dated file name", () => {
    const buffer = buildStudentsWorkbook([], "2026/2027 S1");
    const wb = XLSX.read(buffer, { type: "array" });
    expect(wb.SheetNames[0]).not.toMatch(/[/\\[\]:*?]/);
    expect(exportFileName("2026-2027 S1")).toMatch(
      /^students-2026-2027-S1-\d{4}-\d{2}-\d{2}\.xlsx$/
    );
  });
});

const emptyAssessorContext: AssessorParseContext = {
  knownTeams: new Set(),
  existingAssessorNames: new Set(),
};

function actx(
  overrides: Partial<AssessorParseContext> = {}
): AssessorParseContext {
  return { ...emptyAssessorContext, ...overrides };
}

describe("suggestAssessorMapping", () => {
  it("recognises English and Dutch headers", () => {
    const mapping = suggestAssessorMapping([
      "Naam",
      "E-mail",
      "Team",
      "Actief",
    ]);
    expect(mapping).toMatchObject({
      Naam: "name",
      "E-mail": "email",
      Team: "team",
      Actief: "isActive",
    });
  });

  it("never maps two columns onto the same field", () => {
    const mapping = suggestAssessorMapping(["Name", "Naam"]);
    const fields = Object.values(mapping);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("leaves unknown headers unmapped", () => {
    expect(suggestAssessorMapping(["Totally unrelated"])).toEqual({});
  });
});

describe("parseAssessorRows", () => {
  const mapping = {
    Naam: "name",
    Email: "email",
    Team: "team",
    Actief: "isActive",
  } as const;

  it("parses a clean row with no errors", () => {
    const parsed = parseAssessorRows(
      [{ Naam: "Alex de Vries", Email: "alex@example.com", Team: "Team 2", Actief: "ja" }],
      { ...mapping },
      actx({ knownTeams: new Set(["team 2"]) })
    );
    expect(parsed[0]).toMatchObject({
      name: "Alex de Vries",
      email: "alex@example.com",
      team: "Team 2",
      isActive: true,
      errors: [],
      warnings: [],
    });
  });

  it("numbers rows the way the spreadsheet does (header is row 1)", () => {
    const parsed = parseAssessorRows(
      [{ Naam: "Alex", Team: "Team 2" }],
      { ...mapping },
      actx()
    );
    expect(parsed[0].rowNumber).toBe(2);
  });

  it("flags missing name and missing team as errors", () => {
    const parsed = parseAssessorRows(
      [{ Naam: "", Team: "" }],
      { ...mapping },
      actx()
    );
    expect(parsed[0].errors).toContain("Missing name.");
    expect(parsed[0].errors).toContain("Missing team.");
  });

  it("flags duplicates inside the file as an error", () => {
    const parsed = parseAssessorRows(
      [
        { Naam: "Alex de Vries", Team: "Team 2" },
        { Naam: "alex de vries", Team: "Team 2" },
      ],
      { ...mapping },
      actx({ knownTeams: new Set(["team 2"]) })
    );
    expect(parsed[0].errors).toHaveLength(0);
    expect(parsed[1].errors).toContain(
      "Duplicate assessor name within this file."
    );
  });

  it("warns (not errors) when the assessor already exists — that is an update", () => {
    const parsed = parseAssessorRows(
      [{ Naam: "Alex de Vries", Team: "Team 2" }],
      { ...mapping },
      actx({
        knownTeams: new Set(["team 2"]),
        existingAssessorNames: new Set(["alex de vries"]),
      })
    );
    expect(parsed[0].errors).toHaveLength(0);
    expect(parsed[0].warnings.join(" ")).toMatch(/already exists/i);
  });

  it("warns about an unknown team without blocking the import", () => {
    const parsed = parseAssessorRows(
      [{ Naam: "Alex de Vries", Team: "New Team" }],
      { ...mapping },
      actx()
    );
    expect(parsed[0].errors).toHaveLength(0);
    expect(parsed[0].warnings.join(" ")).toMatch(/Unknown team "New Team"/);
  });

  it("defaults isActive to true, and recognises the no spellings", () => {
    const parsed = parseAssessorRows(
      [
        { Naam: "A", Team: "T" },
        { Naam: "B", Team: "T", Actief: "nee" },
      ],
      { ...mapping },
      actx({ knownTeams: new Set(["t"]) })
    );
    expect(parsed[0].isActive).toBe(true);
    expect(parsed[1].isActive).toBe(false);
  });
});

describe("collectUnknownTeams", () => {
  it("collects distinct unknown team names for creation", () => {
    const parsed = parseAssessorRows(
      [
        { Naam: "A", Team: "New Team" },
        { Naam: "B", Team: "New Team" },
        { Naam: "C", Team: "Team 2" },
      ],
      { Naam: "name", Team: "team" },
      actx({ knownTeams: new Set(["team 2"]) })
    );
    expect(collectUnknownTeams(parsed, actx({ knownTeams: new Set(["team 2"]) }))).toEqual([
      "New Team",
    ]);
  });
});
