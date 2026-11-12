import { notFound } from "next/navigation";
import { SITE } from "@/config/site";
import { isSeasonId } from "@/lib/seasons";
import { requireSite } from "@/lib/server/access";
import { listEventsOfSeason } from "@/lib/server/eventsRepo";
import { getSeason } from "@/lib/server/seasonsRepo";
import { listTracks } from "@/lib/server/tracksRepo";
import { EventsEditor } from "@/admin/screens/events/EventsEditor";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ sport: string }>;
  searchParams: Promise<{ season?: string }>;
};

/**
 * One season's rounds. Reached from the Seasons screen, which says which season.
 *
 * A season of another site, or no season at all, is a 404 — the same answer a
 * season that does not exist gets, so the screen cannot be used to probe ids.
 */
export default async function SeasonRoundsPage({ params, searchParams }: Props) {
  const [{ sport }, { season: seasonId }] = await Promise.all([params, searchParams]);
  const { site } = await requireSite(sport, "events");

  if (!isSeasonId(seasonId)) notFound();
  const season = await getSeason(seasonId);
  if (!season || season.site_id !== site.id) notFound();

  const [events, tracks] = await Promise.all([listEventsOfSeason(season.id), listTracks(site.id)]);

  /*
   * The public origin, handed down rather than imported by the editor. The admin
   * answers on its own hostname, so a relative link from an admin screen would
   * resolve against the ADMIN host, where the public routes do not exist.
   * SITE.url is built from an environment variable that is not NEXT_PUBLIC, so
   * it is only readable on the server.
   */
  return (
    <EventsEditor
      // Remounts on a season switch, so one season's unsaved round never
      // carries over into the next.
      key={season.id}
      season={{ id: season.id, name: season.name }}
      initialEvents={events}
      tracks={tracks}
      siteUrl={`${SITE.url}${site.kind === "root" ? "" : `/${site.slug}`}`}
    />
  );
}
