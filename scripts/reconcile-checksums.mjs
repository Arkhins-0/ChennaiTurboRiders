/**
 * Re-stamps the ledger for three migrations that were CORRECTED after they had
 * already been applied.
 *
 *   node --env-file=.env scripts/reconcile-checksums.mjs --dry-run
 *   node --env-file=.env scripts/reconcile-checksums.mjs
 *
 * ── Why this exists, and why it is not a general tool ─────────────────────
 *
 * `scripts/migrate.mjs` refuses to run when a file's checksum no longer matches
 * the one recorded against it, and that guard is right: a migration that has run
 * is history, and editing it means the database and the repo no longer agree
 * about what version N meant. The answer is almost always a NEW migration.
 *
 * This is the exception, and it is narrow. `0011`, `0013` and `0017` each ended
 * in an assertion about data they were written to CARRY FORWARD — a running
 * order, an owner, a set of chrome sections — and each stated it as though that
 * data must exist. That is true of every database they had ever seen, because
 * every one of them was an existing site being migrated. It is false of a
 * database created from nothing, where there is nothing to carry, and all three
 * therefore failed on the first fresh install anybody attempted.
 *
 * The corrections state the precondition each assertion always meant:
 *
 *   0011  seat the announcement second — IF the page has sections at all
 *   0013  an owner must survive — IF there were any accounts to survive
 *   0017  every site gets the root's chrome — IF the root has any
 *
 * On a database where they already ran, every one of those conditions was TRUE,
 * so the corrected files do exactly what the originals did. That is what makes
 * re-stamping honest here and dishonest almost everywhere else: the effect is
 * unchanged, only the text is.
 *
 * ── What it will not do ───────────────────────────────────────────────────
 *
 * Only these three versions, named below. A fourth migration whose checksum has
 * drifted is not covered and is reported rather than repaired — because nobody
 * has made the argument above about it.
 *
 * It touches `ctr.schema_migrations` and nothing else. No table is read, no row
 * of content is written, and a migration that has NOT been applied is left alone
 * — there is nothing to reconcile, and the next `db:migrate` records the new
 * checksum by itself.
 *
 * ── Life expectancy ───────────────────────────────────────────────────────
 *
 * One-shot, per database. Once every database has been through it, delete it.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

/** The only versions this will touch, and why each was corrected. */
const CORRECTED = {
  "0011": "seats the announcement only when the page already has sections",
  "0013": "requires a surviving owner only when there were accounts",
  "0017": "compares each site's chrome against the root's rather than against six",
};

const DRY_RUN = process.argv.includes("--dry-run");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Make sure .env exists in the project root.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

/** The same hash `migrate.mjs` computes: carriage returns stripped first. */
function checksumOf(file) {
  const text = readFileSync(join("migrations", file), "utf8");
  return createHash("sha256").update(text.replace(/\r/g, ""), "utf8").digest("hex");
}

console.log(DRY_RUN ? "DRY RUN — nothing will be written.\n" : "Reconciling the ledger.\n");

try {
  const applied = await sql`
    SELECT version, name, checksum FROM ctr.schema_migrations ORDER BY version
  `;

  if (applied.length === 0) {
    console.log("This database has no migrations applied. Nothing to reconcile.");
    process.exit(0);
  }

  const files = Object.fromEntries(
    applied.map((row) => [row.version, `${row.version}_${row.name}.sql`])
  );

  let fixed = 0;
  let strangers = 0;

  for (const row of applied) {
    let now;
    try {
      now = checksumOf(files[row.version]);
    } catch {
      console.log(`  ${row.version}  no file on disk — left alone`);
      continue;
    }

    if (now === row.checksum) continue;

    if (!(row.version in CORRECTED)) {
      strangers += 1;
      console.log(
        `  ${row.version}  CHANGED and NOT one of the three this script knows about.\n` +
          `          Left alone. Work out why it changed before doing anything to it.`
      );
      continue;
    }

    console.log(`  ${row.version}  ${CORRECTED[row.version]}`);
    console.log(`          ${row.checksum.slice(0, 16)}… → ${now.slice(0, 16)}…`);

    if (!DRY_RUN) {
      await sql`
        UPDATE ctr.schema_migrations SET checksum = ${now} WHERE version = ${row.version}
      `;
    }

    fixed += 1;
  }

  console.log("");

  if (fixed === 0 && strangers === 0) {
    console.log("Every applied migration already matches its file. Nothing to do.");
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log(`${fixed} row(s) would be re-stamped. Re-run without --dry-run to do it.`);
  } else {
    console.log(`Re-stamped ${fixed} row(s). \`npm run db:migrate\` will run again.`);
  }

  if (strangers > 0) {
    console.log(
      `\n${strangers} other migration(s) have changed since they were applied and were NOT ` +
        "touched. That is the guard doing its job — do not widen this script to cover them."
    );
    process.exit(1);
  }
} catch (error) {
  console.error("Failed:", error.message);
  process.exit(1);
}
