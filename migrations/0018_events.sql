-- 0018 · a round of the season becomes a thing with an address
--
-- `ctr.calendar_rounds` has been a POSITION IN A LIST since 0006: primary key
-- (page_key, position), then (section_id, position) after 0015, deleted and
-- re-inserted wholesale on every save of the page it sat on. Three things follow
-- from that and all three are why this migration exists.
--
--   Nothing can link to a round. There is no address, so the calendar's cards
--   point at the CIRCUIT — which is a place, not a weekend, and says nothing
--   about who is racing or what happened.
--
--   Nothing can point a foreign key at one. A registration form for round three
--   cannot say so; the entries screen cannot know which weekend it is taking
--   entries for.
--
--   A round cannot carry anything of its own. No report, no photograph, no
--   result — because a row that is rewritten on every page save has nowhere to
--   keep them.
--
-- After this an event is a row like a deck, an article or a form: its own id,
-- its own address in `ctr.slugs`, a draft/published status, a rich-text body and
-- a cover. It is served at `/<sport>/calendar/<slug>`.
--
-- ── What the calendar SECTION keeps ───────────────────────────────────────
--
-- Its heading and its seven words — what a round is called, what the next one is
-- called, what sits over the clock. Those are editorial and belong to the band.
-- WHICH events it draws stops being stored at all: it shows this site's
-- published events, in their own order, exactly as the `registrations` section
-- already shows this site's published forms. Every event of a sport belongs on
-- that sport's calendar, so there was never an editorial choice to record — and
-- the section stops being `multiple`, because two bands reading the same list
-- would be the same band twice.
--
-- ── Why `status` became two columns ───────────────────────────────────────
--
-- `calendar_rounds.status` held a free-text chip: "Entries open", "Provisional".
-- Every other table in this schema uses `status` for draft/published, and an
-- event needs that too — so the chip is `badge`, named for what it is rather
-- than for what it was called when it was the only one. Reading a row where
-- `status = 'published'` and `badge = 'Entries open'` leaves nothing to guess.
--
-- ── The addresses ─────────────────────────────────────────────────────────
--
-- Minted here, because a round has never had one. `round-01` for a round with a
-- number, the venue's name for one without, and `event-<n>` for a round with
-- neither — then de-duplicated within the site, which is the grain `ctr.slugs`
-- is keyed at.

/* ──────────────────────────── The table ─────────────────────────────────── */

CREATE TABLE ctr.events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid NOT NULL REFERENCES ctr.sites(id) ON DELETE CASCADE,

  /*
   * What the card prints over the photograph — "01". Text, not an integer: a
   * season can have a round "6A" or a non-championship meeting with none at all,
   * and the leading zero is part of how it is written.
   */
  round        text NOT NULL DEFAULT '',

  /*
   * The event's own name, and blank is the useful default.
   *
   * The calendar has always headed a card with the circuit's name, and that is
   * right for a championship round: the weekend IS Kari. A blank title keeps
   * exactly that and lets an event that is something else — a launch, a test, a
   * one-off — say so.
   */
  title        text NOT NULL DEFAULT '',
  subtitle     text NOT NULL DEFAULT '',

  /* The fallback when no circuit is named. Same job they did on the round. */
  venue        text NOT NULL DEFAULT '',
  city         text NOT NULL DEFAULT '',

  /*
   * The circuit, and the entry form.
   *
   * Both SET NULL rather than CASCADE: deleting a circuit must not delete the
   * weekend that was going to be held at it. The card already falls back to the
   * venue text, and an event with no form simply has no entry button — which is
   * the honest rendering of a form that has been taken down.
   */
  track_id     uuid REFERENCES ctr.tracks(id) ON DELETE SET NULL,
  form_id      uuid REFERENCES ctr.forms(id)  ON DELETE SET NULL,

  /*
   * Two ways of saying when, as the round had. `date_from`/`date_to` are real
   * dates and are what the countdown counts to and what decides which event is
   * next; `dates` overrides the printed line for a weekend the dates cannot
   * express ("Provisional, October").
   */
  date_from    date,
  date_to      date,
  dates        text NOT NULL DEFAULT '',

  /* The free-text chip. Was `calendar_rounds.status`; see the note above. */
  badge        text NOT NULL DEFAULT '',

  /* Draft or published, and nothing between — an article's reading, not a form's. */
  status       text NOT NULL DEFAULT 'draft',

  cover_image  text NOT NULL DEFAULT '',

  /*
   * The report, as a ProseMirror document — the same column an article has, for
   * the reasons 0010 sets out at length: a tree of typed nodes has no markup to
   * sanitise, and an image key sits in it as plain text where the media usage
   * scan can already find it.
   */
  body         jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,

  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT events_status_check CHECK (status IN ('draft', 'published'))
);

