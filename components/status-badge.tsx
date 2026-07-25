import type { InternshipStatus } from "@/db/schema";
import { STATUS_LABELS, STATUS_VARIANTS } from "@/lib/status-labels";
import { Badge } from "@/components/ui/badge";

export { STATUS_LABELS };

export function StatusBadge({ status }: { status: InternshipStatus }) {
  return (
    <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
  );
}
