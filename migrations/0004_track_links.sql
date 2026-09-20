-- 0004 · a circuit gets an address, and its links become rows
--
-- ── The slug ──────────────────────────────────────────────────────────────
--
-- A circuit is currently found by loading EVERY row and `.find()`-ing over them
-- in JavaScript (`findTrackBySlug`, src/lib/tracks.ts), because the slug only
-- ever existed as a function of the name — `trackSlug()` — and never as a
-- column. Three circuits, so it has never mattered; it is still a full table
-- scan per request on a page that is otherwise one indexed lookup.
--
-- The slug is derived here exactly as `trackSlug` derives it — lower case,
-- anything that is not a letter or a digit becomes a hyphen, hyphens trimmed
-- from the ends — with the id as the fallback for a name that produces no
-- letters at all. The one difference is accents: `trackSlug` decomposes with
-- NFKD first, and this does not, because the `unaccent` extension is not
-- installed and no circuit has an accent in its name. The migration checks that
-- what it produced is unique and non-empty rather than trusting it, and phase 4
-- writes new slugs from `trackSlug` itself, so the divergence cannot spread.
--
-- ── The links ─────────────────────────────────────────────────────────────
--
-- `tracks.links` is the one JSONB column in this database with NO read-side
-- normaliser: `listTracks` returns a bare `as Track[]` cast while every other
-- repo hydrates what it read. So the shapes in there are whatever was written by
-- whatever wrote them, and this migration must tolerate that rather than assume
-- `{label, href}` — which is why it reads a bare string as a URL with no label,
-- and drops anything with nothing usable in it.
--
-- ── `website` ─────────────────────────────────────────────────────────────
--
-- Dropped here, and it is the one drop this phase makes. It is not half of an
-- expand-and-contract pair: it was migrated into `links` long ago by a backfill
-- that 0001 still carries, the `Track` type does not have it, and
-- `tracksRepo.listTracks` does not select it. Nothing reads it, so nothing
-- breaks — which is exactly what the conductor's delta says.

ALTER TABLE ctr.tracks ADD COLUMN slug text;

UPDATE ctr.tracks
   SET slug = coalesce(
         nullif(btrim(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '-'), ''),
         id::text
       );

/*
 * NULLABLE, deliberately, and only until 0008.
 *
 * This phase expands and does not contract, which means the OLD `createTrack`
 * is still the one running until phase 4 deploys — and it does not know this
 * column exists. `NOT NULL` here would make adding a circuit through the admin
 * fail with a constraint violation the moment this migration lands, which is
 * precisely the breakage expanding first is meant to avoid.
 *
 * A unique index permits any number of NULLs, so a circuit added in that window
 * simply has no slug yet. 0008 fills those in and adds the NOT NULL, in the same
 * transaction as the repo cutover.
 */
ALTER TABLE ctr.tracks ADD CONSTRAINT tracks_slug_not_blank CHECK (slug <> '');
CREATE UNIQUE INDEX tracks_slug_idx ON ctr.tracks (slug);

ALTER TABLE ctr.tracks DROP COLUMN website;

CREATE TABLE ctr.track_links (
  track_id uuid NOT NULL REFERENCES ctr.tracks(id) ON DELETE CASCADE,
  position integer NOT NULL,
  label    text NOT NULL DEFAULT '',
  href     text NOT NULL,

  PRIMARY KEY (track_id, position),
  CONSTRAINT track_links_position_check CHECK (position >= 1),
  CONSTRAINT track_links_href_not_blank CHECK (href <> '')
);

INSERT INTO ctr.track_links (track_id, position, label, href)
SELECT track_id,
       (row_number() OVER (PARTITION BY track_id ORDER BY ordinality))::int,
       label,
       href
  FROM (
    SELECT t.id AS track_id,
           link.ordinality,
           CASE
             WHEN jsonb_typeof(link.value) = 'object' THEN btrim(coalesce(link.value->>'label', ''))
             ELSE ''
           END AS label,
           CASE
             -- The shape the writer produces.
             WHEN jsonb_typeof(link.value) = 'object' THEN btrim(coalesce(link.value->>'href', ''))
             -- A bare URL. Nothing normalised this column on read, so it is a
             -- shape that could be in there, and a link with no label is still
             -- a link.
             WHEN jsonb_typeof(link.value) = 'string' THEN btrim(link.value #>> '{}')
             ELSE ''
           END AS href
      FROM ctr.tracks t,
           jsonb_array_elements(t.links) WITH ORDINALITY AS link(value, ordinality)
  ) AS usable
 WHERE href <> '';

/*
 * The variables are named apart from the columns on purpose: a PL/pgSQL local
 * called `links` and a column called `links` in the same statement is "column
 * reference is ambiguous", and the block is where you would least expect to
 * spend an afternoon.
 */
DO $$
DECLARE
  distinct_slugs int;
  circuits       int;
  rows_landed    int;
  rows_held      int;
BEGIN
  SELECT count(DISTINCT slug), count(*) INTO distinct_slugs, circuits FROM ctr.tracks;

  -- Every circuit that exists right now must have got one. A NULL here means the
  -- derivation produced nothing from a name AND the id fallback failed, which
  -- cannot happen — so it is worth saying rather than assuming.
  IF distinct_slugs <> circuits THEN
    RAISE EXCEPTION 'Circuit slugs are not unique or complete: % slug(s) for % circuit(s).',
      distinct_slugs, circuits;
  END IF;

  SELECT coalesce(sum(jsonb_array_length(t.links)), 0) INTO rows_held FROM ctr.tracks t;
  SELECT count(*) INTO rows_landed FROM ctr.track_links;

  RAISE NOTICE 'circuits: % slug(s) minted. links: % in the documents, % as rows.',
    circuits, rows_held, rows_landed;
END $$;
