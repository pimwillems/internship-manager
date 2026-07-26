"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { useAction } from "@/lib/use-action";
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
import { createTeam, deleteTeam, updateTeam } from "./actions";

type TeamRow = {
  id: number;
  name: string;
  topicCount: number;
  assessorCount: number;
};

export function TeamsPanel({ teams }: { teams: TeamRow[] }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [name, setName] = useState("");

  function openCreate() {
    setEditing(null);
    setName("");
    setOpen(true);
  }

  function openEdit(t: TeamRow) {
    setEditing(t);
    setName(t.name);
    setOpen(true);
  }

  function submit() {
    run(() => (editing ? updateTeam(editing.id, { name }) : createTeam({ name })), {
      successMessage: editing ? "Team updated." : "Team created.",
      onSuccess: () => setOpen(false),
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Teams supply assessors and own topics. An assessor belongs to one
            team; that team stays the same across semesters.
          </p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}>
                <Plus /> New team
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit team" : "New team"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="team-name">Name</Label>
                <Input
                  id="team-name"
                  placeholder="Team 5"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
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
              <TableHead>Team</TableHead>
              <TableHead>Topics owned</TableHead>
              <TableHead>Assessors</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>{t.topicCount}</TableCell>
                <TableCell>{t.assessorCount}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Edit"
                      aria-label={`Edit ${t.name}`}
                      disabled={pending}
                      onClick={() => openEdit(t)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title={
                        t.topicCount > 0 || t.assessorCount > 0
                          ? "Reassign its topics and assessors first"
                          : "Delete"
                      }
                      aria-label={`Delete ${t.name}`}
                      disabled={
                        pending || t.topicCount > 0 || t.assessorCount > 0
                      }
                      onClick={() =>
                        run(() => deleteTeam(t.id), {
                          successMessage: "Team deleted.",
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
