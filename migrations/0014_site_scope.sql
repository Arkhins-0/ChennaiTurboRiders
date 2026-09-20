-- 0014 · every record belongs to a sport, and an address is unique within one
--
-- Decks and circuits were global tables with a comment explaining that a deck
-- belongs to nobody. That was true of a site with one sport and stops being
-- true the moment there are two: a pickleball admin must not see the INCRC
-- decks, and the two must be able to use the same address without colliding.
--
-- Four tables gain `site_id`, and `ctr.slugs` gains it as part of its key.
--
-- ── Where the existing rows go, and why ───────────────────────────────────
--
--   decks, tracks    INCRC. Every one of them is a motorsport record — three
--                    circuits and three decks about the championship — and the
--                    landing page links to decks rather than owning them.
--   forms, articles  by their old page_key. '' and NULL mean "no page", which
--                    on the landing page's own screen meant the landing page,
--                    so they go to the root site.
--
-- Both tables are empty on this database, so that mapping is a rule the
-- migration states rather than rows it moves.
--
-- ── What an address is unique within, now ─────────────────────────────────
--
-- `ctr.slugs` was PK (entity_type, slug): one global namespace, which is what
-- made `/deck/<slug>` resolvable without knowing the sport. Phase 3 puts the
-- sport in the URL, so the namespace is per site — `/incrc/deck/opener` and
-- `/pickle/deck/opener` are two decks and neither has to rename.
--
-- `slugs_one_current_idx` deliberately stays keyed on (entity_type, entity_id)
-- with no site: an entity_id is a uuid and already identifies the record and
-- therefore its site. Adding site_id would widen the index without excluding
-- anything, and `ctr.forget_slugs()` — which deletes by (entity_type,
-- entity_id) on every delete — would stop being able to use it.

/* ───────────────────────── The records get an owner ─────────────────────── */

ALTER TABLE ctr.decks    ADD COLUMN site_id uuid REFERENCES ctr.sites(id) ON DELETE CASCADE;
ALTER TABLE ctr.tracks   ADD COLUMN site_id uuid REFERENCES ctr.sites(id) ON DELETE CASCADE;
ALTER TABLE ctr.forms    ADD COLUMN site_id uuid REFERENCES ctr.sites(id) ON DELETE CASCADE;
ALTER TABLE ctr.articles ADD COLUMN site_id uuid REFERENCES ctr.sites(id) ON DELETE CASCADE;

/*
 * A sport site to hang the motorsport records on. `sites_one_root_idx`
 * guarantees exactly one root; this picks the first sport by sort order, which
 * on this database is INCRC and on any database is the only sport there is at
 * this point in the migration sequence.
 */
CREATE TEMP TABLE home_site ON COMMIT DROP AS
SELECT
  (SELECT id FROM ctr.sites WHERE kind = 'root' LIMIT 1)                        AS root_id,
  (SELECT id FROM ctr.sites WHERE kind = 'sport' ORDER BY sort_order, name LIMIT 1) AS sport_id;

UPDATE ctr.decks  SET site_id = (SELECT coalesce(sport_id, root_id) FROM home_site);
UPDATE ctr.tracks SET site_id = (SELECT coalesce(sport_id, root_id) FROM home_site);

UPDATE ctr.forms f
   SET site_id = coalesce(
     (SELECT s.id FROM ctr.sites s WHERE s.slug = f.page_key),
     (SELECT root_id FROM home_site)
   );

UPDATE ctr.articles a
   SET site_id = coalesce(
     (SELECT s.id FROM ctr.sites s WHERE s.slug = a.page_key),
     (SELECT root_id FROM home_site)
   );

ALTER TABLE ctr.decks    ALTER COLUMN site_id SET NOT NULL;
ALTER TABLE ctr.tracks   ALTER COLUMN site_id SET NOT NULL;
ALTER TABLE ctr.forms    ALTER COLUMN site_id SET NOT NULL;
ALTER TABLE ctr.articles ALTER COLUMN site_id SET NOT NULL;

/* ─────────────────── The old page scoping comes off ─────────────────────── */

/*
 * `forms.page_key` carried a CHECK listing the two page keys by name — the
 * single hardest blocker to a second sport in the whole schema, because a new
 * sport could not own a registration form without a migration. It goes with the
 * column.
 */
-- `forms_page_idx` covered `page_key` and goes with the column; Postgres drops
-- an index as soon as one of its columns does. The same is true of
-- `articles_page_idx` below. Both are replaced by a site-keyed equivalent.
ALTER TABLE ctr.forms
  DROP CONSTRAINT forms_page_key_check,
  DROP COLUMN page_key;

