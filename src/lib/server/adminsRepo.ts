import "server-only";

import { normaliseAdminInput, type AdminAccount } from "@/lib/admins";
import { hashPassword } from "@/lib/server/auth";
import { type Grant } from "@/lib/roles";
import { getSql } from "@/lib/server/db";

/**
 * Every read and write of ctr.admins that is not the sign-in itself.
 *
 * `password_hash` is never in a column list here. That is the one rule this
 * file has: signing in reads it, in auth.ts, and nothing else ever needs it —
 * so it cannot be returned by accident to a screen, a route or a log line.
 *
 * Changing a password deletes that account's sessions, in the same transaction
 * as the change. Anything else would leave a browser signed in with a password
 * that no longer exists, which is exactly the situation someone is trying to
 * end when they change one.
 *
 * `pages` — which editors a scoped account may open — is a join table now
 * rather than a JSONB array on the row, so a grant is a real foreign key into
 * both `ctr.admins` and `ctr.sites`. A site that is not a site cannot be
 * granted, and deleting a sport takes its grants with it instead of leaving
 * them to be filtered out on every read.
 *
 * What changed in phase 1 is the shape of a grant: it was a page key and is now
 * a (site, module) pair, so `ctr.admin_pages` became `ctr.admin_grants`. The
 * site's SLUG is selected alongside its id for the reason `AdminSession` gives
 * — the media predicates compare folders, and a folder is named by slug.
 */

export async function listAdmins(): Promise<AdminAccount[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT a.id, a.username, a.role, a.created_at,
           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'siteId', g.site_id, 'siteSlug', s.slug, 'module', g.module)
                     ORDER BY s.sort_order, g.module), '[]'::jsonb)
             FROM ctr.admin_grants g JOIN ctr.sites s ON s.id = g.site_id
            WHERE g.admin_id = a.id) AS grants
      FROM ctr.admins a
     ORDER BY a.username ASC
  `) as AdminAccount[];

  return rows;
}

export async function getAdmin(id: string): Promise<AdminAccount | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT a.id, a.username, a.role, a.created_at,
           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'siteId', g.site_id, 'siteSlug', s.slug, 'module', g.module)
                     ORDER BY s.sort_order, g.module), '[]'::jsonb)
             FROM ctr.admin_grants g JOIN ctr.sites s ON s.id = g.site_id
            WHERE g.admin_id = a.id) AS grants
      FROM ctr.admins a
     WHERE a.id = ${id}
  `) as AdminAccount[];

  return rows[0] ?? null;
}

/**
 * The account's grants, replaced wholesale.
 *
 * A site that does not exist is refused by the foreign key rather than silently
 * dropped, which is the difference this table makes: `normalisePages` filtered
 * unknown keys out on the way in, and nothing checked what was already stored.
 */
async function writeGrants(id: string, grants: readonly Grant[]): Promise<void> {
  const sql = getSql();

  /*
   * The delete and the inserts in ONE transaction, not two calls: a save that
   * cleared the old grants and then failed on the new ones would leave an
   * account holding nothing, with no error the screen could act on. Same
   * reason the password change and the session purge share a transaction
   * below.
   */
  await sql.transaction([
    sql`DELETE FROM ctr.admin_grants WHERE admin_id = ${id}`,
    ...grants.map(
      (grant) => sql`
        INSERT INTO ctr.admin_grants (admin_id, site_id, module)
        VALUES (${id}, ${grant.siteId}, ${grant.module})
        ON CONFLICT DO NOTHING
      `
    ),
  ]);
}

/**
 * How many owners there are.
 *
 * Asked before a demotion or a delete: an admin with no owner cannot make one,
 * because making one is a thing only an owner can do. That is a locked door
 * with the key inside, and the only fix is a shell and the create-admin script.
 */
export async function countOwners(): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    SELECT count(*)::int AS count FROM ctr.admins WHERE role = 'owner'
  `) as { count: number }[];

  return rows[0]?.count ?? 0;
}

export async function createAdmin(input: unknown, password: string): Promise<AdminAccount> {
  const sql = getSql();
  const account = normaliseAdminInput(input);
  const hash = await hashPassword(password);

  const rows = (await sql`
    INSERT INTO ctr.admins (username, password_hash, role)
    VALUES (${account.username}, ${hash}, ${account.role})
    RETURNING id
  `) as { id: string }[];

  await writeGrants(rows[0].id, account.grants);

  const created = await getAdmin(rows[0].id);
  if (!created) throw new Error("The account was not written.");
  return created;
}

/**
 * Null when the id does not exist — the route turns that into a 404.
 *
 * A blank password means "leave it alone", which is what an edit of somebody's
 * pages should do. Only a non-blank one is written, and only then are their
 * sessions cleared.
 */
export async function updateAdmin(
  id: string,
  input: unknown,
  password: string
): Promise<AdminAccount | null> {
  const sql = getSql();
  const account = normaliseAdminInput(input);

  const rows = (await sql`
    UPDATE ctr.admins
       SET username = ${account.username},
           role     = ${account.role}
     WHERE id = ${id}
    RETURNING id
  `) as { id: string }[];

  if (rows.length === 0) return null;

  await writeGrants(id, account.grants);

  const updated = await getAdmin(id);
  if (!updated || !password) return updated;

  const hash = await hashPassword(password);
  await sql`UPDATE ctr.admins SET password_hash = ${hash} WHERE id = ${id}`;
  await sql`DELETE FROM ctr.sessions WHERE admin_id = ${id}`;

  return updated;
}

/**
 * One account's grants on ONE site, replaced wholesale.
 *
 * The narrow write behind the per-sport Co-admins screen. `writeGrants` above
 * replaces an account's grants everywhere, which is right for the owner's
 * Accounts screen and wrong for a sport admin: they may change who works on
 * their sport and must not be able to touch anybody's reach into another.
 *
 * So this deletes and re-inserts within one site and one transaction. Grants on
 * every other site are untouched because the `WHERE` cannot see them.
 *
 * Capabilities are not touched here at all, and that is the point: they name no
 * site, so there is no sense in which one of them is "on this sport" for a
 * sport admin to hand out. Only the owner's Accounts screen writes them.
 */
export async function setSiteGrants(
  adminId: string,
  siteId: string,
  grants: readonly Grant[]
): Promise<void> {
  const sql = getSql();

  await sql.transaction([
    sql`DELETE FROM ctr.admin_grants WHERE admin_id = ${adminId} AND site_id = ${siteId}`,
    ...grants
      .filter((grant) => grant.siteId === siteId)
      .map(
        (grant) => sql`
          INSERT INTO ctr.admin_grants (admin_id, site_id, module)
          VALUES (${adminId}, ${siteId}, ${grant.module})
          ON CONFLICT DO NOTHING
        `
      ),
  ]);
}

/** Sessions go with it: the row is referenced ON DELETE CASCADE. */
export async function deleteAdmin(id: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM ctr.admins WHERE id = ${id} RETURNING id
  `) as { id: string }[];

  return rows.length > 0;
}

/** Whether a username is already taken by someone else. */
export async function usernameTaken(username: string, exceptId?: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id FROM ctr.admins
     WHERE username = ${username}
       AND id <> ${exceptId ?? "00000000-0000-0000-0000-000000000000"}
  `) as { id: string }[];

  return rows.length > 0;
}