/* The two reads there are: one sport's season, and one sport's published season. */
CREATE INDEX events_site_idx      ON ctr.events (site_id, sort_order);
CREATE INDEX events_published_idx ON ctr.events (site_id, status, sort_order);
CREATE INDEX events_track_idx     ON ctr.events (track_id);
CREATE INDEX events_form_idx      ON ctr.events (form_id);

/* ─────────────────── ctr.slugs learns about a fourth kind ───────────────── */

ALTER TABLE ctr.slugs DROP CONSTRAINT slugs_entity_type_check;
ALTER TABLE ctr.slugs ADD  CONSTRAINT slugs_entity_type_check
  CHECK (entity_type IN ('deck', 'form', 'article', 'event'));

/*
 * And the trigger that cleans them up. ctr.slugs cannot carry a foreign key —
 * its entity_id points at one of four tables now, depending on entity_type — so
 * the DELETE half of what a foreign key would do is a trigger. Without it,
 * deleting an event leaves its addresses behind to block the next thing that
 * wants one. The function is the one 0002 defined.
 */
CREATE TRIGGER events_forget_slugs AFTER DELETE ON ctr.events
  FOR EACH ROW EXECUTE FUNCTION ctr.forget_slugs('event');

/* ─────────────────────────── The rounds move ────────────────────────────── */

/*
 * An address for a round that has never had one.
 *
 * Mirrors `slugify` in src/lib/slug.ts as far as it needs to: lower case,
 * everything that is not a letter or a digit becomes a hyphen, no hyphen at
 * either end, and 80 characters (SLUG_MAX). It does NOT strip accents, because
 * the only input it is ever given is this database's four rounds, and inventing
 * a Postgres unaccent dependency for that would be a heavier thing than the
 * problem.
 */
CREATE FUNCTION ctr.event_slug(round text, venue text, n int) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE base text;
BEGIN
  base := btrim(coalesce(round, ''));
  IF base <> '' THEN
    base := 'round-' || base;
  ELSE
    base := btrim(coalesce(venue, ''));
  END IF;

  base := btrim(regexp_replace(lower(base), '[^a-z0-9]+', '-', 'g'), '-');
  IF base = '' THEN base := 'event-' || n::text; END IF;

  RETURN left(base, 80);
END $$;

/*
 * Every round, in the order its section listed it, with the site it belongs to
 * resolved through the section and the page above it.
 *
 * `sort_order` is spaced by ten, which is what `reorderEvents` will write and
 * what every other ordered table here uses. A page carrying two calendars would
 * interleave, which is why `row_number()` is over the SITE rather than over the
 * section — the list is the sport's season now, not one band's.
 */
CREATE TEMP TABLE moving ON COMMIT DROP AS
SELECT r.section_id,
       r."position",
       pg.site_id,
       r.round, r.venue, r.city, r.date_from, r.date_to, r.dates,
       r.status AS badge,
       r.track_id,
       row_number() OVER (PARTITION BY pg.site_id ORDER BY ps."position", r."position") AS n
  FROM ctr.calendar_rounds r
  JOIN ctr.page_sections ps ON ps.id = r.section_id
  JOIN ctr.pages pg ON pg.id = ps.page_id;

/*
 * The address and the id, decided before anything is written.
 *
 * The id is minted here rather than by the table's default so that the event and
 * its address can be inserted from the same rows without matching them back up
 * afterwards — the trick 0015 used for section ids, and for the same reason:
 * a join on some other column would be a second chance to pair the wrong two.
 *
 * The slug is de-duplicated within the site, because `ctr.slugs` is keyed on
 * (site_id, entity_type, slug) and two rounds at one circuit with no number
 * would both want the same one. The second gets `-2`, which is the suffix loop
 * `createDeck` and `createArticle` already run.
 */
