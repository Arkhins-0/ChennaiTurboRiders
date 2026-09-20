/**
 * Creates an admin account, or resets the password of an existing one.
 *
 *   npm run create-admin -- <username> <password>
 *   npm run create-admin -- <username> <password> --role member
 *
 * Two roles, described in src/lib/roles.ts: `owner` (everything, every sport,
 * including the accounts) and `member` (exactly what their grants say, and
 * nothing else). The default here is `owner`, unlike the database's own default
 * — this is the bootstrap tool, run by whoever owns the server, and the first
 * account it makes has to be able to make the rest.
 *
 * ── What this no longer does, and why ─────────────────────────────────────
 *
 * `--pages landing,incrc` is gone with the model it belonged to. A scope used to
 * be a page key in `ctr.admin_pages`; migration 0013 replaced it with a GRANT —
 * a (site, module) pair in `ctr.admin_grants` — because "may edit decks" has to
 * mean "may edit INCRC's decks" once there is more than one sport.
 *
 * That is a pair per grant, per sport, and expressing it as command-line flags
 * would be a worse version of the two screens that already do it: `/admins` for
 * an owner and `/site/<sport>/team` for a sport admin. So this makes the FIRST
 * account, which has to be an owner, and everything scoped is made there.
 *
 * A `member` made here therefore holds no grants and reaches no screen until
 * somebody gives it one. That is said out loud below rather than left to be
 * discovered at a blank console.
 *
 * Resetting an existing account's password does NOT change its role unless
 * `--role` is given. A routine "they forgot their password" must not quietly
 * promote a scoped account to owner.
 *
 * There is an Accounts screen in the admin that does all of this; this stays
 * for the first account, and for the day somebody locks themselves out.
 *
 * Expects the schema to be there: `npm run db:migrate` first. It used to apply
 * the whole of scripts/schema.mjs on the way past, which was convenient and is
 * exactly the habit versioned migrations exist to break — the bootstrap tool
 * should not be a second, quieter way of changing the shape of the database.
 */
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { neon } from "@neondatabase/serverless";

const scrypt = promisify(scryptCb);

const ROLES = ["owner", "member"];

const USAGE =
  "Usage: npm run create-admin -- <username> <password> [--role owner|member]";

/** Positional first, then flags. Anything unrecognised is an error, not a shrug. */
function parse(argv) {
  const positional = [];
  const flags = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const name = arg.slice(2);
    if (name !== "role") {
      console.error(`Unknown option "${arg}".`);
      console.error(USAGE);
      process.exit(1);
    }

    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      console.error(`--${name} needs a value.`);
      process.exit(1);
    }

    flags[name] = value;
    i += 1;
  }

  return { positional, flags };
}

const { positional, flags } = parse(process.argv.slice(2));
const [username, password] = positional;

if (!username || !password) {
  console.error(USAGE);
  process.exit(1);
}

if (password.length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(1);
}

const role = flags.role ?? "owner";
if (!ROLES.includes(role)) {
  console.error(`Unknown role "${role}". One of: ${ROLES.join(", ")}.`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Make sure .env exists in the project root.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

/** Same `scrypt:<saltHex>:<keyHex>` format src/lib/server/auth.ts verifies. */
async function hashPassword(plain) {
  const salt = randomBytes(16);
  const key = await scrypt(plain, salt, 64);
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

try {
  const hash = await hashPassword(password);

  // Whether the role is written on a conflict depends on whether it was asked
  // for. Without the flag this is a password reset and nothing else — see the
  // note at the top of the file.
  const setAccess = flags.role !== undefined;

  const rows = setAccess
    ? await sql`
        INSERT INTO ctr.admins (username, password_hash, role)
        VALUES (${username}, ${hash}, ${role})
        ON CONFLICT (username) DO UPDATE
          SET password_hash = EXCLUDED.password_hash,
              role          = EXCLUDED.role
        RETURNING id, role, (xmax = 0) AS inserted
      `
    : await sql`
        INSERT INTO ctr.admins (username, password_hash, role)
        VALUES (${username}, ${hash}, ${role})
        ON CONFLICT (username) DO UPDATE
          SET password_hash = EXCLUDED.password_hash
        RETURNING id, role, (xmax = 0) AS inserted
      `;

  const { id } = rows[0];

  /*
   * The grants are deliberately NOT touched, on either path.
   *
   * `ctr.admin_pages` used to be rewritten here from `--pages`; 0013 dropped it
   * for `ctr.admin_grants`, which this tool no longer writes at all — see the
   * note at the top. That also means a password reset cannot disturb what
   * somebody was granted in the console, which was already the promise and is
   * now true by construction rather than by a flag check.
   */

  // A password change invalidates whatever was signed in before it.
  await sql`DELETE FROM ctr.sessions WHERE admin_id = ${id}`;

  /*
   * Read back rather than echo the flags. On a reset the role is whatever it
   * already was, and reporting what was passed would say "owner" about an
   * account that is not one — the exact thing the note at the top of this file
   * promises not to do.
   */
  const granted = await sql`
    SELECT s.slug, g.module
      FROM ctr.admin_grants g JOIN ctr.sites s ON s.id = g.site_id
     WHERE g.admin_id = ${id}
     ORDER BY s.sort_order, g.module
  `;

  const access =
    rows[0].role === "owner"
      ? "owner — every sport, every screen"
      : `member — ${
          granted.map((row) => `${row.slug}:${row.module}`).join(", ") || "no grants yet"
        }`;

  console.log(
    rows[0].inserted
      ? `Created admin "${username}" (${access}).`
      : `Reset the password for "${username}" (${access}) and signed out its existing sessions.`
  );

  if (rows[0].role === "member" && granted.length === 0) {
    console.log(
      "\nThat account can sign in and reach no screen. Give it grants from /admins,\n" +
        "or from /site/<sport>/team as that sport's admin."
    );
  }

  if (!rows[0].inserted && !setAccess) {
    console.log("Its role and its grants were left as they were. Pass --role to change the role.");
  }

  console.log("Sign in at /login on the admin host.");
} catch (error) {
  /*
   * The likeliest failure on a new database, and the one with an answer. 42P01
   * is undefined_table and nothing else: matching "does not exist" anywhere in
   * the message also catches undefined_column (42703), which sent you to re-run
   * a migrate that had already worked when this script fell behind 0008.
   */
  if (error.code === "42P01") {
    console.error("There is no ctr.admins table yet. Run npm run db:migrate first.");
    process.exit(1);
  }

  console.error("Failed:", error.message);
  process.exit(1);
}
