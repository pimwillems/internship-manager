"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";

import type { Semester } from "@/db/schema";
import { switchSemester } from "@/app/(app)/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SemesterSwitcher({
  semesters,
  activeId,
}: {
  semesters: Semester[];
  activeId: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (semesters.length === 0) {
    return (
      <span className="text-muted-foreground text-sm">No semester yet</span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <CalendarDays className="text-muted-foreground size-4" aria-hidden="true" />
      <Select
        value={activeId ? String(activeId) : undefined}
        onValueChange={(value) => {
          startTransition(async () => {
            await switchSemester(Number(value));
            router.refresh();
          });
        }}
        disabled={pending}
      >
        <SelectTrigger size="sm" className="min-w-44" aria-label="Semester">
          <SelectValue placeholder="Select semester" />
        </SelectTrigger>
        <SelectContent>
          {semesters.map((s) => (
            <SelectItem key={s.id} value={String(s.id)}>
              {s.name}
              {s.isActive ? "  ·  active" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