CREATE INDEX forms_site_idx ON ctr.forms (site_id, sort_order, name);

/*
 * `articles.page_key` NULL meant "every page, owner only". There is no such
 * thing now: an article belongs to a sport the way everything else does, and
 * the ones that meant "everywhere" become the root site's — which is where a
 * cross-cutting article was actually shown from.
 */
ALTER TABLE ctr.articles
  DROP CONSTRAINT articles_page_key_fkey,
  DROP COLUMN page_key;

CREATE INDEX articles_site_idx ON ctr.articles (site_id, sort_order);

CREATE INDEX decks_site_idx  ON ctr.decks  (site_id, sort_order, name);
CREATE INDEX tracks_site_idx ON ctr.tracks (site_id, sort_order, name);

/* A circuit's address is unique within its sport, not across all of them. */
DROP INDEX ctr.tracks_slug_idx;
CREATE UNIQUE INDEX tracks_slug_idx ON ctr.tracks (site_id, slug);

/* ────────────────────────── Addresses get a site ────────────────────────── */

ALTER TABLE ctr.slugs ADD COLUMN site_id uuid REFERENCES ctr.sites(id) ON DELETE CASCADE;

/*
 * Polymorphic by design — there is no foreign key from `slugs` to anything, so
 * the site comes from whichever table owns the entity. A slug whose entity has
 * since vanished has no site to inherit and is deleted: it was already dead,
 * since nothing could resolve it, and `forget_slugs()` exists precisely to stop
 * these accumulating.
 */
UPDATE ctr.slugs s SET site_id = d.site_id FROM ctr.decks    d WHERE s.entity_type = 'deck'    AND d.id = s.entity_id;
UPDATE ctr.slugs s SET site_id = f.site_id FROM ctr.forms    f WHERE s.entity_type = 'form'    AND f.id = s.entity_id;
UPDATE ctr.slugs s SET site_id = a.site_id FROM ctr.articles a WHERE s.entity_type = 'article' AND a.id = s.entity_id;

DO $$
DECLARE dead int;
BEGIN
  SELECT count(*) INTO dead FROM ctr.slugs WHERE site_id IS NULL;
  IF dead > 0 THEN
    RAISE NOTICE '% address(es) pointed at a record that no longer exists and were dropped.', dead;
  END IF;
END $$;

DELETE FROM ctr.slugs WHERE site_id IS NULL;

ALTER TABLE ctr.slugs
  ALTER COLUMN site_id SET NOT NULL,
  DROP CONSTRAINT slugs_pkey,
  ADD CONSTRAINT slugs_pkey PRIMARY KEY (site_id, entity_type, slug);

/* ──────────────────── The last of the old page lookup ───────────────────── */

/*
 * Nothing references it now: 0013 dropped `admin_pages` and the two columns
 * above were the only other holders. `ctr.pages` means something else entirely
 * from here — a surface within a site.
 */
DROP TABLE ctr.legacy_pages;

/* ─────────────────────────────── Reconcile ──────────────────────────────── */

DO $$
DECLARE
  r record;
  total int;
BEGIN
  FOR r IN
    SELECT s.slug,
           (SELECT count(*) FROM ctr.decks    WHERE site_id = s.id) AS decks,
           (SELECT count(*) FROM ctr.tracks   WHERE site_id = s.id) AS tracks,
           (SELECT count(*) FROM ctr.forms    WHERE site_id = s.id) AS forms,
           (SELECT count(*) FROM ctr.articles WHERE site_id = s.id) AS articles,
           (SELECT count(*) FROM ctr.slugs    WHERE site_id = s.id) AS slugs
      FROM ctr.sites s ORDER BY s.sort_order
  LOOP
    RAISE NOTICE '% — % deck(s), % circuit(s), % form(s), % article(s), % address(es).',
      rpad(r.slug, 8), r.decks, r.tracks, r.forms, r.articles, r.slugs;
  END LOOP;

  /*
   * Every current address must still resolve to exactly one record within its
   * site. This is the check that the widened key did not merge two rows or
   * strand one — the same property `slugs_one_current_idx` guarantees going
   * forward, asserted once here against the data as it stands.
   */
  SELECT count(*) INTO total
    FROM (SELECT site_id, entity_type, slug FROM ctr.slugs
           GROUP BY 1, 2, 3 HAVING count(*) > 1) AS clashes;

  IF total > 0 THEN
    RAISE EXCEPTION '% address(es) are claimed twice within one site. Nothing has been written.', total;
  END IF;
END $$;
