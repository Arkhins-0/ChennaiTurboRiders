-- 0021 · a season is a thing, and rounds belong to one
--
-- 0018 made a round of the season a row with an address. It did not make the
-- SEASON anything: every event hung off the site, the calendar band drew all of
-- them, and the band's heading said "The 2026 Season" because somebody typed
-- that. The first January after go-live, a championship adding four rounds for
-- 2027 gets a home page showing eight, under a heading naming the wrong year,
-- with a countdown reaching across the two.
--
-- A season has a name, an order, a status and rounds under it. That is a row,
-- by the same argument 0018 made about rounds: nothing can link to it, nothing
-- can point a foreign key at it, and it can carry nothing of its own until it
-- is one.
--
-- ── What a season is NOT given ────────────────────────────────────────────
--
-- Dates. It would be two more fields to keep in step with the rounds that
-- already carry them, and every question worth asking — when does it start,
-- which is running now, is it over — is answerable from the rounds themselves.
-- `currentSeason` in seasonsRepo derives it, and derives it the same way the
-- band already picks the next round.
--
-- ── The backfill: one season per site per year ────────────────────────────
--
-- Named for the year its rounds run in, which is what a motorsport season is
-- called nearly everywhere, and addressed at that year — `/incrc/calendar/2026`.
-- A site whose existing rounds span two years gets two seasons, which is the
-- honest reading of rows that were never asked which season they belonged to.
--
-- A round with no date at all cannot be placed by year, so it joins its site's
-- earliest season and the reconcile says how many did. Better a round in the
-- wrong season, visible and movable on one screen, than a round with no season
-- and a NOT NULL to satisfy.
--
-- ── Why seasons and rounds share one address space ───────────────────────
--
-- Both publish under `/<sport>/calendar/`, so `/incrc/calendar/2026` and
-- `/incrc/calendar/round-01` are the same route reading two kinds of record.
-- `ctr.slugs` is keyed (site_id, entity_type, slug), so the database would
-- happily let a season and a round both be called `round-01` — and the URL
-- could then only mean one of them. The reconcile refuses that, and
-- `findCalendarSlugOwner` in the application checks both kinds before either
-- is saved.

/* ──────────────────────────── The table ─────────────────────────────────── */

CREATE TABLE ctr.seasons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid NOT NULL REFERENCES ctr.sites(id) ON DELETE CASCADE,

  /* "2026 Season", "Season 12". Whatever the championship calls it. */
  name        text NOT NULL DEFAULT '',
  subtitle    text NOT NULL DEFAULT '',

  /* Draft or published — announce next season before its rounds are public. */
  status      text NOT NULL DEFAULT 'draft',

  cover_image text NOT NULL DEFAULT '',

  /*
   * Ascending, like every other ordered table here — but seasons are LISTED
   * descending, because an archive reads newest first. The backfill sets this
   * to the year, so the two agree without anybody arranging them.
   */
  sort_order  integer NOT NULL DEFAULT 0,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT seasons_status_check CHECK (status IN ('draft', 'published'))
);

CREATE INDEX seasons_site_idx ON ctr.seasons (site_id, sort_order);

/* ─────────────────── ctr.slugs learns about a fifth kind ─────────────────── */

ALTER TABLE ctr.slugs DROP CONSTRAINT slugs_entity_type_check;
ALTER TABLE ctr.slugs ADD  CONSTRAINT slugs_entity_type_check
  CHECK (entity_type IN ('deck', 'form', 'article', 'event', 'season'));

CREATE TRIGGER seasons_forget_slugs AFTER DELETE ON ctr.seasons
  FOR EACH ROW EXECUTE FUNCTION ctr.forget_slugs('season');

/* ─────────────────────── Every round joins a season ─────────────────────── */

/*
 * CASCADE, deliberately. Deleting a season deletes its rounds, and the console
 * says how many before it does — the same shape `deleteSite` has, for the same
 * reason: a season with its rounds cut out from under it is not a state anybody
 * asked for, and "delete the season but keep four orphans" has nowhere to put
 * them.
 */
ALTER TABLE ctr.events
  ADD COLUMN season_id uuid REFERENCES ctr.seasons(id) ON DELETE CASCADE;

/* One season per site per year its rounds run in. */
CREATE TEMP TABLE years ON COMMIT DROP AS
SELECT DISTINCT
       e.site_id,
       extract(year FROM coalesce(e.date_from, e.date_to))::int AS year
  FROM ctr.events e
 WHERE coalesce(e.date_from, e.date_to) IS NOT NULL;

