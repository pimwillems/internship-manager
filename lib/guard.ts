import "server-only";

import { getSession } from "@/lib/session";

/**
 * Assert an authenticated coordinator before a mutating server action runs.
 * Returns the current user. Throws if there is no session — server actions are
 * a public entry point, so every mutation must call this even though the UI is
 * already behind the login wall.
 */
export async function requireCoordinator() {
  const session = await getSession();
  if (!session) {
    throw new Error("Not authenticated.");
  }
  return session.user;
}
