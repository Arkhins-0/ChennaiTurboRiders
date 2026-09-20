-- 0017 · the header and footer become each site's own
--
-- 0012 created `ctr.pages.kind = 'chrome'` and put nothing in it, with a note
-- saying this migration is the one that has something to put there. This is it.
--
-- Six sections — `brand`, `nav`, `splash`, `contact`, `socials`, `footer` — have
-- been sitting on the ROOT site's HOME page since 0015, mixed in with the
-- landing page's own bands, and every route in the project has drawn them
-- whatever site it was serving. That was the truth of the old model: there was
-- one header because there was one site.
--
-- After this each site has a `chrome` page of its own, and `getChrome(site)`
-- reads that site's. A sport admin can put their own mark, their own navigation
-- and their own footer on their own sport, which is most of what the brief asked
-- for and the last thing phase 3 left behind.
--
-- ── Why INCRC gets a COPY rather than a blank page ────────────────────────
--
-- Because the bar for this migration is that the rendered site does not change.
-- A blank chrome renders an empty navigation bar and a footer with nothing above
-- it — a visible regression on every page of the sport, to be repaired by hand
-- afterwards. A copy renders exactly what /incrc renders today, and the sport
-- admin changes it when they have something to change it to.
--
-- The one field NOT copied is the splash screen's, and that is also a
-- do-not-change-the-page decision: only the landing page has ever drawn a splash
-- (a sport reached from it has already paid that cost), so copying the root's
-- logo and title would put a full-screen cover on /incrc that nobody asked for.
-- The section is still created, and still empty, which is exactly what the
-- renderer treats as "no splash".
--
-- ── Why the list of six is written out here ───────────────────────────────
--
-- A migration cannot ask the registry which sections are chrome — that lives in
-- TypeScript, and the whole reason `page_sections.type` has no CHECK constraint
-- (see 0015) is that the database is deliberately not the vocabulary. So this
-- file names the six as they stand today. That is right for a migration, which
-- is a statement about one moment: a seventh chrome section added next year is
-- created on the chrome page by the console and has nothing to move.

/* ─────────────────────── A chrome page per site ─────────────────────────── */

/*
 * `NOT EXISTS` rather than `ON CONFLICT`: the unique index that would catch a
 * duplicate is partial (`WHERE kind <> 'custom'`, from 0012), and inferring a
 * conflict target from a partial index means restating its predicate. Saying
 * what is meant is shorter than saying it twice.
 */
INSERT INTO ctr.pages (site_id, kind, name, sort_order)
SELECT s.id, 'chrome', 'Header and footer', 20
  FROM ctr.sites s
 WHERE NOT EXISTS (
   SELECT 1 FROM ctr.pages p WHERE p.site_id = s.id AND p.kind = 'chrome'
 );

/* ──────────────── The six move off the home page they were on ───────────── */

CREATE TEMP TABLE chrome_type (type text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO chrome_type (type)
VALUES ('brand'), ('nav'), ('splash'), ('contact'), ('socials'), ('footer');

/*
 * A move, not a copy: same row, same id, same `updated_at`. Nothing points at a
 * section id from outside `page_sections` except the four promoted tables, and
 * none of the six has a promoted list — the reconcile block at the foot says so
 * out loud rather than trusting it.
 */
UPDATE ctr.page_sections ps
   SET page_id = chrome.id
  FROM ctr.pages home
  JOIN ctr.pages chrome ON chrome.site_id = home.site_id AND chrome.kind = 'chrome'
 WHERE ps.page_id = home.id
   AND home.kind = 'home'
   AND ps.type IN (SELECT type FROM chrome_type);

/* ─────────── A site with no chrome of its own starts with the root's ─────── */

/*
 * Every chrome page that came out empty is filled from the root's, with fresh
 * ids (the column defaults to `gen_random_uuid()`, so simply not naming it is
 * what mints them) and the splash blanked for the reason at the top of this
 * file.
 *
 * The `NOT EXISTS` is safe against the rows this same statement is inserting:
 * an INSERT ... SELECT reads the snapshot taken when the statement began, so a
 * page cannot be filled twice by its own first row.
 */
INSERT INTO ctr.page_sections (page_id, type, "position", visible, data)
SELECT target.id, src.type, src."position", src.visible,
       CASE WHEN src.type = 'splash' THEN '{}'::jsonb ELSE src.data END
  FROM ctr.pages target
  CROSS JOIN (
    SELECT ps.type, ps."position", ps.visible, ps.data
      FROM ctr.page_sections ps
      JOIN ctr.pages rp   ON rp.id = ps.page_id AND rp.kind = 'chrome'
      JOIN ctr.sites root ON root.id = rp.site_id AND root.kind = 'root'
  ) src
 WHERE target.kind = 'chrome'
   AND NOT EXISTS (SELECT 1 FROM ctr.page_sections x WHERE x.page_id = target.id);

/* ───────────────────────────── Close the gaps ───────────────────────────── */

/*
 * Both pages are renumbered, because both changed shape: the root's home page
 * lost six rows out of the middle of its order, and every chrome page has just
 * gained its first.
 *
 * `row_number()` over the existing order rather than arithmetic on the old
 * values, so the result is 1..n with no gaps whatever the input was — the same
 * shape 0015 used, and for the same reason.
 */
WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY page_id ORDER BY "position", type) AS n
    FROM ctr.page_sections
)
UPDATE ctr.page_sections ps SET "position" = o.n FROM ordered o WHERE o.id = ps.id;

