/**
 * Writes the team's past seasons into the database.
 *
 *   npm run db:import-history              # write
 *   npm run db:import-history -- --dry-run # say what it would write, write nothing
 *
 * Reads scripts/seed-data/history.json, which was transcribed from the team's
 * own spreadsheet (CTR copy.xlsx). For every league in it, and every season of
 * that league, it makes sure there is:
 *
 *   a row in ctr.championships       matched on slug
 *   a row in ctr.seasons             matched on (championship, year)
 *   its rounds in ctr.events         matched on (season, round number)
 *   its lineup in ctr.season_drivers replaced wholesale from the file
 *
 * and then brings each linked driver's profile in line with the file: their
 * nationality and flag, and the league they last raced in for the team.
 *
 * ── Safe to run twice ─────────────────────────────────────────────────────
 *
 * Nothing is matched by position or inserted blindly. A season that exists is
 * updated, a round that exists is left alone (somebody may have edited it in the
 * console since), and only rounds the season does not have yet are added. The
 * lineup is the one thing replaced, because the file is the record of it.
 *
 * Seasons the file does not mention — the current one, which the console made —
 * are not touched.
 *
 * ── Why plain SQL and not the repos ───────────────────────────────────────
 *
 * The repos import `server-only`, which refuses to load outside a Next server.
 * The slug rows are written the way slugsRepo.writeSlugs writes them.
 */

import { readFileSync } from "node:fs";
import { neonConfig, Pool } from "@neondatabase/serverless";

const DRY = process.argv.includes("--dry-run");
const FILE = "scripts/seed-data/history.json";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Make sure .env exists in the project root.");
  process.exit(1);
}
neonConfig.webSocketConstructor = globalThis.WebSocket;

/** The countries in the file, by the name the file uses. */
const COUNTRIES = {
  India: "IN",
  "United Kingdom": "GB",
  Canada: "CA",
  Australia: "AU",
  "South Africa": "ZA",
  Spain: "ES",
  Kenya: "KE",
  Singapore: "SG",
};