CREATE TEMP TABLE made ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, site_id, year,
       year::text || ' Season' AS name,
       year::text AS slug
  FROM years;

INSERT INTO ctr.seasons (id, site_id, name, status, sort_order)
SELECT id, site_id, name,
       /*
        * Published, because its rounds already are. Migrating them to `draft`
        * would take the calendar off the site the moment this lands, which is
        * the one thing a migration must never do quietly.
        */
       'published', year
  FROM made;

INSERT INTO ctr.slugs (site_id, entity_type, slug, entity_id, is_current)
SELECT site_id, 'season', slug, id, true FROM made;

/* A dated round joins the season of its own year. */
UPDATE ctr.events e
   SET season_id = m.id
  FROM made m
 WHERE m.site_id = e.site_id
   AND m.year = extract(year FROM coalesce(e.date_from, e.date_to))::int;

/*
 * A round with no date joins its site's earliest season. It has to go
 * somewhere — the column is about to be NOT NULL — and the earliest is the one
 * a reader would look in for something not yet scheduled.
 */
UPDATE ctr.events e
   SET season_id = (
     SELECT s.id FROM ctr.seasons s
      WHERE s.site_id = e.site_id
      ORDER BY s.sort_order
      LIMIT 1
   )
 WHERE e.season_id IS NULL;

/*
 * A site with rounds but not one date between them has no season yet. One is
 * made, named for nothing in particular, because a name somebody has to correct
 * is better than a NOT NULL that cannot be satisfied.
 */
INSERT INTO ctr.seasons (site_id, name, status, sort_order)
SELECT DISTINCT e.site_id, 'Season', 'published', 0
  FROM ctr.events e
 WHERE e.season_id IS NULL;

INSERT INTO ctr.slugs (site_id, entity_type, slug, entity_id, is_current)
SELECT s.site_id, 'season', 'season', s.id, true
  FROM ctr.seasons s
 WHERE s.name = 'Season' AND s.sort_order = 0
   AND NOT EXISTS (
     SELECT 1 FROM ctr.slugs sl WHERE sl.entity_type = 'season' AND sl.entity_id = s.id
   );

UPDATE ctr.events e
   SET season_id = (
     SELECT s.id FROM ctr.seasons s WHERE s.site_id = e.site_id ORDER BY s.sort_order LIMIT 1
   )
 WHERE e.season_id IS NULL;

ALTER TABLE ctr.events ALTER COLUMN season_id SET NOT NULL;
CREATE INDEX events_season_idx ON ctr.events (season_id, sort_order);

/* ─────────────────────────────── Reconcile ──────────────────────────────── */

DO $$
DECLARE
  seasons int;
  rounds  int;
  undated int;
  clash   int;
BEGIN
  SELECT count(*) INTO seasons FROM ctr.seasons;
  SELECT count(*) INTO rounds  FROM ctr.events;

  RAISE NOTICE '% season(s) for % round(s).', seasons, rounds;

  SELECT count(*) INTO undated
    FROM ctr.events WHERE date_from IS NULL AND date_to IS NULL;

  IF undated > 0 THEN
    RAISE NOTICE '% round(s) have no date and joined their site''s earliest season. '
                 'Move them on the Rounds screen.', undated;
  END IF;

  /*
   * A season and a round of one site cannot share an address: both are served
   * by `/<sport>/calendar/<slug>`, and that route would have to pick one.
   */
  SELECT count(*) INTO clash
    FROM ctr.slugs a
    JOIN ctr.slugs b ON b.site_id = a.site_id AND b.slug = a.slug
   WHERE a.entity_type = 'season' AND b.entity_type = 'event';

  IF clash > 0 THEN
    RAISE EXCEPTION '% address(es) name both a season and a round. Nothing has been written.',
      clash;
  END IF;

  IF EXISTS (
    SELECT 1 FROM ctr.seasons s
     WHERE NOT EXISTS (SELECT 1 FROM ctr.slugs sl
                        WHERE sl.entity_type = 'season' AND sl.entity_id = s.id AND sl.is_current)
  ) THEN
    RAISE EXCEPTION 'A season came out without an address. Nothing has been written.';
  END IF;

  IF EXISTS (SELECT 1 FROM ctr.events e JOIN ctr.seasons s ON s.id = e.season_id
              WHERE s.site_id <> e.site_id) THEN
    RAISE EXCEPTION 'A round joined another sport''s season. Nothing has been written.';
  END IF;
END $$;
