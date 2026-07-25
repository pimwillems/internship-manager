// Applies pending SQL migrations from db/migrations using only drizzle-orm
// (a production dependency). Runs at container start via scripts/start.sh, so a
// schema change ships with a plain `git push` — no terminal on the server.
//
// Local: `node --env-file=.env scripts/migrate.mjs`
// Container: env vars are already set, so `node scripts/migrate.mjs`.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql);

try {
  await migrate(db, { migrationsFolder: "./db/migrations" });
  console.log("Migrations applied.");
} catch (err) {
  console.error("Migration failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
