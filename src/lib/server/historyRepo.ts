import "server-only";

import { cache } from "react";
import { positionLabel } from "@/lib/seasons";
import { eventEnd } from "@/lib/raceDates";
import { getSql } from "@/lib/server/db";

/**
 * The team's record, as the public site reads it: every published season that
 * is filed under a year, newest first, with its league, lineup and rounds.
 *
 * These are the same rows /schedule draws (see migration 0026). A season is
 * "finished" once it has a result or its last round is behind us; the page puts
 * the one still being raced at the top and links it to the calendar.
 */

export type HistoryDriver = {
  name: string;
  nationality: string;
  points: number | null;
  /** The profile at /drivers/<slug>, when the row is linked to one. */
  slug: string | null;
};

export type HistoryRound = {
  round: string;
  venue: string;
  date_from: string;
  date_to: string;
  dates: string;
};

export type HistorySeason = {
  id: string;
  name: string;
  year: number;
  league: { name: string; short_name: string; slug: string } | null;
  car: string;
  team_position: number | null;
  /** What the page says: the typed words, or the position spelled out. */
  result: string;
  team_points: number | null;
  champion: string;
  notes: string;
  drivers: HistoryDriver[];
  rounds: HistoryRound[];
  finished: boolean;
};

type SeasonRow = {
  id: string;
  name: string;
  year: number;
  car: string;
  team_position: number | null;
  team_result: string;
  team_points: number | null;
  champion: string;
  notes: string;
  league_name: string | null;
  league_short: string | null;
  league_slug: string | null;
};

const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : typeof value === "string" ? value.slice(0, 10) : "";

export const listTeamHistory = cache(async (siteId: string, now: Date = new Date()): Promise<HistorySeason[]> => {
  const sql = getSql();

  const [seasons, drivers, rounds] = (await Promise.all([
    sql`
      SELECT n.id, n.name, n.year, n.car, n.team_position, n.team_result,
             n.team_points::float8 AS team_points, n.champion, n.notes,
             c.name AS league_name, c.short_name AS league_short, c.slug AS league_slug
        FROM ctr.seasons n
        LEFT JOIN ctr.championships c ON c.id = n.championship_id
       WHERE n.site_id = ${siteId} AND n.status = 'published' AND n.year IS NOT NULL
       ORDER BY n.year DESC, c.sort_order NULLS LAST, n.name
    `,
    sql`
      SELECT sd.season_id, sd.name, sd.nationality, sd.points::float8 AS points, d.slug
        FROM ctr.season_drivers sd
        JOIN ctr.seasons n ON n.id = sd.season_id AND n.site_id = ${siteId}
        LEFT JOIN ctr.drivers d ON d.id = sd.driver_id
       ORDER BY sd.sort_order, sd.created_at
    `,
    sql`
      SELECT e.season_id, e.round, e.venue, e.date_from::text AS date_from, e.date_to::text AS date_to, e.dates
        FROM ctr.events e
       WHERE e.site_id = ${siteId} AND e.status = 'published'
       ORDER BY e.sort_order, e.date_from NULLS LAST
    `,
  ])) as [SeasonRow[], (HistoryDriver & { season_id: string })[], Record<string, unknown>[]];

  return seasons.map((s) => {
    const own = rounds
      .filter((r) => r.season_id === s.id)
      .map((r) => ({
        round: String(r.round ?? ""),
        venue: String(r.venue ?? ""),
        date_from: iso(r.date_from),
        date_to: iso(r.date_to),
        dates: String(r.dates ?? ""),
      }));

    const ends = own.map((r) => eventEnd(r)?.getTime() ?? 0);
    const result = s.team_result || positionLabel(s.team_position);
    const finished = Boolean(result) || (own.length > 0 && ends.every((end) => end > 0 && end < now.getTime()));

    return {
      id: s.id,
      name: s.name,
      year: s.year,
      league: s.league_name ? { name: s.league_name, short_name: s.league_short ?? "", slug: s.league_slug ?? "" } : null,
      car: s.car,
      team_position: s.team_position,
      result,
      team_points: s.team_points,
      champion: s.champion,
      notes: s.notes,
      drivers: drivers
        .filter((d) => d.season_id === s.id)
        .map(({ name, nationality, points, slug }) => ({ name, nationality, points, slug: slug ?? null })),
      rounds: own,
      finished,
    };
  });
});

/** The seasons one driver raced for the team, newest first. Their profile's record. */
export type DriverSeason = {
  year: number;
  season: string;
  league: string;
  points: number | null;
  result: string;
  /** They won the drivers' title that season. */
  champion: boolean;
};

export const listDriverSeasons = cache(async (driverId: string): Promise<DriverSeason[]> => {
  const sql = getSql();

  const rows = (await sql`
    SELECT n.year, n.name AS season, coalesce(c.name, '') AS league,
           sd.points::float8 AS points, n.team_result, n.team_position,
           (sd.name <> '' AND n.champion ILIKE sd.name || '%') AS champion
      FROM ctr.season_drivers sd
      JOIN ctr.seasons n ON n.id = sd.season_id AND n.status = 'published' AND n.year IS NOT NULL
      LEFT JOIN ctr.championships c ON c.id = n.championship_id
     WHERE sd.driver_id = ${driverId}
     ORDER BY n.year DESC, c.sort_order NULLS LAST
  `) as { year: number; season: string; league: string; points: number | null; team_result: string; team_position: number | null; champion: boolean }[];

  return rows.map((r) => ({
    year: r.year,
    season: r.season,
    league: r.league,
    points: r.points,
    result: r.team_result || positionLabel(r.team_position),
    champion: r.champion,
  }));
});