/** "IN" → 🇮🇳. Regional indicator letters, which is all a flag emoji is. */
function flag(code) {
  return [...code.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join("");
}

const pad = (n) => String(n).padStart(2, "0");
const key = (name) => name.toLowerCase().replace(/[^a-z]/g, "");

function championText(c) {
  if (!c?.name) return "";
  const bits = [
    c.wins != null && `${c.wins} wins`,
    c.podiums != null && `${c.podiums} podiums`,
    c.points != null && `${c.points} points`,
  ].filter(Boolean);
  return bits.length ? `${c.name} — ${bits.join(", ")}` : c.name;
}

const data = JSON.parse(readFileSync(FILE, "utf8"));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = await pool.connect();
const q = async (text, params = []) => (await db.query(text, params)).rows;

const log = [];
const say = (line) => log.push(line);

try {
  await db.query("BEGIN");

  const [site] = await q(`SELECT id FROM ctr.sites WHERE kind = 'root' ORDER BY sort_order LIMIT 1`);
  if (!site) throw new Error("No root site. Run npm run db:migrate first.");

  const tracks = new Map((await q(`SELECT id, slug FROM ctr.tracks WHERE site_id = $1`, [site.id])).map((t) => [t.slug, t.id]));
  const drivers = await q(`SELECT id, first_name, last_name FROM ctr.drivers WHERE site_id = $1`, [site.id]);
  const driverByName = new Map(drivers.map((d) => [key(`${d.first_name}${d.last_name}`), d.id]));

  /** driver_id → what the newest season they appear in says about them. */
  const latest = new Map();

  for (const [ci, champ] of data.championships.entries()) {
    const short = champ.slug === "indian-racing-league" ? "IRL" : champ.slug === "indian-f4-championship" ? "F4" : "";

    let [row] = await q(`SELECT id FROM ctr.championships WHERE site_id = $1 AND slug = $2`, [site.id, champ.slug]);
    if (!row) {
      [row] = await q(
        `INSERT INTO ctr.championships (site_id, slug, name, short_name, sort_order)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [site.id, champ.slug, champ.name, short, (ci + 1) * 10]
      );
      say(`+ league   ${champ.name}`);
    }
    const championshipId = row.id;

    for (const season of champ.seasons) {
      const team = season.team_result ?? {};
      const fields = [
        season.car ?? "",
        team.position ?? null,
        team.position_label ?? "",
        team.points ?? null,
        championText(season.champion),
      ];

      let [s] = await q(`SELECT id FROM ctr.seasons WHERE championship_id = $1 AND year = $2`, [championshipId, season.year]);
      if (s) {
        await q(
          `UPDATE ctr.seasons SET car = $2, team_position = $3, team_result = $4, team_points = $5,
                  champion = $6, updated_at = now() WHERE id = $1`,
          [s.id, ...fields]
        );
        say(`~ season   ${season.year} ${short} (updated)`);
      } else {
        [s] = await q(
          `INSERT INTO ctr.seasons (site_id, name, status, sort_order, championship_id, year,
                                    car, team_position, team_result, team_points, champion)
           VALUES ($1, $2, 'published', $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [site.id, `${season.year} ${champ.name}`, season.year, championshipId, season.year, ...fields]
        );
        await q(
          `INSERT INTO ctr.slugs (site_id, entity_type, slug, entity_id, is_current)
           VALUES ($1, 'season', $2, $3, true)`,
          [site.id, `${champ.slug}-${season.year}`, s.id]
        );
        say(`+ season   ${season.year} ${champ.name}`);
      }

      /* Rounds: add the missing ones, leave the rest. */
      const have = new Set((await q(`SELECT round FROM ctr.events WHERE season_id = $1`, [s.id])).map((r) => Number(r.round)));
      for (const r of season.rounds) {
        if (have.has(r.round)) continue;
        const [e] = await q(
          `INSERT INTO ctr.events (site_id, season_id, round, venue, track_id, date_from, date_to,
                                   status, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'published', $8) RETURNING id`,
          [site.id, s.id, pad(r.round), r.venue, r.track_slug ? tracks.get(r.track_slug) ?? null : null, r.date_from, r.date_to, r.round * 10]
        );
        await q(
          `INSERT INTO ctr.slugs (site_id, entity_type, slug, entity_id, is_current)
           VALUES ($1, 'event', $2, $3, true)`,
          [site.id, `${short.toLowerCase() || champ.slug}-${season.year}-round-${pad(r.round)}`, e.id]
        );
        say(`  + round  ${pad(r.round)} ${r.date_from} ${r.venue}`);
      }

      /* Lineup: the file is the record of it, so it replaces what is there. */
      await q(`DELETE FROM ctr.season_drivers WHERE season_id = $1`, [s.id]);
      for (const [i, d] of season.drivers.entries()) {
        const driverId = driverByName.get(key(d.name)) ?? null;
        await q(
          `INSERT INTO ctr.season_drivers (season_id, driver_id, name, nationality, points, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [s.id, driverId, d.name, d.nationality, d.points ?? null, (i + 1) * 10]
        );
        if (driverId) {
          const prior = latest.get(driverId);
          if (!prior || prior.year <= season.year) latest.set(driverId, { year: season.year, nationality: d.nationality, short, name: d.name });
        }
      }
      say(`  = lineup ${season.drivers.map((d) => d.name + (driverByName.has(key(d.name)) ? "*" : "")).join(", ")}`);
    }
  }

  /* Profiles of the drivers the file links to. */
  for (const [id, d] of latest) {
    const code = COUNTRIES[d.nationality] ?? "";
    await q(
      `UPDATE ctr.drivers SET nationality = $2, country_code = $3, flag_emoji = $4,
              championship = $5, updated_at = now() WHERE id = $1`,
      [id, d.nationality, code, code ? flag(code) : "", d.short]
    );
    say(`~ driver   ${d.name}: ${d.nationality} ${code ? flag(code) : ""}, ${d.short}`);
  }

  if (DRY) {
    await db.query("ROLLBACK");
    say("\nDry run: rolled back, nothing written.");
  } else {
    await db.query("COMMIT");
  }
  console.log(log.join("\n"));
  console.log("\n* = linked to a driver profile");
} catch (error) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(log.join("\n"));
  console.error("\nImport failed, nothing written:", error.message);
  process.exitCode = 1;
} finally {
  db.release();
  await pool.end();
}
