import "server-only";

import { neon } from "@neondatabase/serverless";

/**
 * Neon over HTTP: one round-trip per query and no pool to manage, which is the
 * right shape for serverless where a long-lived pool would leak between
 * invocations.
 *
 * ── Where the tables are, and why every query says so ────────────────────
 *
 * Every table this project owns lives in the `ctr` SCHEMA, and every query names
 * it explicitly: `FROM ctr.sports`. They used to carry a `ctr_` prefix instead,
 * to keep open the option of sharing one database with another CTR site; a
 * schema is the mechanism Postgres provides for exactly that.
 *
 * The plan was to set `search_path = ctr, public` and write the short names.
 * Migration 0001 does set it, on the DATABASE, and it is there in
 * `pg_db_role_setting` — and **Neon's SQL-over-HTTP endpoint does not apply it**.
 * A session opened through this driver reports `search_path` as `"$user",
 * public` and `FROM sports` fails with `relation "sports" does not exist`.
 * Passing `options=-c search_path=…` in the connection string does not reach it
 * either. Both were tried against the live database.
 *
 * So the qualification is not a style choice, it is the only thing that works
 * for this driver — and it is better anyway: a query that names its schema
 * cannot be broken by a session setting, a connection pooler, a restored
 * database or a role whose own default differs. The `search_path` the migration
 * sets is left in place because it makes `psql` and one-off scripts pleasant,
 * and nothing depends on it.
 */
let cached: ReturnType<typeof neon> | null = null;

export function getSql() {
  if (cached) return cached;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env locally and to the hosting project's environment."
    );
  }

  cached = neon(url);
  return cached;
}