/* ─────────────────────────────── Reconcile ──────────────────────────────── */

DO $$
DECLARE
  sites       int;
  chromes     int;
  rows_on     int;
  root_chrome int;
  gaps        int;
BEGIN
  SELECT count(*) INTO sites   FROM ctr.sites;
  SELECT count(*) INTO chromes FROM ctr.pages WHERE kind = 'chrome';
  SELECT count(*) INTO rows_on FROM ctr.page_sections ps
    JOIN ctr.pages p ON p.id = ps.page_id WHERE p.kind = 'chrome';

  RAISE NOTICE 'chrome pages: % for % site(s), carrying % section(s).', chromes, sites, rows_on;

  IF chromes <> sites THEN
    RAISE EXCEPTION 'A site came out without a chrome page. Nothing has been written.';
  END IF;

  /*
   * Every site must end up with the SAME chrome the root has.
   *
   * Not "with six". Six is what the root happens to carry today, and asserting
   * the number would turn a seventh chrome section — an ordinary thing to add —
   * into a migration that fails on a database it already ran against. What is
   * actually being checked is that the copy reached every site, and the root is
   * the thing it was copied from.
   *
   * `root_chrome = 0` is the fresh-install case and passes: a database created
   * from nothing has no chrome sections to move and none to copy, so every site
   * legitimately ends up with an empty chrome page. The application draws
   * BLANK_CHROME for it and `npm run db:seed` fills it in — see the `chrome`
   * array in the seed files under scripts/seed-data.
   *
   * (No glob in that path on purpose: a Postgres block comment NESTS, so the
   * `/` and `*` of a wildcard opens a second comment that never closes and
   * takes the rest of the file with it.)
   */
  SELECT count(*) INTO root_chrome
    FROM ctr.page_sections ps
    JOIN ctr.pages p ON p.id = ps.page_id AND p.kind = 'chrome'
    JOIN ctr.sites s ON s.id = p.site_id AND s.kind = 'root';

  IF root_chrome = 0 THEN
    RAISE NOTICE 'no chrome sections anywhere — a fresh database. The seed will bring them.';
  ELSIF EXISTS (
    SELECT 1 FROM ctr.pages p
     WHERE p.kind = 'chrome'
       AND (SELECT count(*) FROM ctr.page_sections ps WHERE ps.page_id = p.id) <> root_chrome
  ) THEN
    RAISE EXCEPTION 'A chrome page did not come out with the % section(s) the root has. '
                    'Nothing has been written.', root_chrome;
  END IF;

  /*
   * Nothing chrome left on a home page, and nothing else on a chrome page —
   * the two halves of "the move happened and took nothing extra with it".
   */
  IF EXISTS (
    SELECT 1 FROM ctr.page_sections ps
      JOIN ctr.pages p ON p.id = ps.page_id
     WHERE p.kind <> 'chrome' AND ps.type IN (SELECT type FROM chrome_type)
  ) THEN
    RAISE EXCEPTION 'A chrome section is still on a page body. Nothing has been written.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM ctr.page_sections ps
      JOIN ctr.pages p ON p.id = ps.page_id
     WHERE p.kind = 'chrome' AND ps.type NOT IN (SELECT type FROM chrome_type)
  ) THEN
    RAISE EXCEPTION 'A page band ended up on a chrome page. Nothing has been written.';
  END IF;

  /*
   * None of the six may carry promoted rows, which is what makes the move above
   * a single UPDATE rather than a copy with its children. If this ever fires,
   * the section that gained a promoted list needs moving with its rows.
   */
  IF EXISTS (
    SELECT 1 FROM ctr.page_sections ps WHERE ps.type IN (SELECT type FROM chrome_type)
       AND (EXISTS (SELECT 1 FROM ctr.banners         WHERE section_id = ps.id)
         OR EXISTS (SELECT 1 FROM ctr.posts           WHERE section_id = ps.id)
         OR EXISTS (SELECT 1 FROM ctr.partners        WHERE section_id = ps.id)
         OR EXISTS (SELECT 1 FROM ctr.calendar_rounds WHERE section_id = ps.id))
  ) THEN
    RAISE EXCEPTION 'A chrome section is carrying promoted rows. Nothing has been written.';
  END IF;

  SELECT count(*) INTO gaps FROM (
    SELECT page_id FROM ctr.page_sections
     GROUP BY page_id
    HAVING max("position") <> count(*) OR min("position") <> 1
  ) x;

  IF gaps > 0 THEN
    RAISE EXCEPTION 'A page came out with a gap in its running order. Nothing has been written.';
  END IF;
END $$;
