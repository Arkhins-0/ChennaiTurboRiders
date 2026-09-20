import "server-only";

import { cache } from "react";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { getSql } from "@/lib/server/db";
import {
  normaliseGrants,
  normaliseRole,
  type AdminRole,
  type Grant,
} from "@/lib/roles";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

export const SESSION_COOKIE = "ctr_session";
const SESSION_TTL_DAYS = 7;
const KEY_LENGTH = 64;

/* ─── Passwords ─── */

/** Stored form: `scrypt:<saltHex>:<keyHex>`. Written by scripts/create-admin.mjs. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;

  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/* ─── Sessions ─── */

/** Only the hash is stored, so a leaked table cannot be replayed as a login. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(adminId: string): Promise<void> {
  const sql = getSql();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await sql`
    INSERT INTO ctr.sessions (token_hash, admin_id, expires_at)
    VALUES (${hashToken(token)}, ${adminId}, ${expiresAt.toISOString()})
  `;

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Who is signed in, and what they may touch.
 *
 * The role travels with the session rather than being looked up where it is
 * needed: a screen and the route behind it both have to ask, and two lookups
 * are two chances to ask different questions. `src/lib/roles.ts` is where the
 * answer is interpreted; this only carries it.
 */
export type AdminSession = {
  adminId: string;
  username: string;
  role: AdminRole;
  /**
   * Every (site, module) pair this account holds, each carrying the site's slug
   * as well as its id. Both are here because two different questions are asked
   * of a grant: a route guard has an id from the database, and the media
   * library has a folder name, which is a slug. Carrying the slug costs one
   * join here and saves a query inside a predicate the browser also runs.
   */
  grants: Grant[];
};

/**
 * `cache()` dedupes within a single request — the layout that gates /admin and
 * the page inside it both ask, and that should cost one query, not two.
 */
export const getSession = cache(async (): Promise<AdminSession | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT a.id AS admin_id, a.username, a.role,
             (SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'siteId', g.site_id, 'siteSlug', site.slug, 'module', g.module)
                       ORDER BY site.sort_order, g.module), '[]'::jsonb)
                FROM ctr.admin_grants g
                JOIN ctr.sites site ON site.id = g.site_id
               WHERE g.admin_id = a.id) AS grants
        FROM ctr.sessions s
        JOIN ctr.admins a ON a.id = s.admin_id
       WHERE s.token_hash = ${hashToken(token)}
         AND s.expires_at > now()
    `) as {
      admin_id: string;
      username: string;
      role: unknown;
      grants: unknown;
    }[];

    const row = rows[0];
    if (!row) return null;

    // Normalised here rather than trusted. The role does have a CHECK now, but
    // a grant module can be retired by a later migration while a session
    // predating it is still live — and an unrecognised grant has to read as no
    // grant, never as a wider one.
    return {
      adminId: row.admin_id,
      username: row.username,
      role: normaliseRole(row.role),
      grants: normaliseGrants(row.grants),
    };
  } catch {
    // A database that is down reads as "not signed in", which sends the visitor
    // to the login screen rather than showing a stack trace.
    return null;
  }
});

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    try {
      await getSql()`DELETE FROM ctr.sessions WHERE token_hash = ${hashToken(token)}`;
    } catch {
      // The cookie is cleared below regardless; the row expires on its own.
    }
  }

  jar.delete(SESSION_COOKIE);
}

/** Best-effort cleanup so the sessions table does not grow without bound. */
export async function pruneExpiredSessions(): Promise<void> {
  try {
    await getSql()`DELETE FROM ctr.sessions WHERE expires_at < now()`;
  } catch {
    // Non-critical.
  }
}
