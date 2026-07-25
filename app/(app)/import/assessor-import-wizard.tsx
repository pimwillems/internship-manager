"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";

import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import {
  ASSESSOR_FIELD_LABELS,
  ASSESSOR_IMPORT_FIELDS,
  collectUnknownTeams,
  parseAssessorRows,
  readWorkbook,
  suggestAssessorMapping,
  type AssessorImportField,
  type AssessorParseContext,
  type ParsedAssessorRow,
  type SheetData,
} from "@/lib/excel/import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { commitAssessorImport } from "./actions";

const UNMAPPED = "__unmapped__";
const MAPPING_STORAGE_KEY = "intern-assessor-import-mapping";

type Context = {
  teams: { id: number; name: string }[];
  existingAssessorNames: string[];
};

export function AssessorImportWizard({ context }: { context: Context }) {
  const { run, pending } = useAction();
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [sheetName, setSheetName] = useState<string>("");
  const [mapping, setMapping] = useState<Record<string, AssessorImportField>>(
    {}
  );
  const [createTeams, setCreateTeams] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const parseContext: AssessorParseContext = useMemo(
    () => ({
      knownTeams: new Set(context.teams.map((t) => t.name.toLowerCase())),
      existingAssessorNames: new Set(
        context.existingAssessorNames.map((n) => n.toLowerCase())
      ),
    }),
    [context]
  );

  const sheet = sheets?.find((s) => s.name === sheetName) ?? null;

  const parsed: ParsedAssessorRow[] = useMemo(() => {
    if (!sheet) return [];
    return parseAssessorRows(sheet.rows, mapping, parseContext);
  }, [sheet, mapping, parseContext]);

  const unknownTeams = useMemo(
    () => collectUnknownTeams(parsed, parseContext),
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
    const suggested = suggestAssessorMapping(target.headers);
    try {
      const saved = window.localStorage.getItem(MAPPING_STORAGE_KEY);
      if (saved) {
        const remembered = JSON.parse(saved) as Record<
          string,
          AssessorImportField
        >;
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
        next[header] = field as AssessorImportField;
      }
      return next;
    });
  }

  function commit() {
    try {
      window.localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(mapping));
    } catch {
      // Not being able to remember the mapping is not worth failing over.
    }

    run(
      async () => {
        const result = await commitAssessorImport(parsed, {
          createMissingTeams: createTeams,
        });
        if (!result.ok) return result;

        const parts = [
          `${result.created} created`,
          `${result.updated} updated`,
        ];
        if (result.skipped) parts.push(`${result.skipped} skipped`);
        setDone(`${parts.join(", ")}.`);
        setSheets(null);
        return { ok: true as const };
      },
      { successMessage: "Import complete." }
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {done && (
        <div className="bg-muted rounded-md border px-3 py-2 text-sm whitespace-pre-wrap">
          {done}
        </div>
      )}

      {/* Step 1 — file */}
      <div className="grid gap-2">
        <Label htmlFor="assessor-file">1. Choose your .xlsx file</Label>
        <Input
          id="assessor-file"
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
        <p className="text-muted-foreground text-xs">
          Nothing is written until you press Import at the bottom. Assessors
          aren&apos;t semester-scoped, so this updates the global list — set
          each one&apos;s availability and maximum on the Assessors page
          afterwards.
        </p>
      </div>

      {sheets && (
        <>
          {/* Step 2 — sheet */}
          <div className="grid gap-2">
            <Label htmlFor="assessor-sheet">2. Which sheet?</Label>
            <Select
              value={sheetName}
              onValueChange={(name) => {
                setSheetName(name);
                const target = sheets.find((s) => s.name === name);
                if (target) applyMappingFor(target);
              }}
            >
              <SelectTrigger id="assessor-sheet" className="w-72">
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
                        {ASSESSOR_IMPORT_FIELDS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {ASSESSOR_FIELD_LABELS[f]}
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

          {/* Step 4 — unknown teams */}
          {unknownTeams.length > 0 && (
            <div className="grid gap-3 rounded-md border p-3">
              <p className="text-sm font-medium">
                4. New teams found in this file
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Switch
                  id="create-teams"
                  checked={createTeams}
                  onCheckedChange={setCreateTeams}
                />
                <Label htmlFor="create-teams">
                  Create {unknownTeams.length} missing team
                  {unknownTeams.length === 1 ? "" : "s"}
                </Label>
                <div className="flex flex-wrap gap-1">
                  {unknownTeams.map((t) => (
                    <Badge key={t} variant="outline">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
              <span className="text-muted-foreground text-xs">
                Leave this off and rows with an unrecognised team are skipped
                — you can correct the team name in the file and re-import, or
                fix it manually afterwards on this page or in Settings.
              </span>
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
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead>Active</TableHead>
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
                        <TableCell>{row.name || "—"}</TableCell>
                        <TableCell>{row.email || "—"}</TableCell>
                        <TableCell>{row.team || "—"}</TableCell>
                        <TableCell>{row.isActive ? "Yes" : "No"}</TableCell>
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
            <Button onClick={commit} disabled={pending || okCount === 0} className="w-fit">
              <Upload />
              Import {okCount} assessor{okCount === 1 ? "" : "s"}
            </Button>
            <Button variant="ghost" onClick={() => setSheets(null)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
