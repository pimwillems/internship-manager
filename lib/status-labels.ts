import type { InternshipStatus } from "@/db/schema";

/** Human labels for the internship status enum, shared by UI and Excel export. */
export const STATUS_LABELS: Record<InternshipStatus, string> = {
  none: "None",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const STATUS_VARIANTS: Record<
  InternshipStatus,
  "default" | "secondary" | "destructive" | "outline" | "warning" | "success"
> = {
  none: "outline",
  pending: "warning",
  approved: "success",
  rejected: "destructive",
};
