"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { SEMESTER_COOKIE } from "@/lib/semester";
import { requireCoordinator } from "@/lib/guard";

/** Pin the semester the coordinator is viewing (stored in a cookie). */
export async function switchSemester(id: number) {
  await requireCoordinator();
  const cookieStore = await cookies();
  cookieStore.set(SEMESTER_COOKIE, String(id), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
