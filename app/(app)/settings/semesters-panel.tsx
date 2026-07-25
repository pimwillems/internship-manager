"use client";

import { useState } from "react";
import { CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";

import type { Semester } from "@/db/schema";
import { useAction } from "@/lib/use-action";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createSemester,
  deleteSemester,
  setActiveSemester,
  updateSemester,
} from "./actions";

type Draft = { name: string; startsOn: string; endsOn: string };

const EMPTY: Draft = { name: "", startsOn: "", endsOn: "" };

export function SemestersPanel({
  semesters,
  studentCounts,
}: {
  semesters: Semester[];
  studentCounts: Record<number, number>;
}) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Semester | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  function openCreate() {
    setEditing(null);
    setDraft(EMPTY);
    setOpen(true);
  }

  function openEdit(s: Semester) {
    setEditing(s);
    setDraft({
      name: s.name,
      startsOn: s.startsOn ?? "",
      endsOn: s.endsOn ?? "",
    });
    setOpen(true);
  }

  function submit() {
    run(
      () => (editing ? updateSemester(editing.id, draft) : createSemester(draft)),
      {
        successMessage: editing ? "Semester updated." : "Semester created.",
        onSuccess: () => setOpen(false),
      }
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            The active semester is the default view. Switching semesters at the
            top of the page never changes past data.
          </p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}>
                <Plus /> New semester
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editing ? "Edit semester" : "New semester"}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="sem-name">Name</Label>
                  <Input
                    id="sem-name"
                    placeholder="2026-2027 S1"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="sem-start">Starts on</Label>
                    <Input
                      id="sem-start"
                      type="date"
                      value={draft.startsOn}
                      onChange={(e) =>
                        setDraft({ ...draft, startsOn: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sem-end">Ends on</Label>
                    <Input
                      id="sem-end"
                      type="date"
                      value={draft.endsOn}
                      onChange={(e) =>
                        setDraft({ ...draft, endsOn: e.target.value })
                      }
                    />
                  </div>
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
              <TableHead>Name</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Students</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {semesters.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No semesters yet — create one to get started.
                </TableCell>
              </TableRow>
            )}
            {semesters.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {s.startsOn ?? "—"} → {s.endsOn ?? "—"}
                </TableCell>
                <TableCell>{studentCounts[s.id] ?? 0}</TableCell>
                <TableCell>
                  {s.isActive ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="outline">Archived</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {!s.isActive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Set as active semester"
                        disabled={pending}
                        onClick={() =>
                          run(() => setActiveSemester(s.id), {
                            successMessage: `${s.name} is now the active semester.`,
                          })
                        }
                      >
                        <CheckCircle2 />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Edit"
                      disabled={pending}
                      onClick={() => openEdit(s)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Delete"
                      disabled={pending || (studentCounts[s.id] ?? 0) > 0}
                      onClick={() =>
                        run(() => deleteSemester(s.id), {
                          successMessage: "Semester deleted.",
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
