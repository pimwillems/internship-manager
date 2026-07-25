import "server-only";
import { cookies } from "next/headers";
import { desc } from "drizzle-orm";

import { db } from "@/db";
import { semesters, type Semester } from "@/db/schema";

export const SEMESTER_COOKIE = "semester_id";

/** All semesters, active first, then newest. */
export async function getSemesters(): Promise<Semester[]> {
  return db
    .select()
    .from(semesters)
    .orderBy(desc(semesters.isActive), desc(semesters.id));
}

/**
 * The semester the coordinator is currently viewing: the one pinned in the
 * cookie if it still exists, otherwise the flagged-active one, otherwise the
 * newest. Null only when no semesters exist yet.
 */
export async function getActiveSemester(): Promise<Semester | null> {
  const all = await getSemesters();
  if (all.length === 0) return null;

  const cookieStore = await cookies();
  const raw = cookieStore.get(SEMESTER_COOKIE)?.value;
  const pinnedId = raw ? Number(raw) : null;
  if (pinnedId) {
    const pinned = all.find((s) => s.id === pinnedId);
    if (pinned) return pinned;
  }
  return all.find((s) => s.isActive) ?? all[0];
}

/** Convenience: the viewed semester's id, or throws if none exists. */
export async function requireActiveSemesterId(): Promise<number> {
  const s = await getActiveSemester();
  if (!s) throw new Error("No semester exists yet. Create one in Settings.");
  return s.id;
}
