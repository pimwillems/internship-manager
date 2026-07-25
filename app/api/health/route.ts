import { sql } from "drizzle-orm";

import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Coolify healthcheck. Does a trivial query so the check fails loudly when
 * Postgres is unreachable, rather than serving a broken app.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch (err) {
    return Response.json(
      {
        status: "error",
        error: err instanceof Error ? err.message : "database unreachable",
      },
      { status: 503 }
    );
  }
}
