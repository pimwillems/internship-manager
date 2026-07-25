"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";

import type { Team } from "@/db/schema";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import {
  createAssessor,
  deleteAssessor,
  setCapacity,
  updateAssessor,
} from "./actions";

export type AssessorRow = {
  id: number;
  name: string;
  email: string | null;
  teamId: number;
  teamName: string;
  isActive: boolean;
  available: boolean;
  maxAsFirst: number | null;
  usedAsFirst: number;
  usedAsSecond: number;
  remaining: number;
  firstStudents: string[];
  secondStudents: string[];
};

type Draft = { name: string; email: string; teamId: string; isActive: boolean };

export function AssessorsTable({
  rows,
  teams,
  semesterId,
  semesterName,
}: {
  rows: AssessorRow[];
  teams: Team[];
  semesterId: number | null;
  semesterName: string | null;
}) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AssessorRow | null>(null);
  const [draft, setDraft] = useState<Draft>({
    name: "",
    email: "",
    teamId: "",
    isActive: true,
  });
  const [expanded, setExpanded] = useState<number | null>(null);

  function openCreate() {
    setEditing(null);
    setDraft({
      name: "",
      email: "",
      teamId: teams[0] ? String(teams[0].id) : "",
      isActive: true,
    });
    setOpen(true);
  }

  function openEdit(a: AssessorRow) {
    setEditing(a);
    setDraft({
      name: a.name,
      email: a.email ?? "",
      teamId: String(a.teamId),
      isActive: a.isActive,
    });
    setOpen(true);
  }

  function submit() {
    run(
      () =>
        editing ? updateAssessor(editing.id, draft) : createAssessor(draft),
      {
        successMessage: editing ? "Assessor updated." : "Assessor created.",
        onSuccess: () => setOpen(false),
      }
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            {semesterName
              ? `Toggle who takes students in ${semesterName} and set each maximum. Turning availability off only affects this semester.`
              : "No active semester."}
          </p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                onClick={openCreate}
                disabled={teams.length === 0}
              >
                <Plus /> New assessor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editing ? "Edit assessor" : "New assessor"}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="a-name">Name</Label>
                  <Input
                    id="a-name"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="a-email">Email</Label>
                  <Input
                    id="a-email"
                    type="email"
                    value={draft.email}
                    onChange={(e) =>
                      setDraft({ ...draft, email: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="a-team">Team</Label>
                  <Select
                    value={draft.teamId}
                    onValueChange={(v) => setDraft({ ...draft, teamId: v })}
                  >
                    <SelectTrigger id="a-team" className="w-full">
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
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="a-active"
                    checked={draft.isActive}
                    onCheckedChange={(v) =>
                      setDraft({ ...draft, isActive: v })
                    }
                  />
                  <Label htmlFor="a-active">
                    Active (inactive assessors are never suggested)
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button onClick={submit} disabled={pending}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Assessor</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Available</TableHead>
              <TableHead className="w-56">1st assessor load</TableHead>
              <TableHead>Max</TableHead>
              <TableHead>As 2nd</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">
                  No assessors yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((a) => {
              const over =
                a.maxAsFirst !== null && a.usedAsFirst > a.maxAsFirst;
              const pct =
                a.maxAsFirst && a.maxAsFirst > 0
                  ? Math.min(100, (a.usedAsFirst / a.maxAsFirst) * 100)
                  : 0;
              const isOpen = expanded === a.id;
              return (
                <Fragment key={a.id}>
                  <TableRow className={cn(!a.isActive && "opacity-60")}>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpanded(isOpen ? null : a.id)}
                        title="Show students"
                      >
                        {isOpen ? <ChevronDown /> : <ChevronRight />}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">
                      {a.name}
                      {!a.isActive && (
                        <Badge variant="outline" className="ml-2">
                          inactive
                        </Badge>
                      )}
                      {a.email && (
                        <div className="text-muted-foreground text-xs">
                          {a.email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{a.teamName}</Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={a.available}
                        disabled={pending || !semesterId}
                        onCheckedChange={(checked) =>
                          run(
                            () =>
                              setCapacity(
                                a.id,
                                semesterId!,
                                checked ? (a.maxAsFirst ?? 1) : null
                              ),
                            {
                              successMessage: checked
                                ? `${a.name} is available this semester.`
                                : `${a.name} is not taking students this semester.`,
                            }
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {a.available ? (
                        <div className="flex items-center gap-2">
                          <Progress
                            value={pct}
                            className="w-24"
                            indicatorClassName={
                              over
                                ? "bg-destructive"
                                : a.remaining === 0
                                  ? "bg-warning"
                                  : undefined
                            }
                          />
                          <span
                            className={cn(
                              "text-sm tabular-nums",
                              over && "text-destructive font-medium"
                            )}
                          >
                            {a.usedAsFirst} / {a.maxAsFirst}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {a.available ? (
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-16"
                          defaultValue={a.maxAsFirst ?? 0}
                          disabled={pending || !semesterId}
                          onBlur={(e) => {
                            const next = Number(e.target.value);
                            if (next === a.maxAsFirst) return;
                            run(
                              () => setCapacity(a.id, semesterId!, next),
                              { successMessage: `Maximum for ${a.name} set to ${next}.` }
                            );
                          }}
                        />
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {a.usedAsSecond}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Edit"
                          disabled={pending}
                          onClick={() => openEdit(a)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Delete"
                          disabled={pending}
                          onClick={() =>
                            run(() => deleteAssessor(a.id), {
                              successMessage: "Assessor deleted.",
                            })
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow>
                      <TableCell />
                      <TableCell colSpan={7}>
                        <div className="grid gap-3 py-2 text-sm sm:grid-cols-2">
                          <div>
                            <p className="mb-1 font-medium">As 1st assessor</p>
                            {a.firstStudents.length === 0 ? (
                              <p className="text-muted-foreground">None.</p>
                            ) : (
                              <ul className="text-muted-foreground list-disc pl-4">
                                {a.firstStudents.map((s) => (
                                  <li key={s}>{s}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div>
                            <p className="mb-1 font-medium">As 2nd assessor</p>
                            {a.secondStudents.length === 0 ? (
                              <p className="text-muted-foreground">None.</p>
                            ) : (
                              <ul className="text-muted-foreground list-disc pl-4">
                                {a.secondStudents.map((s) => (
                                  <li key={s}>{s}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
