import "dotenv/config";
import postgres from "postgres";

/**
 * Remove students left behind by earlier end-to-end runs. Without this, the
 * capacity specs fail for the wrong reason: a leftover student still occupies
 * the one slot the capped assessor has.
 */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url, { max: 1 });
  try {
    const deleted = await sql`
      delete from students where student_number like 'e2e-%' returning id
    `;
    if (deleted.length > 0) {
      console.log(`[e2e] cleaned up ${deleted.length} leftover student(s)`);
    }
  } finally {
    await sql.end();
  }
}
