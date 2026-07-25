"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";

import type { Team } from "@/db/schema";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import {
  FIELD_LABELS,
  IMPORT_FIELDS,
  collectUnknowns,
  parseRows,
  readWorkbook,
  suggestMapping,
  type ImportField,
  type ParseContext,
  type ParsedRow,
  type SheetData,
} from "@/lib/excel/import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { commitImport } from "./actions";

const UNMAPPED = "__unmapped__";
const MAPPING_STORAGE_KEY = "intern-import-mapping";

type Context = {
  topics: { id: number; name: string }[];
  assessors: { id: number; name: string }[];
  existingStudentNumbers: string[];
  teams: { id: number; name: string }[];
};

export function ImportWizard({
  semesterId,
  semesterName,
  context,
  teams,
}: {
  semesterId: number;
  semesterName: string;
  context: Context;
  teams: Team[];
}) {
  const { run, pending } = useAction();
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [sheetName, setSheetName] = useState<string>("");
  const [mapping, setMapping] = useState<Record<string, ImportField>>({});
  const [createTopics, setCreateTopics] = useState(false);
  const [createAssessors, setCreateAssessors] = useState(false);
  const [defaultTeamId, setDefaultTeamId] = useState<string>(
    teams[0] ? String(teams[0].id) : ""
  );
  const [done, setDone] = useState<string | null>(null);

  const parseContext: ParseContext = useMemo(
    () => ({
      knownTopics: new Set(context.topics.map((t) => t.name.toLowerCase())),
      knownAssessors: new Set(
        context.assessors.map((a) => a.name.toLowerCase())
      ),
      existingStudentNumbers: new Set(context.existingStudentNumbers),
    }),
    [context]
  );

  const sheet = sheets?.find((s) => s.name === sheetName) ?? null;

  const parsed: ParsedRow[] = useMemo(() => {
    if (!sheet) return [];
    return parseRows(sheet.rows, mapping, parseContext);
  }, [sheet, mapping, parseContext]);

  const unknowns = useMemo(
    () => collectUnknowns(parsed, parseContext),
    [parsed, parseContext]
  );

  const errorRows = parsed.filter((r) => r.errors.length > 0);
  const warnRows = parsed.filter(
    (r) => r.errors.length === 0 && r.warnings.length > 0
  );
  const okCount = parsed.length - errorRows.length;

  async function onFile(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const parsedSheets = readWorkbook(buffer);
      if (parsedSheets.length === 0) {
        toast.error("That workbook has no sheets.");
        return;
      }
      setSheets(parsedSheets);
      setDone(null);

      const first =
        parsedSheets.find((s) => s.rows.length > 0) ?? parsedSheets[0];
      setSheetName(first.name);
      applyMappingFor(first);
    } catch {
      toast.error("Could not read that file. Is it a valid .xlsx?");
    }
  }

  /** Remembered mapping wins over the guess, for the columns it still knows. */
  function applyMappingFor(target: SheetData) {
    const suggested = suggestMapping(target.headers);
    try {
      const saved = window.localStorage.getItem(MAPPING_STORAGE_KEY);
      if (saved) {
        const remembered = JSON.parse(saved) as Record<string, ImportField>;
        for (const header of target.headers) {
          if (remembered[header]) suggested[header] = remembered[header];
        }
      }
    } catch {
      // A corrupt remembered mapping should never block an import.
    }
    setMapping(suggested);
  }

  function setColumn(header: string, field: string) {
    setMapping((prev) => {
      const next = { ...prev };
      if (field === UNMAPPED) {
        delete next[header];
      } else {
        // A field can only come from one column.
        for (const key of Object.keys(next)) {
          if (next[key] === field) delete next[key];
        }
        next[header] = field as ImportField;
      }
      return next;
    });
  }

  function commit() {
    try {
      window.localStorage.setItem(
        MAPPING_STORAGE_KEY,
        JSON.stringify(mapping)
      );
    } catch {
      // Not being able to remember the mapping is not worth failing over.
    }

    run(
      async () => {
        const result = await commitImport(semesterId, parsed, {
          createMissingTopics: createTopics,
          createMissingAssessors: createAssessors,
          defaultTeamId: defaultTeamId ? Number(defaultTeamId) : null,
        });
        if (!result.ok) return result;

        const parts = [
          `${result.created} created`,
          `${result.updated} updated`,
        ];
        if (result.skipped) parts.push(`${result.skipped} skipped`);
        setDone(
          `${parts.join(", ")}.` +
            (result.capacityWarnings.length
              ? ` ${result.capacityWarnings.length} row(s) imported without a 1st assessor because of capacity:\n` +
                result.capacityWarnings.join("\n")
              : "")
        );
        setSheets(null);
        return { ok: true as const };
      },
      { successMessage: "Import complete." }
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Export is always available. */}
      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <p className="text-muted-foreground text-sm">
            Download every student in {semesterName} as a spreadsheet.
          </p>
          <Button asChild variant="outline" className="ml-auto">
            <a href="/api/export">
              <Download /> Export to .xlsx
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {done && (
            <div className="bg-muted rounded-md border px-3 py-2 text-sm whitespace-pre-wrap">
              {done}
            </div>
          )}

          {/* Step 1 — file */}
          <div className="grid gap-2">
            <Label htmlFor="file">1. Choose your .xlsx file</Label>
            <Input
              id="file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFile(file);
              }}
            />
            <p className="text-muted-foreground text-xs">
              Nothing is written until you press Import at the bottom.
            </p>
          </div>

          {sheets && (
            <>
              {/* Step 2 — sheet */}
              <div className="grid gap-2">
                <Label htmlFor="sheet">2. Which sheet?</Label>
                <Select
                  value={sheetName}
                  onValueChange={(name) => {
                    setSheetName(name);
                    const target = sheets.find((s) => s.name === name);
                    if (target) applyMappingFor(target);
                  }}
                >
                  <SelectTrigger id="sheet" className="w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sheets.map((s) => (
                      <SelectItem key={s.name} value={s.name}>
                        <FileSpreadsheet className="size-3.5" />
                        {s.name} ({s.rows.length} rows)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Step 3 — mapping */}
              {sheet && (
                <div className="grid gap-2">
                  <Label>3. Match the columns</Label>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {sheet.headers.map((header) => (
                      <div key={header} className="flex items-center gap-2">
                        <span
                          className="w-36 shrink-0 truncate text-sm"
                          title={header}
                        >
                          {header}
                        </span>
                        <Select
                          value={mapping[header] ?? UNMAPPED}
                          onValueChange={(v) => setColumn(header, v)}
                        >
                          <SelectTrigger size="sm" className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNMAPPED}>
                              — ignore this column —
                            </SelectItem>
                            {IMPORT_FIELDS.map((f) => (
                              <SelectItem key={f} value={f}>
                                {FIELD_LABELS[f]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    This mapping is remembered for next time.
                  </p>
                </div>
              )}

              {/* Step 4 — unknown reference data */}
              {(unknowns.topics.length > 0 || unknowns.assessors.length > 0) && (
                <div className="grid gap-3 rounded-md border p-3">
                  <p className="text-sm font-medium">
                    4. New names found in this file
                  </p>
                  {unknowns.topics.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Switch
                        id="create-topics"
                        checked={createTopics}
                        onCheckedChange={setCreateTopics}
                      />
                      <Label htmlFor="create-topics">
                        Create {unknowns.topics.length} missing topic
                        {unknowns.topics.length === 1 ? "" : "s"}
                      </Label>
                      <div className="flex flex-wrap gap-1">
                        {unknowns.topics.map((t) => (
                          <Badge key={t} variant="outline">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {unknowns.assessors.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Switch
                        id="create-assessors"
                        checked={createAssessors}
                        onCheckedChange={setCreateAssessors}
                      />
                      <Label htmlFor="create-assessors">
                        Create {unknowns.assessors.length} missing assessor
                        {unknowns.assessors.length === 1 ? "" : "s"}
                      </Label>
                      <div className="flex flex-wrap gap-1">
                        {unknowns.assessors.map((a) => (
                          <Badge key={a} variant="outline">
                            {a}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {(createTopics || createAssessors) && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="default-team" className="shrink-0">
                        Attach them to team
                      </Label>
                      <Select
                        value={defaultTeamId}
                        onValueChange={setDefaultTeamId}
                      >
                        <SelectTrigger id="default-team" size="sm" className="w-48">
                          <SelectValue placeholder="Pick a team" />
                        </SelectTrigger>
                        <SelectContent>
                          {teams.map((t) => (
                            <SelectItem key={t.id} value={String(t.id)}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-muted-foreground text-xs">
                        You can correct teams afterwards in Settings and on the
                        Assessors page. New assessors start with no capacity, so
                        set their maximum before assigning them.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Step 5 — preview */}
              {sheet && (
                <div className="grid gap-2">
                  <Label>5. Preview</Label>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant="success">{okCount} importable</Badge>
                    {errorRows.length > 0 && (
                      <Badge variant="destructive">
                        {errorRows.length} skipped (errors)
                      </Badge>
                    )}
                    {warnRows.length > 0 && (
                      <Badge variant="warning">
                        {warnRows.length} with warnings
                      </Badge>
                    )}
                  </div>
                  <div className="max-h-96 overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Row</TableHead>
                          <TableHead>Number</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Topic</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead>1st</TableHead>
                          <TableHead>2nd</TableHead>
                          <TableHead>Issues</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsed.map((row) => (
                          <TableRow
                            key={row.rowNumber}
                            className={cn(
                              row.errors.length > 0 && "bg-destructive/5"
                            )}
                          >
                            <TableCell className="tabular-nums">
                              {row.rowNumber}
                            </TableCell>
                            <TableCell>{row.studentNumber || "—"}</TableCell>
                            <TableCell>
                              {[row.firstName, row.lastName]
                                .filter(Boolean)
                                .join(" ") || "—"}
                            </TableCell>
                            <TableCell>{row.topic || "—"}</TableCell>
                            <TableCell>{row.internshipStatus}</TableCell>
                            <TableCell>{row.company || "—"}</TableCell>
                            <TableCell>{row.firstAssessor || "—"}</TableCell>
                            <TableCell>{row.secondAssessor || "—"}</TableCell>
                            <TableCell className="max-w-72 whitespace-normal">
                              {row.errors.map((e) => (
                                <span
                                  key={e}
                                  className="text-destructive flex items-start gap-1 text-xs"
                                >
                                  <TriangleAlert className="mt-px size-3 shrink-0" />
                                  {e}
                                </span>
                              ))}
                              {row.warnings.map((w) => (
                                <span
                                  key={w}
                                  className="text-muted-foreground block text-xs"
                                >
                                  {w}
                                </span>
                              ))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  onClick={commit}
                  disabled={pending || okCount === 0}
                  className="w-fit"
                >
                  <Upload />
                  Import {okCount} row{okCount === 1 ? "" : "s"} into{" "}
                  {semesterName}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setSheets(null)}
                  disabled={pending}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
