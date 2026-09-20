/**
 * The migration runner.
 *
 *   npm run db:migrate     apply everything not yet applied
 *   npm run db:status      say what is applied and what is not
 *
 * ── What replaced what ────────────────────────────────────────────────────
 *
 * This file used to import scripts/schema.mjs and run the whole schema on every
 * invocation: 846 lines of CREATE TABLE IF NOT EXISTS with backfills between
 * them, no version, no record of what had run. Two consequences, both real: a
 * CHECK constraint could not be added at all — Postgres has no ADD CONSTRAINT IF
 * NOT EXISTS and the file had no way to know whether it had run before — and
 * nobody could answer "is this database up to date?" except by reading it.
 *
 * Now: `migrations/NNNN_name.sql`, applied in order, each recorded in
 * `ctr.schema_migrations` with a checksum, each inside one transaction. A
 * migration either lands whole or does not land.
 *
 * ── Why a WebSocket connection and not the HTTP driver ────────────────────
 *
 * The rest of the project talks to Neon over HTTP, which is the right shape for
 * serverless: one round-trip per query, no pool to leak between invocations. But
 * it is one STATEMENT per round-trip — "cannot insert multiple commands into a
 * prepared statement" — and it has no way to hold a transaction open across
 * them. A migration file is many statements that have to land together, so this
 * one script opens a real connection, exactly as psql would.
 *
 * That is also why the whole file is sent verbatim rather than split on
 * semicolons: a splitter would have to understand dollar-quoted bodies, and
 * `DO $$ ... $$` blocks are how the baseline does anything conditional.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { neonConfig, Pool } from "@neondatabase/serverless";

const DIRECTORY = "migrations";
const NAME_PATTERN = /^(\d{4})_([a-z0-9][a-z0-9_]*)\.sql$/;

const STATUS_ONLY = process.argv.includes("--status");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  fail("DATABASE_URL is not set. Make sure .env exists in the project root.");
}

if (typeof globalThis.WebSocket === "undefined") {
  fail(
    "This runner needs a WebSocket to hold a transaction open, which means Node 22 or newer.\n" +
      `This is Node ${process.version}.`
  );
}

neonConfig.webSocketConstructor = globalThis.WebSocket;

/**
 * Every migration on disk, in order, with the checksum that identifies it.
 *
 * Carriage returns are stripped before hashing. This repo is edited on Windows
 * and deployed from Linux, and git rewrites line endings on checkout — without
 * this, the same migration would hash differently on the two and the runner
 * would report tampering that never happened.
 */
function readMigrations() {
  let entries;

  try {
    entries = readdirSync(DIRECTORY);
  } catch {
    fail(`No ${DIRECTORY}/ directory. Run this from the project root.`);
  }

  const files = entries.filter((entry) => entry.endsWith(".sql")).sort();
  const migrations = [];

  for (const file of files) {
    const match = NAME_PATTERN.exec(file);
    if (!match) fail(`"${file}" is not named NNNN_lower_snake_case.sql — rename it or move it out.`);

    const sql = readFileSync(join(DIRECTORY, file), "utf8");

    migrations.push({
      version: match[1],
      name: match[2],
      file,
      sql,
      checksum: createHash("sha256").update(sql.replace(/\r/g, ""), "utf8").digest("hex"),
    });
  }

  // A duplicate number is two people writing 0003 in different branches, which
  // is a merge to resolve rather than an order to guess at.
  const seen = new Set();
  for (const migration of migrations) {
    if (seen.has(migration.version)) fail(`Two migrations are numbered ${migration.version}.`);
    seen.add(migration.version);
  }

  return migrations;
}

/**
 * The ledger lives in the schema it describes, and predates every migration in
 * it — 0001 cannot create the table that records 0001.
 *
 * Only ever called when something is about to be applied. `--status` reads and
 * writes nothing: a command whose job is to answer "what has run here?" should
 * be safe to point at production without thinking about it.
 */
