"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import type { Team } from "@/db/schema";
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
import { createTopic, deleteTopic, updateTopic } from "./actions";

type TopicRow = {
  id: number;
  name: string;
  teamId: number;
  teamName: string;
  studentCount: number;
};

export function TopicsPanel({
  topics,
  teams,
}: {
  topics: TopicRow[];
  teams: Team[];
}) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TopicRow | null>(null);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState<string>("");

  function openCreate() {
    setEditing(null);
    setName("");
    setTeamId(teams[0] ? String(teams[0].id) : "");
    setOpen(true);
  }

  function openEdit(t: TopicRow) {
    setEditing(t);
    setName(t.name);
    setTeamId(String(t.teamId));
    setOpen(true);
  }

  function submit() {
    const payload = { name, teamId };
    run(
      () => (editing ? updateTopic(editing.id, payload) : createTopic(payload)),
      {
        successMessage: editing ? "Topic updated." : "Topic created.",
        onSuccess: () => setOpen(false),
      }
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            The semester topic catalog. The owning team decides which assessors
            are suggested first when you assign a student with this topic — a
            preference, never a hard rule.
          </p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate} disabled={teams.length === 0}>
                <Plus /> New topic
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit topic" : "New topic"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="topic-name">Name</Label>
                  <Input
                    id="topic-name"
                    placeholder="Applied Generative AI"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="topic-team">Owning team</Label>
                  <Select value={teamId} onValueChange={setTeamId}>
                    <SelectTrigger id="topic-team" className="w-full">
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
              <TableHead>Topic</TableHead>
              <TableHead>Owning team</TableHead>
              <TableHead>Students</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topics.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{t.teamName}</Badge>
                </TableCell>
                <TableCell>{t.studentCount}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Edit"
                      disabled={pending}
                      onClick={() => openEdit(t)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title={
                        t.studentCount > 0
                          ? "Students still use this topic"
                          : "Delete"
                      }
                      disabled={pending || t.studentCount > 0}
                      onClick={() =>
                        run(() => deleteTopic(t.id), {
                          successMessage: "Topic deleted.",
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
