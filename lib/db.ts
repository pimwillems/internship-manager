import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";

import { db, schema } from "@/db";

export { db, schema };

/** A Drizzle transaction handle, as passed to `db.transaction(async (tx) => …)`. */
export type Tx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** Either the root db or a transaction — for helpers that work with both. */
export type DbOrTx = typeof db | Tx;