async function ensureLedger(client) {
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS ctr;

    CREATE TABLE IF NOT EXISTS ctr.schema_migrations (
      version    text PRIMARY KEY,
      name       text NOT NULL,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

/*
 * Every migration from 0002 on reports what it moved with RAISE NOTICE — how
 * many deck pages became rows, how many former addresses could not be carried
 * over. Without this they are all swallowed, and the reconciliation a migration
 * does on itself is only useful if somebody can read it.
 *
 * The "already exists, skipping" chorus from 0001's idempotent statements is
 * dropped: on a database that has been through it once, that is forty lines
 * saying nothing happened, which would bury the six that matter.
 */
client.on?.("notice", (notice) => {
  const message = notice?.message ?? "";
  if (/already exists, skipping|does not exist, skipping/.test(message)) return;
  console.log(`      ${message}`);
});

try {
  const migrations = readMigrations();

  if (!STATUS_ONLY) await ensureLedger(client);

  const {
    rows: [{ ledger }],
  } = await client.query("SELECT to_regclass('ctr.schema_migrations') IS NOT NULL AS ledger");

  const { rows: applied } = ledger
    ? await client.query(
        "SELECT version, name, checksum, applied_at FROM ctr.schema_migrations ORDER BY version"
      )
    : { rows: [] };

  const byVersion = new Map(applied.map((row) => [row.version, row]));

  /*
   * A file that has changed since it was applied is the failure this runner
   * exists to catch: the database and the repo now disagree about what version
   * 0001 means, and no amount of re-running fixes it. Editing an applied
   * migration is the mistake; the answer is a new migration.
   */
  const tampered = migrations.filter(
    (migration) =>
      byVersion.has(migration.version) &&
      byVersion.get(migration.version).checksum !== migration.checksum
  );

  const orphaned = applied.filter(
    (row) => !migrations.some((migration) => migration.version === row.version)
  );

  if (STATUS_ONLY) {
    const [{ search_path: searchPath, db }] = (
      await client.query("SELECT current_setting('search_path') AS search_path, current_database() AS db")
    ).rows;

    console.log(`${db} — search_path is ${searchPath}\n`);
    console.log("  ver   name                      applied");

    for (const migration of migrations) {
      const row = byVersion.get(migration.version);
      // The driver hands back a Date; the constructor is what makes this survive
      // ever being handed a string instead.
      const when = row
        ? new Date(row.applied_at).toISOString().replace("T", " ").slice(0, 19)
        : "pending";
      const flag = row && row.checksum !== migration.checksum ? "  ← CHANGED SINCE APPLIED" : "";
      console.log(`  ${migration.version}  ${migration.name.padEnd(24)}  ${when}${flag}`);
    }

    for (const row of orphaned) {
      console.log(`  ${row.version}  ${row.name.padEnd(24)}  applied, but no file on disk`);
    }

    const pending = migrations.filter((migration) => !byVersion.has(migration.version)).length;
    console.log(`\n${applied.length} applied, ${pending} pending.`);

    if (tampered.length > 0) {
      console.log(
        `\n${tampered.length} applied migration(s) no longer match the file. ` +
          "Add a new migration rather than editing one that has run."
      );
    }

    if (!searchPath.includes("ctr")) {
      console.log(
        "\nsearch_path does not include ctr. Unqualified table names will not resolve —\n" +
          "either 0001 has not been applied, or this session predates it."
      );
    }
  } else {
    if (tampered.length > 0) {
      fail(
        `${tampered[0].file} has changed since it was applied.\n` +
          "A migration that has run is history and cannot be edited — write a new one.\n" +
          `Run npm run db:status to see them all.`
      );
    }

    const pending = migrations.filter((migration) => !byVersion.has(migration.version));

    if (pending.length === 0) {
      console.log(`Nothing to apply — ${applied.length} migration(s) already in.`);
    }

    for (const migration of pending) {
      process.stdout.write(`  ${migration.file} … `);

      try {
        await client.query("BEGIN");
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO ctr.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
          [migration.version, migration.name, migration.checksum]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        console.log("failed");
        // Nothing from this file landed, so the fix is to correct the file and
        // run again — there is no half-applied state to unpick first.
        fail(`\n${migration.file} did not apply. Nothing from it was written.\n\n${error.message}`);
      }

      console.log("applied");
    }

    if (pending.length > 0) {
      console.log(`\n${pending.length} migration(s) applied.`);
      console.log("New connections pick up the search_path; an existing one keeps its own.");
    }
  }
} catch (error) {
  console.error("Failed:", error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
