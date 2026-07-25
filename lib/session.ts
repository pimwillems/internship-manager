import "server-only";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";

/** The current Better Auth session (user + session) or null. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}
