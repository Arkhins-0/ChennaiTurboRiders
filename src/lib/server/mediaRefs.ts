import "server-only";

import { MEDIA_PREFIX } from "@/lib/mediaPaths";
import { getSql } from "@/lib/server/db";

/**
 * Re-addressing every reference to a file that has moved.
 *
 * ── Why this is needed at all ─────────────────────────────────────────────
 *
 * S3 has no rename. Moving a folder is copy-then-delete, and in between the two
 * every row holding one of the old addresses has to be pointed at the new one —
 * otherwise the delete turns a working page into a broken image. This is that
 * middle step, and `moveEntityFolder` is the only thing that should run it.
 *
 * ── Why a PREFIX rather than a list of keys ───────────────────────────────
 *
 * Every file in a folder move keeps its own name and changes only the folder
 * above it, so the whole move is one string substitution:
 *
 *   ctr-sports/media/decks/world-of-ctr/  →  ctr-sports/media/decks/world-of-ctr-2026/
 *
 * One `replace` per column, twelve columns, one round trip each — against one
 * statement per FILE per column, which for a fifty-page deck would be six
 * hundred. The rescue path (survivors of a deleted entity going to `uploads/`)
 * has the same shape for the same reason: they all come from one folder and all
 * land in one folder.
 *
 * ── Why the KEY and not the URL ───────────────────────────────────────────
 *
 * What is stored is an absolute URL, but which one depends on how the
 * environment is set: `publicUrl` prefers `S3_PUBLIC_BASE_URL`, falls back to
 * `NEXT_PUBLIC_MEDIA_BASE_URL`, and falls back again to the raw S3 hostname. A
 * row written before the CDN existed carries a different host from one written
 * after it, and both are live. So the needle is the KEY — the part of the URL
 * that is the same whatever the host — exactly as `findUsage` matches, and for
 * exactly the same reason.
 *
 * ── The column list ───────────────────────────────────────────────────────
 *
 * Every column in this schema that can hold an image address, which is the same
 * list `mediaUsage.ts` scans and `scripts/migrate-media-domain.mjs` rewrites. The
 * three JSONB ones go through their text form, which is safe because a key
 * contains no character JSON escapes and `jsonb` is normalised on storage — the
 * round trip changes the string and nothing else.
 *
 * `forms.fields` and `forms.sections` are here even though nothing writes an
 * upload into them, because their text is author-written and an editor can paste
 * a URL. `form_entries.answers` is deliberately NOT here: registration
 * attachments live under `ENTRY_PREFIX`, a sibling of the media prefix that this
 * function can never name.
 *
 * `updated_at` is left alone throughout. The admin screens read it as "somebody
 * edited this", and re-addressing the same photograph is not an edit.
 */

type Column = { name: string; json?: boolean };
type Target = { table: string; columns: Column[] };

const TARGETS: Target[] = [
  { table: "tracks", columns: [{ name: "photo_url" }, { name: "map_url" }] },
  { table: "track_links", columns: [{ name: "href" }] },
  { table: "articles", columns: [{ name: "cover_image" }, { name: "body", json: true }] },
  { table: "events", columns: [{ name: "cover_image" }, { name: "body", json: true }] },
  /* The four migration 0024 added. Same columns `findUsage` scans. */
  { table: "drivers", columns: [{ name: "image" }, { name: "hero_image" }] },
  { table: "sponsors", columns: [{ name: "logo" }, { name: "full_logo" }] },
  { table: "team_profile", columns: [{ name: "principal_image" }, { name: "about_image" }, { name: "hero_video" }] },
  { table: "car", columns: [{ name: "image" }, { name: "image_2" }, { name: "image_3" }] },
];

/** `strpos`, not LIKE: the needle is a literal and `%` and `_` are not wildcards in it. */
const matches = (column: Column): string =>
  `strpos(${column.json ? `${column.name}::text` : column.name}, $1) > 0`;

const rewrite = (column: Column): string =>
  column.json
    ? `${column.name} = replace(${column.name}::text, $1, $2)::jsonb`
    : `${column.name} = replace(${column.name}, $1, $2)`;

/**
 * A prefix this function is allowed to rewrite.
 *
 * Under the media prefix, and STRICTLY under it — `ctr-sports/media/` itself
 * would match every object the site has ever uploaded and rewrite the lot in one
 * statement. Trailing slash required, so `decks/world-of-ctr` cannot also eat
 * `decks/world-of-ctr-2026`.
 */
function assertMovable(prefix: string): void {
  if (!prefix.startsWith(MEDIA_PREFIX) || prefix.length <= MEDIA_PREFIX.length) {
    throw new Error(`Refusing to rewrite "${prefix}" — it is not a folder under the media prefix.`);
  }

  if (!prefix.endsWith("/") || prefix.includes("..") || prefix.includes("%")) {
    throw new Error(`Refusing to rewrite "${prefix}".`);
  }
}

/**
 * Points every reference at the new folder. Returns how many rows changed.
 *
 * Idempotent: once a row says the new prefix it no longer contains the old one,
 * so a re-run after a partial failure is a no-op rather than a second rewrite.
 * That only holds while the new prefix does not CONTAIN the old one, which is
 * refused here rather than corrupted — the same guard, and the same reasoning,
 * as `scripts/migrate-media-domain.mjs`.
 */
export async function rewriteKeyPrefix(from: string, to: string): Promise<number> {
  assertMovable(from);
  assertMovable(to);

  if (from === to) return 0;

  if (to.includes(from)) {
    throw new Error(`The new folder contains the old one (${from} ⊂ ${to}). That would not be idempotent.`);
  }

  const sql = getSql();

  /*
   * All eight in ONE transaction, built as an array.
   *
   * The Neon HTTP driver cannot interleave JavaScript inside a transaction:
   * `sql.transaction` takes the statements up front and sends them together. A
   * `for` loop with `await` would therefore be eight separate transactions, and a
   * failure between two of them leaves the site half on the old folder and half
   * on the new — the one state that neither re-running nor rolling back can
   * describe. The repos build their multi-statement writes the same way; see
   * `writePages` in decksRepo.ts.
   *
   * One statement per table: a row matching on two columns is updated once, and
   * a column that does not match is rewritten to the value it already has. Table
   * and column names are the literals in TARGETS, never input; both strings
   * travel as parameters.
   */
  const results = (await sql.transaction(
    TARGETS.map(({ table, columns }) =>
      sql.query(
        `UPDATE ctr.${table}
            SET ${columns.map(rewrite).join(", ")}
          WHERE ${columns.map(matches).join(" OR ")}
         RETURNING 1`,
        [from, to]
      )
    )
  )) as unknown as unknown[][];

  return results.reduce((total, rows) => total + rows.length, 0);
}
