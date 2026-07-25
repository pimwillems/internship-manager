"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ExternalLink } from "lucide-react";

import type { InternshipStatus } from "@/db/schema";
import type { StudentRow } from "@/lib/students";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import type { AssessorOption } from "@/components/assessor-combobox";
import { AssessorCombobox } from "@/components/assessor-combobox";
import { STATUS_LABELS, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { assignAssessor, assignTopic, quickUpdateStudent } from "./actions";

type TopicOption = { id: number; name: string; teamId: number; teamName: string };

const ALL = "__all__";

export function StudentsTable({
  rows,
  topics,
  assessorOptions,
}: {
  rows: StudentRow[];
  topics: TopicOption[];
  assessorOptions: AssessorOption[];
}) {
  const { run, pending } = useAction();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [topicId, setTopicId] = useState<string>(ALL);
  const [assigned, setAssigned] = useState<string>(ALL);
  const [sorting, setSorting] = useState<SortingState>([]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status !== ALL && r.internshipStatus !== status) return false;
      if (topicId !== ALL && String(r.topicId ?? "") !== topicId) return false;
      if (assigned === "full" && !(r.firstAssessorId && r.secondAssessorId))
        return false;
      if (assigned === "partial" && r.firstAssessorId && r.secondAssessorId)
        return false;
      if (assigned === "none" && (r.firstAssessorId || r.secondAssessorId))
        return false;
      if (search) {
        const haystack = [
          r.studentNumber,
          r.name,
          r.email,
          r.company,
          r.topicName,
          r.remarks,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, search, status, topicId, assigned]);

  const columns = useMemo<ColumnDef<StudentRow>[]>(
    () => [
      {
        accessorKey: "studentNumber",
        header: "Number",
        cell: ({ row }) => (
          <Link
            href={`/students/${row.original.id}`}
            className="font-medium hover:underline"
          >
            {row.original.studentNumber}
          </Link>
        ),
      },
      {
        id: "name",
        accessorFn: (r) => r.name,
        header: "Name",
        cell: ({ row }) => (
          <Link
            href={`/students/${row.original.id}`}
            className="hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: "topic",
        header: "Topic",
        cell: ({ row }) => {
          const NONE = "__none__";
          return (
            <Select
              value={row.original.topicId ? String(row.original.topicId) : NONE}
              disabled={pending}
              onValueChange={(v) =>
                run(
                  () =>
                    assignTopic(
                      row.original.id,
                      v === NONE ? null : Number(v)
                    ),
                  { successMessage: "Topic updated." }
                )
              }
            >
              <SelectTrigger size="sm" className="w-52">
                <SelectValue>
                  {row.original.topicName ? (
                    <span>
                      {row.original.topicName}
                      <span className="text-muted-foreground ml-1 text-xs">
                        {row.original.topicTeamName}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No topic</span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No topic</SelectItem>
                {topics.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name} — {t.teamName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
      },
      {
        accessorKey: "internshipStatus",
        header: "Status",
        cell: ({ row }) => (
          <Select
            value={row.original.internshipStatus}
            disabled={pending}
            onValueChange={(value) =>
              run(
                () =>
                  quickUpdateStudent(row.original.id, {
                    internshipStatus: value,
                  }),
                { successMessage: "Status updated." }
              )
            }
          >
            <SelectTrigger size="sm" className="w-32 border-0 shadow-none">
              <SelectValue>
                <StatusBadge status={row.original.internshipStatus} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(
                Object.keys(STATUS_LABELS) as InternshipStatus[]
              ).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      },
      {
        accessorKey: "company",
        header: "Company",
        cell: ({ row }) =>
          row.original.company ?? (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "firstAssessor",
        header: "1st assessor",
        cell: ({ row }) => (
          <div className="w-56">
            <AssessorCombobox
              options={assessorOptions}
              value={row.original.firstAssessorId}
              slot="first"
              preferredTeamId={row.original.topicTeamId}
              disabled={pending}
              placeholder="Unassigned"
              onChange={(id) =>
                run(() => assignAssessor(row.original.id, "first", id), {
                  successMessage: "1st assessor updated.",
                })
              }
            />
          </div>
        ),
      },
      {
        id: "secondAssessor",
        header: "2nd assessor",
        cell: ({ row }) => (
          <div className="w-56">
            <AssessorCombobox
              options={assessorOptions}
              value={row.original.secondAssessorId}
              slot="second"
              preferredTeamId={row.original.topicTeamId}
              disabled={pending}
              placeholder="Unassigned"
              onChange={(id) =>
                run(() => assignAssessor(row.original.id, "second", id), {
                  successMessage: "2nd assessor updated.",
                })
              }
            />
          </div>
        ),
      },
      {
        accessorKey: "remarks",
        header: "Remarks",
        cell: ({ row }) => (
          <Input
            defaultValue={row.original.remarks ?? ""}
            placeholder="—"
            className="h-8 w-48 border-0 shadow-none focus-visible:border focus-visible:shadow-xs"
            disabled={pending}
            onBlur={(e) => {
              const next = e.target.value;
              if (next === (row.original.remarks ?? "")) return;
              run(
                () => quickUpdateStudent(row.original.id, { remarks: next }),
                { successMessage: "Remarks saved." }
              );
            }}
          />
        ),
      },
      {
        id: "open",
        header: "",
        cell: ({ row }) => (
          <Button asChild size="sm" variant="ghost" title="Open student">
            <Link href={`/students/${row.original.id}`}>
              <ExternalLink />
            </Link>
          </Button>
        ),
      },
    ],
    [assessorOptions, pending, run]
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search name, number, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-64"
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger size="sm" className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {(Object.keys(STATUS_LABELS) as InternshipStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={topicId} onValueChange={setTopicId}>
            <SelectTrigger size="sm" className="w-52">
              <SelectValue placeholder="Topic" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All topics</SelectItem>
              {topics.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assigned} onValueChange={setAssigned}>
            <SelectTrigger size="sm" className="w-48">
              <SelectValue placeholder="Assignment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any assignment</SelectItem>
              <SelectItem value="full">Both assessors</SelectItem>
              <SelectItem value="partial">Missing one</SelectItem>
              <SelectItem value="none">No assessors</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground ml-auto text-sm">
            {filtered.length} of {rows.length}
          </span>
        </div>

        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        className={cn(
                          "flex items-center gap-1",
                          "hover:text-foreground"
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        <ArrowUpDown className="size-3" />
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-muted-foreground"
                >
                  No students match these filters.
                </TableCell>
              </TableRow>
            )}
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
