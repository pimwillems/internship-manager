"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";

import type { InternshipStatus } from "@/db/schema";
import { useAction } from "@/lib/use-action";
import type { AssessorOption } from "@/components/assessor-combobox";
import { AssessorCombobox } from "@/components/assessor-combobox";
import { STATUS_LABELS } from "@/components/status-badge";
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
import { Textarea } from "@/components/ui/textarea";
import { createStudent, deleteStudent, updateStudent } from "./actions";

type TopicOption = { id: number; name: string; teamId: number; teamName: string };

export type StudentFormValues = {
  studentNumber: string;
  name: string;
  email: string;
  topicId: number | null;
  internshipStatus: InternshipStatus;
  company: string;
  assignmentDescription: string;
  remarks: string;
  firstAssessorId: number | null;
  secondAssessorId: number | null;
};

const NONE = "__none__";

export function StudentForm({
  studentId,
  semesterId,
  initial,
  topics,
  assessorOptions,
}: {
  studentId?: number;
  semesterId: number;
  initial: StudentFormValues;
  topics: TopicOption[];
  assessorOptions: AssessorOption[];
}) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [values, setValues] = useState<StudentFormValues>(initial);

  function set<K extends keyof StudentFormValues>(
    key: K,
    value: StudentFormValues[K]
  ) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  // The team that owns the selected topic drives which assessors surface first.
  const preferredTeamId =
    topics.find((t) => t.id === values.topicId)?.teamId ?? null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(
      () =>
        studentId
          ? updateStudent(studentId, values)
          : createStudent(semesterId, values),
      {
        successMessage: studentId ? "Student saved." : "Student created.",
        onSuccess: () => {
          if (!studentId) router.push("/students");
        },
      }
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" type="button">
          <Link href="/students">
            <ArrowLeft /> Back to students
          </Link>
        </Button>
        <div className="ml-auto flex gap-2">
          {studentId && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(() => deleteStudent(studentId), {
                  successMessage: "Student deleted.",
                  onSuccess: () => router.push("/students"),
                })
              }
            >
              <Trash2 /> Delete
            </Button>
          )}
          <Button type="submit" disabled={pending}>
            Save
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Student</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="number">Student number</Label>
              <Input
                id="number"
                value={values.studentNumber}
                onChange={(e) => set("studentNumber", e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={values.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="topic">Semester topic</Label>
              <Select
                value={values.topicId ? String(values.topicId) : NONE}
                onValueChange={(v) =>
                  set("topicId", v === NONE ? null : Number(v))
                }
              >
                <SelectTrigger id="topic" className="w-full">
                  <SelectValue placeholder="Pick a topic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No topic yet</SelectItem>
                  {topics.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name} — {t.teamName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                The owning team of this topic decides which assessors are
                suggested first below.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Internship</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={values.internshipStatus}
                onValueChange={(v) =>
                  set("internshipStatus", v as InternshipStatus)
                }
              >
                <SelectTrigger id="status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as InternshipStatus[]).map(
                    (s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={values.company}
                onChange={(e) => set("company", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="assignment">Assignment description</Label>
              <Textarea
                id="assignment"
                rows={4}
                value={values.assignmentDescription}
                onChange={(e) => set("assignmentDescription", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assessors</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label>1st assessor (coach)</Label>
              <AssessorCombobox
                options={assessorOptions}
                value={values.firstAssessorId}
                slot="first"
                preferredTeamId={preferredTeamId}
                disabled={pending}
                onChange={(id) => set("firstAssessorId", id)}
              />
              <p className="text-muted-foreground text-xs">
                Assessors at their maximum are shown but cannot be selected.
              </p>
            </div>
            <div className="grid gap-2">
              <Label>2nd assessor</Label>
              <AssessorCombobox
                options={assessorOptions}
                value={values.secondAssessorId}
                slot="second"
                preferredTeamId={preferredTeamId}
                disabled={pending}
                onChange={(id) => set("secondAssessorId", id)}
              />
              <p className="text-muted-foreground text-xs">
                No maximum applies to the 2nd assessor — the number shown is
                their current load.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Remarks</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              aria-label="Remarks"
              rows={6}
              value={values.remarks}
              onChange={(e) => set("remarks", e.target.value)}
              placeholder="Free-text notes, as in the old spreadsheet column."
            />
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
