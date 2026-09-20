/**
 * Writes src/types/db.ts from the database's own catalogue.
 *
 *   npm run db:types
 *
 * ── Why ───────────────────────────────────────────────────────────────────
 *
 * Every repo in this project casts its rows: `as Track[]`, `as Form[]`,
 * `as Deck[]`. A cast is a promise the compiler cannot check, so the shape of a
 * row is asserted in TypeScript and defined in SQL, and the two are free to
 * drift. They have: `FormEntry.created_at` was typed `string` while the driver
 * returned a `Date` on every row ever read, which broke the CSV export and the
 * paging cursor, and nothing caught it because nothing could.
 *
 * These types are generated from `information_schema`, so they cannot drift. A
 * repo that casts to one of them is asserting something that was true of the
 * database at the moment this ran.
 *
 * ── What it deliberately does not do ──────────────────────────────────────
 *
 * It does not replace the DOMAIN types. `Deck`, `Form`, `Track` and the rest
 * describe what the application means, and a row describes what is stored —
 * `Deck.pages` is a list of images assembled from another table, and no row has
 * it. The generated types are for the row a query returns; the repos hydrate
 * that into the domain type, which is the boundary where a `timestamptz` stops
 * being a `Date` and starts being the ISO string the type claims.
 */
import { writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

export const OUT = "src/types/db.ts";

/**
 * What the Neon driver actually hands back for each Postgres type.
 *
 * `timestamptz` is `Date` and not `string`, which is the whole reason this file
 * exists — the driver registers a parser for it, and every type in this project
 * that said `string` was wrong until the repo converted it.
 *
 * `numeric` is `string`, deliberately, and that is the driver being careful:
 * an arbitrary-precision decimal does not fit in a JavaScript number, so it is
 * handed over as text rather than quietly rounded.
 */
const TYPES = {
  uuid: "string",
  text: "string",
  varchar: "string",
  bpchar: "string",
  int2: "number",
  int4: "number",
  int8: "string",
  float4: "number",
  float8: "number",
  numeric: "string",
  bool: "boolean",
  timestamptz: "Date",
  timestamp: "Date",
  date: "string",
  json: "unknown",
  jsonb: "unknown",
};

/** Every column of every table in the schema, in declaration order. */
export const INTROSPECT = `
  SELECT c.relname AS table_name,
         a.attname AS column_name,
         t.typname AS type_name,
         a.attnotnull AS not_null,
         obj_description(c.oid) AS table_comment
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_type t ON t.oid = a.atttypid
   WHERE c.relnamespace = 'ctr'::regnamespace
     AND c.relkind = 'r'
     AND a.attnum > 0
     AND NOT a.attisdropped
   ORDER BY c.relname, a.attnum`;

/** `form_entry_answers` → `FormEntryAnswersRow`. */
const nameOf = (table) =>
  table
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("") + "Row";

/**
 * The file, as text.
 *
 * Separated from the connection so the same formatting can be driven from a
 * migration rehearsal — which is how this file was first written, before any
 * database had the schema it describes.
 */
export function render(rows) {
  const tables = new Map();
  for (const row of rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, []);
    tables.get(row.table_name).push(row);
  }

  const parts = [
    `/**`,
    ` * Row types, generated from the database. Do not edit.`,
    ` *`,
    ` *   npm run db:types`,
    ` *`,
    ` * One type per table in the \`ctr\` schema, in the shape the Neon driver hands`,
    ` * back — which is not always the shape the domain types use. A \`timestamptz\``,
    ` * arrives as a \`Date\` and every repo converts it at the boundary; a \`jsonb\``,
    ` * column is \`unknown\` until something normalises it, which is the honest`,
    ` * answer for a column whose shape the database does not police.`,
    ` *`,
    ` * These describe a ROW. The domain types in src/lib describe what the`,
    ` * application means by one, and the two are different on purpose — a \`Deck\``,
    ` * has \`pages\`, and no row does.`,
    ` */`,
    "",
  ];

  for (const [table, columns] of [...tables].sort()) {
    parts.push(`export type ${nameOf(table)} = {`);

    for (const column of columns) {
      const type = TYPES[column.type_name] ?? "unknown";
      const nullable = column.not_null ? "" : " | null";
      parts.push(`  ${column.column_name}: ${type}${nullable};`);
    }

    parts.push("};", "");
  }

  parts.push("/** Every table in the schema, by name. */");
  parts.push("export type CtrTables = {");
  for (const [table] of [...tables].sort()) parts.push(`  ${table}: ${nameOf(table)};`);
  parts.push("};", "");

  return { text: parts.join("\n"), tables: tables.size };
}

// Run as a script rather than imported.
if (process.argv[1] && process.argv[1].endsWith("gen-types.mjs")) {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Make sure .env exists in the project root.");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql.query(INTROSPECT);

  if (rows.length === 0) {
    console.error("No tables in the ctr schema. Run npm run db:migrate first.");
    process.exit(1);
  }

  const { text, tables } = render(rows);
  writeFileSync(OUT, text, "utf8");
  console.log(`${OUT} — ${tables} table(s), ${rows.length} column(s).`);
}
