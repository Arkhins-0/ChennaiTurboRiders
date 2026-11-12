import { guardRequestSite } from "@/lib/server/access";
import { listEvents } from "@/lib/server/eventsRepo";
import { listSeasons } from "@/lib/server/seasonsRepo";
import { listTracks } from "@/lib/server/tracksRepo";
import { csvResponse, exportFailed, stamp, toCsv } from "@/lib/server/exports";
import { EVENT_STATUS_LABELS } from "@/lib/events";
import { eventDateLabel } from "@/lib/raceDates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every round of every season, drafts included, newest season first and in
 * running order within one — the order the Seasons screen lists them.
 */
export async function GET(request: Request) {
  const guard = await guardRequestSite(request, "events");
  if (guard.denied) return guard.denied;

  try {
    const [events, seasons, tracks] = await Promise.all([
      listEvents(guard.site.id),
      listSeasons(guard.site.id),
      listTracks(guard.site.id),
    ]);
    const seasonName = new Map(seasons.map((season) => [season.id, season.name]));
    const trackName = new Map(tracks.map((track) => [track.id, track.name]));

    const csv = toCsv(
      ["Season", "Round", "Name", "Venue", "City", "From", "To", "Dates", "Circuit", "Status"],
      events.map((event) => [
        seasonName.get(event.season_id) ?? "",
        event.round,
        event.title,
        event.venue,
        event.city,
        event.date_from,
        event.date_to || event.date_from,
        eventDateLabel(event),
        trackName.get(event.track_id) ?? "",
        EVENT_STATUS_LABELS[event.status] ?? event.status,
      ])
    );
    return csvResponse(`ctr-rounds-${stamp()}.csv`, csv);
  } catch (error) {
    return exportFailed("rounds", error);
  }
}