CREATE TEMP TABLE addressed ON COMMIT DROP AS
WITH based AS (
  SELECT m.*, ctr.event_slug(m.round, m.venue, m.n::int) AS base FROM moving m
), numbered AS (
  SELECT b.*, row_number() OVER (PARTITION BY b.site_id, b.base ORDER BY b.n) AS seq
    FROM based b
)
SELECT gen_random_uuid() AS id,
       n.*,
       CASE WHEN n.seq = 1 THEN n.base ELSE n.base || '-' || n.seq::text END AS slug
  FROM numbered n;

INSERT INTO ctr.events (id, site_id, round, venue, city, track_id,
                        date_from, date_to, dates, badge, status, sort_order)
SELECT id, site_id, round, venue, city,
       /*
        * A circuit belonging to another sport is dropped rather than carried.
        *
        * There are none — every circuit and every round on this database is
        * INCRC's — but the foreign key does not say so, and an event whose
        * circuit is not in its own site's list would render as a card whose
        * photograph and map silently never appear. NULL is the state the card
        * already handles: it falls back to the venue and city beside it.
        */
       CASE WHEN track_id IS NULL THEN NULL
            WHEN EXISTS (SELECT 1 FROM ctr.tracks t
                          WHERE t.id = addressed.track_id AND t.site_id = addressed.site_id)
            THEN track_id ELSE NULL END,
       date_from, date_to, dates, badge,
       /*
        * Published, every one of them.
        *
        * They are on the live site today. Migrating them to `draft` would take
        * the calendar off /incrc the moment this lands, which is the one thing a
        * migration must never do quietly.
        */
       'published',
       (n * 10)::int
  FROM addressed
 ORDER BY site_id, n;

INSERT INTO ctr.slugs (site_id, entity_type, slug, entity_id, is_current)
SELECT site_id, 'event', slug, id, true FROM addressed;

DROP FUNCTION ctr.event_slug(text, text, int);

/* ───────────────────── The list stops being a list ──────────────────────── */

/*
 * `calendar_rounds` goes, and with it the last of the promoted tables that was
 * not really a list of a section's own. `banners`, `posts` and `partners` stay —
 * a banner genuinely is a slide of one carousel and has no life away from it.
 */
DROP TABLE ctr.calendar_rounds;

/* ─────────────────────────────── Reconcile ──────────────────────────────── */

DO $$
DECLARE
  events   int;
  slugs    int;
  sites    int;
  bad      int;
BEGIN
  SELECT count(*) INTO events FROM ctr.events;
  SELECT count(*) INTO slugs  FROM ctr.slugs WHERE entity_type = 'event';
  SELECT count(DISTINCT site_id) INTO sites FROM ctr.events;

  RAISE NOTICE 'events: % across % site(s), with % address(es).', events, sites, slugs;

  /*
   * An event with no address is unreachable and cannot be given one from the
   * console either — the address box would find the row and the row would have
   * nothing to rename. Worth failing the transaction over.
   */
  IF events <> slugs THEN
    RAISE EXCEPTION 'Some events came out without an address. Nothing has been written.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM ctr.events e
     WHERE NOT EXISTS (SELECT 1 FROM ctr.slugs s
                        WHERE s.entity_type = 'event' AND s.entity_id = e.id AND s.is_current)
  ) THEN
    RAISE EXCEPTION 'An event has no current address. Nothing has been written.';
  END IF;

  /* A slug must belong to the same site as the event it names. */
  SELECT count(*) INTO bad
    FROM ctr.slugs s JOIN ctr.events e ON e.id = s.entity_id
   WHERE s.entity_type = 'event' AND s.site_id <> e.site_id;

  IF bad > 0 THEN
    RAISE EXCEPTION 'An event address was filed under the wrong site. Nothing has been written.';
  END IF;

  /*
   * Every circuit an event names belongs to that event's own sport. Guaranteed
   * by the CASE in the insert above rather than hoped for, so this is the check
   * that the CASE did what it says.
   */
  IF EXISTS (SELECT 1 FROM ctr.events e JOIN ctr.tracks t ON t.id = e.track_id
              WHERE t.site_id <> e.site_id) THEN
    RAISE EXCEPTION 'An event points at another sport''s circuit. Nothing has been written.';
  END IF;

  SELECT count(*) INTO bad FROM ctr.events WHERE track_id IS NULL AND venue = '';
  IF bad > 0 THEN
    RAISE NOTICE '% event(s) name neither a circuit nor a venue — their cards will be blank.', bad;
  END IF;
END $$;
