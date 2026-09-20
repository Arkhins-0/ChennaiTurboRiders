-- 0020 · an enquiry gets a state, and an account can be given the enquiries
--
-- Two changes that only make sense together: there is now a screen that reads
-- ctr.enquiries, and somebody has to be allowed to open it.
--
-- ── The state ─────────────────────────────────────────────────────────────
--
-- `handled boolean` was written by nothing. It has been in the baseline since
-- the table was created and `grep` finds it in exactly two places: the type and
-- a RETURNING clause. It was a column waiting for a screen.
--
-- The screen wants three states, not two — a message nobody has read yet and a
-- message somebody is part-way through answering are different things, and the
-- whole point of a monitor is telling them apart at a glance. So `handled`
-- becomes `status`, and `true` lands on 'resolved' because that is what it
-- meant: somebody dealt with it.
--
-- ── Archiving, and why delete is not DELETE ───────────────────────────────
--
-- The console's delete button sets `archived_at` and nothing removes a row.
-- An enquiry is somebody writing in, and the cost of the two mistakes is not
-- symmetric: an archive that fills up with rubbish costs disk, and a DELETE on
-- the wrong row costs a customer nobody can now reply to. The archive is a
-- filter on this screen, and restoring is clearing the column again.
--
-- This does mean the table only grows. That is the intended trade and it is
-- cheap — an enquiry is three short strings, the rate limit in
-- /api/enquiry caps a single address at ten an hour, and nothing joins to it.
--
-- ── Why a second grants table rather than a ninth module ──────────────────
--
-- `ctr.admin_grants` is keyed (admin_id, site_id, module) with site_id NOT NULL
-- and a foreign key into ctr.sites. That shape is the point of it — 0013 exists
-- precisely because "may edit decks" had to become "may edit INCRC's decks".
--
-- An enquiry has no site. The table has no site_id and the comment in 0001 says
-- why: it "belongs to nobody and arrives from every page on the site". So there
-- is no site to name in a grant, and the three ways to force one in are all
-- worse than a second table:
--
--   a sentinel site        a row in ctr.sites that is not a site, which every
--                          query listing sports then has to remember to exclude
--   site_id nullable       NULL is not a primary key value; it would need a
--                          unique index over COALESCE and would break the
--                          foreign key that 0013 was written to gain
--   a grant on every site  right until somebody adds a sport, at which point
--                          the enquiries admin silently loses the screen
--
-- So: capabilities are grants with no site, in their own table. 'enquiries' is
-- the only one today. The CHECK is what a later one widens.

/* ────────────────────────── The state of an enquiry ─────────────────────── */

ALTER TABLE ctr.enquiries ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'unread';
ALTER TABLE ctr.enquiries ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- The whole of the backfill. Anything nobody had marked stays 'unread', which
-- is what it was.
UPDATE ctr.enquiries SET status = 'resolved' WHERE handled;

ALTER TABLE ctr.enquiries DROP COLUMN IF EXISTS handled;

-- Dropped and re-added rather than added: Postgres has no ADD CONSTRAINT IF NOT
-- EXISTS, and this is the idiom that is idempotent without one. Same reasoning
-- as the baseline's own constraint block.
ALTER TABLE ctr.enquiries DROP CONSTRAINT IF EXISTS enquiries_status_check;
ALTER TABLE ctr.enquiries ADD  CONSTRAINT enquiries_status_check
  CHECK (status IN ('unread', 'in_progress', 'resolved'));

/*
 * Three partial indexes, matching the three shapes the screen actually asks
 * for. All of them order by (created_at DESC, id DESC) because that is the
 * keyset the list pages on — both halves, or two enquiries sharing a
 * millisecond would step over each other at a page boundary. The same rule
 * `listEntries` follows.
 *
 * They are partial on `archived_at` because the working list and the archive
 * are disjoint and one of them is meant to stay small.
 */
CREATE INDEX IF NOT EXISTS enquiries_open_idx
  ON ctr.enquiries (created_at DESC, id DESC) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS enquiries_open_status_idx
  ON ctr.enquiries (status, created_at DESC, id DESC) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS enquiries_archived_idx
  ON ctr.enquiries (created_at DESC, id DESC) WHERE archived_at IS NOT NULL;

/* ──────────────────────── Grants that have no site ──────────────────────── */

CREATE TABLE IF NOT EXISTS ctr.admin_capabilities (
  admin_id   uuid NOT NULL REFERENCES ctr.admins(id) ON DELETE CASCADE,

  /*
   * 'enquiries'  the footer's message box, everywhere it appears. Read them,
   *              move them between states, archive and restore.
   *
   * An owner holds every capability by role and has no rows here, exactly as
   * an owner holds every module and has no rows in ctr.admin_grants.
   */
  capability text NOT NULL,

  PRIMARY KEY (admin_id, capability),
  CONSTRAINT admin_capabilities_capability_check CHECK (capability IN ('enquiries'))
);

/* ─────────────────────────────── Reconcile ──────────────────────────────── */

DO $$
DECLARE
  unread   int;
  progress int;
  resolved int;
  archived int;
BEGIN
  SELECT count(*) INTO unread   FROM ctr.enquiries WHERE status = 'unread';
  SELECT count(*) INTO progress FROM ctr.enquiries WHERE status = 'in_progress';
  SELECT count(*) INTO resolved FROM ctr.enquiries WHERE status = 'resolved';
  SELECT count(*) INTO archived FROM ctr.enquiries WHERE archived_at IS NOT NULL;

  RAISE NOTICE 'enquiries: % unread, % in progress, % resolved. % archived.',
               unread, progress, resolved, archived;

  /*
   * Nothing above can lose a row — the only UPDATE writes a column that did not
   * exist a moment ago, and no row is deleted. This says so out loud rather
   * than leaving it to be trusted: a migration that touches the one table
   * holding messages from the public should be able to prove it kept them.
   */
  IF EXISTS (SELECT 1 FROM ctr.enquiries WHERE status IS NULL) THEN
    RAISE EXCEPTION 'An enquiry ended up with no status. Nothing has been written.';
  END IF;
END $$;
