import { requireSite } from "@/lib/server/access";
import { listDrivers } from "@/lib/server/driversRepo";
import { listEvents } from "@/lib/server/eventsRepo";
import { listChampionships, listLineup, listSeasons } from "@/lib/server/seasonsRepo";
import { SeasonsEditor } from "@/admin/screens/events/SeasonsEditor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sport: string }> };

/**
 * Every season the team has raced or is about to — the league, the lineup, the
 * result, and the rounds, which open in their own editor.
 */
export default async function SeasonsAdminPage({ params }: Props) {
  const { sport } = await params;
  const { site } = await requireSite(sport, "events");

  const [seasons, championships, events, drivers] = await Promise.all([
    listSeasons(site.id),
    listChampionships(site.id),
    listEvents(site.id),
    listDrivers(site.id),
  ]);

  const lineups = await Promise.all(seasons.map((season) => listLineup(season.id)));

  return (
    <SeasonsEditor
      initialSeasons={seasons.map((season, i) => ({ ...season, lineup: lineups[i] }))}
      initialChampionships={championships}
      rounds={events.map((e) => ({
        id: e.id,
        season_id: e.season_id,
        round: e.round,
        venue: e.venue,
        date_from: e.date_from,
        date_to: e.date_to,
        dates: e.dates,
        status: e.status,
      }))}
      roster={drivers.map((d) => ({
        id: d.id,
        name: [d.firstName, d.lastName].filter(Boolean).join(" "),
        nationality: d.nationality,
      }))}
    />
  );
}
