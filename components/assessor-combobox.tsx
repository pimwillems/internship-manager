"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** The shape the server hands to the picker — derived from lib/capacity.ts. */
export type AssessorOption = {
  assessorId: number;
  name: string;
  teamId: number;
  teamName: string;
  isActive: boolean;
  maxAsFirst: number;
  usedAsFirst: number;
  usedAsSecond: number;
  remaining: number;
  isFull: boolean;
};

export function AssessorCombobox({
  options,
  value,
  onChange,
  slot,
  /** Team that owns the student's topic; drives the soft preference. */
  preferredTeamId,
  disabled,
  placeholder = "Pick an assessor",
}: {
  options: AssessorOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  slot: "first" | "second";
  preferredTeamId?: number | null;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  // Matching-team assessors sort to the top; the rest keep alphabetical order.
  const sorted = useMemo(() => {
    const list = options.filter((o) => o.isActive || o.assessorId === value);
    return [...list].sort((a, b) => {
      const aMatch = preferredTeamId != null && a.teamId === preferredTeamId;
      const bMatch = preferredTeamId != null && b.teamId === preferredTeamId;
      if (aMatch !== bMatch) return aMatch ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [options, preferredTeamId, value]);

  const selected = options.find((o) => o.assessorId === value) ?? null;
  const teamMismatch =
    selected != null &&
    preferredTeamId != null &&
    selected.teamId !== preferredTeamId;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-label={
                slot === "first" ? "1st assessor picker" : "2nd assessor picker"
              }
              data-testid={`assessor-picker-${slot}`}
              disabled={disabled}
              className="w-full justify-between font-normal"
            >
              {selected ? (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{selected.name}</span>
                  {slot === "first" && (
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {selected.usedAsFirst} / {selected.maxAsFirst} as 1st
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
            <Command>
              <CommandInput placeholder="Search assessors…" />
              <CommandList>
                <CommandEmpty>
                  No assessors available this semester.
                </CommandEmpty>
                <CommandGroup>
                  {sorted.map((o) => {
                    const preferred =
                      preferredTeamId != null && o.teamId === preferredTeamId;
                    // Only the 1st-assessor slot is capped. An assessor at
                    // their maximum stays visible but cannot be picked, with
                    // the reason shown.
                    const blocked =
                      slot === "first" && o.isFull && o.assessorId !== value;
                    return (
                      <CommandItem
                        key={o.assessorId}
                        value={`${o.name} ${o.teamName}`}
                        disabled={blocked}
                        onSelect={() => {
                          if (blocked) return;
                          onChange(o.assessorId === value ? null : o.assessorId);
                          setOpen(false);
                        }}
                        className={cn(blocked && "opacity-50")}
                      >
                        <Check
                          className={cn(
                            value === o.assessorId ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="flex-1 truncate">{o.name}</span>
                        {preferred && (
                          <Badge variant="secondary" className="shrink-0">
                            {o.teamName}
                          </Badge>
                        )}
                        {!preferred && (
                          <span className="text-muted-foreground shrink-0 text-xs">
                            {o.teamName}
                          </span>
                        )}
                        <span
                          className={cn(
                            "shrink-0 text-xs tabular-nums",
                            blocked
                              ? "text-destructive font-medium"
                              : "text-muted-foreground"
                          )}
                          title={
                            blocked
                              ? `At their maximum of ${o.maxAsFirst} as 1st assessor`
                              : undefined
                          }
                        >
                          {slot === "first"
                            ? `${o.usedAsFirst} / ${o.maxAsFirst}`
                            : `${o.usedAsSecond} as 2nd`}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selected && !disabled && (
          <Button
            variant="ghost"
            size="icon"
            title="Clear"
            onClick={() => onChange(null)}
          >
            <X />
          </Button>
        )}
      </div>

      {teamMismatch && (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <TriangleAlert className="text-warning mt-px size-3.5 shrink-0" />
          <span>
            {selected!.name} is in {selected!.teamName}, which does not manage
            this student&apos;s topic. That is allowed — just a heads-up.
          </span>
        </p>
      )}
    </div>
  );
}
