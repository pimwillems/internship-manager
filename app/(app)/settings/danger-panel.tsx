"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

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
import { deleteAllStudents } from "./actions";

export function DangerPanel() {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);

  return (
    <Card className="border-destructive/50">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-semibold flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" />
              Clear all students
            </h3>
            <p className="text-muted-foreground text-sm">
              Remove every student record from the database. This lets you start
              fresh with a new Excel import. Assessors, teams, topics and semesters
              are not affected.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm" className="shrink-0">
                Delete all
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete all students?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                This permanently removes every student from the database. Assessor
                assignments, topic associations, and semester groupings are also
                removed. This cannot be undone.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    run(() => deleteAllStudents(), {
                      successMessage: "All students deleted.",
                      onSuccess: () => setOpen(false),
                    })
                  }
                >
                  {pending ? "Deleting…" : "Delete all students"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}