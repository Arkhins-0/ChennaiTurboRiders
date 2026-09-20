-- 0013 · an account's scope becomes (site, module) instead of (page)
--
-- The three roles in src/lib/roles.ts divided the admin by the THING being
-- edited, which was the right axis while there was one site: `pages` plus a
-- list of page keys, or `registrations`, or `owner`. With more than one sport
-- that axis is short by a dimension — "may edit decks" has to mean "may edit
-- INCRC's decks", not everybody's.
--
-- So the list of page keys becomes a list of (site, module) pairs, and the role
-- collapses to the only distinction that is genuinely about the account rather
-- than about a site:
--
--   owner   the super admin. Creates sites, creates sport admins, sees all.
--   member  reaches exactly what ctr.admin_grants says, and nothing else.
--
-- ── The three shapes a member can have ────────────────────────────────────
--
--   sport admin   one row: (admin, site, '*')
--                 Everything on that site, including its team — a '*' holder
--                 may grant modules to co-admins on that site and only there.
--   co-admin      one row per module: (admin, site, 'articles'), …
--   nothing       no rows. Signs in, reaches no screen. Same as today.
--
-- ── Why 'media' is not a module ───────────────────────────────────────────
--
-- Media access is derived, not granted. A folder belongs to a site, so the
-- question "may they open incrc/decks/?" is already answered by "have they any
-- grant on incrc?" — which is exactly how `canBrowseFolder` composes out of the
-- page predicates today. A separate grant would be a second source of truth for
-- a question the first one already answers, and the two would drift.

/* ────────────────────────────── The grants ──────────────────────────────── */

CREATE TABLE ctr.admin_grants (
  admin_id uuid NOT NULL REFERENCES ctr.admins(id) ON DELETE CASCADE,
  site_id  uuid NOT NULL REFERENCES ctr.sites(id)  ON DELETE CASCADE,

  /*
   * '*'        everything on this site, and the right to hand pieces of it out
   * 'page'     the home page's sections
   * 'chrome'   the header and footer
   * 'team'     the co-admins for this site. Implied by '*'; grantable alone so
   *            somebody can run the roster without being able to edit the copy.
   * the rest   one admin screen each, and only where the site has the feature
   *            switched on in ctr.site_modules
   */
  module   text NOT NULL,

  PRIMARY KEY (admin_id, site_id, module),
  CONSTRAINT admin_grants_module_check CHECK (module IN (
    '*', 'page', 'chrome', 'team',
    'decks', 'forms', 'articles', 'events', 'circuits'
  ))
);

CREATE INDEX admin_grants_site_idx ON ctr.admin_grants (site_id, module);

/* ─────────────────────── Carrying today's access over ───────────────────── */

/*
 * `admin_pages` holds zero rows on this database and there is exactly one
 * account, an owner — so in practice nothing moves here. The mapping is written
 * out in full anyway: a migration that only works against the data in front of
 * it is a migration that cannot be rehearsed on a copy, and this one has to run
 * against whatever the database looks like on the day.
 *
 * Where each old page key lands:
 *
 *   landing   → the root site, 'page'.  It was a page, and it still is one.
 *   incrc     → the INCRC site, 'page'. Likewise.
 *   circuits  → INCRC, 'circuits'.  These three were never pages. They were
 *   decks     → INCRC, 'decks'.     admin screens over global tables, and the
 *   articles  → INCRC, 'articles'.  tables were INCRC's in all but name.
 *
 * A `registrations` admin had every form on every page, so they get 'forms' on
 * every site — the same reach, expressed per site.
 */

INSERT INTO ctr.admin_grants (admin_id, site_id, module)
SELECT DISTINCT ap.admin_id, s.id, m.module
  FROM ctr.admin_pages ap
  JOIN ctr.admins a ON a.id = ap.admin_id AND a.role = 'pages'
  JOIN (VALUES
          ('landing',  'landing', 'page'),
          ('incrc',    'incrc',   'page'),
          ('circuits', 'incrc',   'circuits'),
          ('decks',    'incrc',   'decks'),
          ('articles', 'incrc',   'articles')
       ) AS m(page_key, site_slug, module) ON m.page_key = ap.page_key
  JOIN ctr.sites s ON s.slug = m.site_slug
ON CONFLICT DO NOTHING;

INSERT INTO ctr.admin_grants (admin_id, site_id, module)
SELECT a.id, s.id, 'forms'
  FROM ctr.admins a
 CROSS JOIN ctr.sites s
 WHERE a.role = 'registrations'
ON CONFLICT DO NOTHING;

/* ─────────────────────────────── The role ───────────────────────────────── */

ALTER TABLE ctr.admins DROP CONSTRAINT admins_role_check;

UPDATE ctr.admins SET role = 'member' WHERE role <> 'owner';

ALTER TABLE ctr.admins
  ALTER COLUMN role SET DEFAULT 'member',
  ADD CONSTRAINT admins_role_check CHECK (role IN ('owner', 'member'));

/*
 * The last owner cannot be demoted — `adminsRepo.countOwners()` checks it
 * before every write, and that check is the only thing standing between a
 * mistyped form and a console nobody can get into. It stays in TypeScript
 * because it needs to produce an error message, but it is worth the database
 * refusing too: a script, a psql session or a future migration can all reach
 * past the repo, and none of them would be the first to try.
 */
CREATE OR REPLACE FUNCTION ctr.keep_an_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ctr.admins WHERE role = 'owner') THEN
    RAISE EXCEPTION 'That would leave no owner. Promote another account first.';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER admins_keep_an_owner
  AFTER UPDATE OR DELETE ON ctr.admins
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ctr.keep_an_owner();

/* ─────────────────────────── The old scope goes ─────────────────────────── */

DROP TABLE ctr.admin_pages;

/* ─────────────────────────────── Reconcile ──────────────────────────────── */

DO $$
DECLARE
  owners  int;
  members int;
  grants  int;
  stranded int;
BEGIN
  SELECT count(*) INTO owners  FROM ctr.admins WHERE role = 'owner';
  SELECT count(*) INTO members FROM ctr.admins WHERE role = 'member';
  SELECT count(*) INTO grants  FROM ctr.admin_grants;

  SELECT count(*) INTO stranded
    FROM ctr.admins a
   WHERE a.role = 'member'
     AND NOT EXISTS (SELECT 1 FROM ctr.admin_grants g WHERE g.admin_id = a.id);

  RAISE NOTICE 'accounts: % owner(s), % member(s). grants: %.', owners, members, grants;

  IF stranded > 0 THEN
    RAISE NOTICE '% member(s) hold no grant and can reach no screen. '
                 'That is carried faithfully from the old data, not introduced here — '
                 'look at the Accounts screen afterwards.', stranded;
  END IF;

  /*
   * An owner must survive — IF there was anybody to survive.
   *
   * This asks whether the collapse from three roles to two lost the account that
   * can reach everything, and on a database with accounts that is exactly the
   * right question. On one created from nothing there are no accounts at all,
   * which is not a lost owner: it is a deployment where nobody has run
   * `npm run create-admin` yet, and that script makes an owner.
   *
   * `members > 0` is the whole of the distinction. Nought owners beside nought
   * members is an empty table; nought owners beside somebody is the failure this
   * was written to catch.
   */
  IF owners = 0 AND members > 0 THEN
    RAISE EXCEPTION 'No owner survived. Nothing has been written.';
  END IF;
END $$;
