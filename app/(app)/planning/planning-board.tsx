"use client";

import Link from "next/link";
import { CircleAlert, CircleCheck } from "lucide-react";

import type { StudentRow } from "@/lib/students";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import type { AssessorOption } from "@/components/assessor-combobox";
import { AssessorCombobox } from "@/components/assessor-combobox";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { assignAssessor } from "../students/actions";

export function PlanningBoard({
  assessors,
  students,
  totals,
}: {
  assessors: AssessorOption[];
  students: StudentRow[];
  totals: {
    totalCapacity: number;
    totalRemaining: number;
    needFirst: number;
    needSecond: number;
  };
}) {
  const { run, pending } = useAction();
  const unassignedFirst = students.filter((s) => !s.firstAssessorId);
  const fits = totals.totalRemaining >= totals.needFirst;

  return (
    <div className="flex flex-col gap-4">
      {/* The headline number: does this semester even fit? */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            {fits ? (
              <CircleCheck className="text-success size-8" />
            ) : (
              <CircleAlert className="text-destructive size-8" />
            )}
            <div>
              <p className="font-medium">
                {fits
                  ? "Capacity is sufficient"
                  : `Short by ${totals.needFirst - totals.totalRemaining} 1st-assessor slot${
                      totals.needFirst - totals.totalRemaining === 1 ? "" : "s"
                    }`}
              </p>
              <p className="text-muted-foreground text-sm">
                {totals.totalRemaining} slot
                {totals.totalRemaining === 1 ? "" : "s"} left ·{" "}
                {totals.needFirst} student
                {totals.needFirst === 1 ? "" : "s"} still need a 1st assessor
              </p>
            </div>
          </div>
          <div className="ml-auto grid grid-cols-3 gap-6 text-sm">
            <Stat label="Total capacity" value={totals.totalCapacity} />
            <Stat label="Remaining" value={totals.totalRemaining} />
            <Stat label="Missing 2nd" value={totals.needSecond} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Capacity per assessor</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assessor</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="w-48">Load as 1st</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>As 2nd</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessors.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No assessors are available this semester. Set their
                      maximums on the Assessors page.
                    </TableCell>
                  </TableRow>
                )}
                {assessors.map((a) => {
                  const pct =
                    a.maxAsFirst > 0
                      ? Math.min(100, (a.usedAsFirst / a.maxAsFirst) * 100)
                      : 0;
                  return (
                    <TableRow key={a.assessorId}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{a.teamName}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={pct}
                            className="w-24"
                            indicatorClassName={
                              a.isFull ? "bg-warning" : undefined
                            }
                          />
                          <span className="text-sm tabular-nums">
                            {a.usedAsFirst} / {a.maxAsFirst}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "tabular-nums",
                          a.remaining === 0 && "text-muted-foreground"
                        )}
                      >
                        {a.remaining}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {a.usedAsSecond}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Assign straight from here. */}
        <Card>
          <CardHeader>
            <CardTitle>
              Needs a 1st assessor ({unassignedFirst.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {unassignedFirst.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Every student has a 1st assessor.
              </p>
            )}
            {unassignedFirst.map((s) => (
              <div key={s.id} className="flex flex-col gap-1.5 border-b pb-3 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/students/${s.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {s.name}
                  </Link>
                  <StatusBadge status={s.internshipStatus} />
                </div>
                <p className="text-muted-foreground text-xs">
                  {s.studentNumber}
                  {s.topicName ? ` · ${s.topicName} (${s.topicTeamName})` : " · no topic"}
                </p>
                <AssessorCombobox
                  options={assessors}
                  value={null}
                  slot="first"
                  preferredTeamId={s.topicTeamId}
                  disabled={pending}
                  placeholder="Assign 1st assessor"
                  onChange={(id) =>
                    run(() => assignAssessor(s.id, "first", id), {
                      successMessage: `1st assessor assigned to ${s.name}.`,
                    })
                  }
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
