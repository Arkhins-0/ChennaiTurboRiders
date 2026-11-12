import { NextResponse } from "next/server";
import { guardRequestSite } from "@/lib/server/access";
import { getSql } from "@/lib/server/db";
import { csvResponse, exportFailed, isMissingRelation, stamp, toCsv } from "@/lib/server/exports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  championship: string | null;
  year: number | null;
  season: string;
  team_result: string | null;
  team_points: string | number | null;
  driver: string;
  nationality: string;
  points: string | number | null;
};

/** `numeric` arrives as a string from the driver; a spreadsheet wants the number. */
function number(value: string | number | null): number | null {
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The team's history: one row per driver per season — the league, the year,
 * the season, where the team finished and on how many points, and the
 * driver's own points. Read straight from the tables migration 0026 adds;
 * until that migration has run this answers 503 rather than a 500.
 */
export async function GET(request: Request) {
  const guard = await guardRequestSite(request, "events");
  if (guard.denied) return guard.denied;

  let rows: Row[];
  try {
    const sql = getSql();
    rows = (await sql.query(
      `SELECT c.name AS championship, s.year, s.name AS season, s.team_result, s.team_points,
              d.name AS driver, d.nationality, d.points
         FROM ctr.season_drivers d
         JOIN ctr.seasons s ON s.id = d.season_id
         LEFT JOIN ctr.championships c ON c.id = s.championship_id
        WHERE s.site_id = $1
        ORDER BY s.year DESC NULLS LAST, s.sort_order DESC, c.sort_order ASC NULLS LAST,
                 s.name ASC, d.sort_order ASC, d.name ASC`,
      [guard.site.id]
    )) as Row[];
  } catch (error) {
    if (isMissingRelation(error)) {
      return NextResponse.json(
        { error: "The team history tables are not in the database yet. Run the pending migration, then try again." },
        { status: 503 }
      );
    }
    return exportFailed("history", error);
  }

  const csv = toCsv(
    ["Championship", "Year", "Season", "Team result", "Team points", "Driver", "Nationality", "Driver points"],
    rows.map((row) => [
      row.championship ?? "",
      row.year,
      row.season,
      row.team_result ?? "",
      number(row.team_points),
      row.driver,
      row.nationality,
      number(row.points),
    ])
  );
  return csvResponse(`ctr-history-${stamp()}.csv`, csv);
}
