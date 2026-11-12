-- 0026 · the team's seasons: which league, who drove, how it finished
--
-- Chennai Turbo Riders does not run a championship. It enters other people's —
-- the Indian Racing League and the Indian F4 Championship so far — and what the
-- site needs to say about a season is the team's side of it: the league, the
-- car, the drivers it fielded, the rounds it raced and where the team finished.
-- Everybody else's results are the organiser's business and are not modelled.
--
-- ── Why these go on ctr.seasons rather than a history table of their own ───
--
-- A season that has finished and a season that has not yet started are the same
-- thing at different times. ctr.seasons already holds the one being raced, its
-- rounds are ctr.events, and /schedule already picks "the season that is now"
-- from them (currentSeason in src/lib/seasons.ts). Putting the past in a
-- parallel table would mean entering every future round twice — once on the
-- calendar, and again in the history when it is over — and the two would
-- disagree the first time somebody forgot.
--
-- So the history IS the seasons: add the league and the team's result to the
-- row, add the lineup beside it, and a season moves from /schedule to /history
-- on its own once its last round has been run.
--
-- Everything here is additive. No existing column changes and no existing row
-- is touched; the import (scripts/import-history.mjs) writes the data.

/* ───────────────────────────── The leagues ──────────────────────────────── */

CREATE TABLE ctr.championships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid NOT NULL REFERENCES ctr.sites(id) ON DELETE CASCADE,

  slug        text NOT NULL,
  /* "Indian Racing League". */
  name        text NOT NULL DEFAULT '',
  /* "IRL" — what a chip or a table column has room for. */
  short_name  text NOT NULL DEFAULT '',
  website     text NOT NULL DEFAULT '',

  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT championships_slug_unique UNIQUE (site_id, slug)
);

/* ──────────────────────── The team's side of a season ───────────────────── */

ALTER TABLE ctr.seasons
  /* SET NULL: deleting a league leaves its seasons, unfiled, rather than
     taking years of results with it. */
  ADD COLUMN championship_id uuid REFERENCES ctr.championships(id) ON DELETE SET NULL,
  /* The year it is filed under. A season can run into the next calendar year
     (IRL 2025's last round was in February 2026), so this is not derived. */
  ADD COLUMN year            integer,
  ADD COLUMN car             text NOT NULL DEFAULT '',
  /* Where the team finished. Both: the number sorts, the words are what the
     page says ("Runner-up", "4th"). Null and '' while the season is running. */
  ADD COLUMN team_position   integer,
  ADD COLUMN team_result     text NOT NULL DEFAULT '',
  ADD COLUMN team_points     numeric,
  /* A title one of our drivers won: "Cooper Webster — 7 wins, 9 podiums, 282.5 points". */
  ADD COLUMN champion        text NOT NULL DEFAULT '',
  ADD COLUMN notes           text NOT NULL DEFAULT '',
  ADD CONSTRAINT seasons_year_check CHECK (year IS NULL OR year BETWEEN 1950 AND 2200),
  ADD CONSTRAINT seasons_team_position_check CHECK (team_position IS NULL OR team_position > 0);

CREATE INDEX seasons_championship_idx ON ctr.seasons (championship_id, year);

/* ─────────────────────────────── The lineup ────────────────────────────── */

/*
 * Who drove for the team that season.
 *
 * `driver_id` links a row to a profile on /drivers when there is one, and is
 * NULL for the drivers who raced for the team before the site had profiles.
 * The name and nationality are stored on the row either way: a driver who
 * leaves and has their profile deleted still drove in 2022, and the history
 * should not lose them — hence SET NULL, not CASCADE.
 */
CREATE TABLE ctr.season_drivers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id    uuid NOT NULL REFERENCES ctr.seasons(id) ON DELETE CASCADE,
  driver_id    uuid REFERENCES ctr.drivers(id) ON DELETE SET NULL,

  name         text NOT NULL DEFAULT '',
  nationality  text NOT NULL DEFAULT '',
  /* Their points for the team that season. Null when not recorded. */
  points       numeric,

  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX season_drivers_season_idx ON ctr.season_drivers (season_id, sort_order);
CREATE INDEX season_drivers_driver_idx ON ctr.season_drivers (driver_id);
