import { NextResponse } from "next/server";
import { guardRequestSite } from "@/lib/server/access";
import { currentPublishedSeason, listPublishedSeasons } from "@/lib/server/seasonsRepo";
import { listPublishedEvents } from "@/lib/server/eventsRepo";
import { listTracks } from "@/lib/server/tracksRepo";
import { exportFailed, icsResponse, stamp, toIcs, type CalendarDay } from "@/lib/server/exports";
import { eventName, eventNumber, type EventSummary } from "@/lib/events";
import { eventEnd } from "@/lib/raceDates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The published rounds as an .ics file.
 *
 *   ?scope=current    the season a visitor is shown now (the default)
 *   ?scope=upcoming   every published round that has not finished, any season
 *
 * Published only — the same rounds /schedule shows — so the file never puts a
 * draft weekend in somebody's calendar.
 */
export async function GET(request: Request) {
  const guard = await guardRequestSite(request, "events");
  if (guard.denied) return guard.denied;

  const scope = new URL(request.url).searchParams.get("scope") === "upcoming" ? "upcoming" : "current";
  const now = new Date();

  try {
    const siteId = guard.site.id;
    const [seasons, tracks] = await Promise.all([listPublishedSeasons(siteId), listTracks(siteId)]);
    const seasonName = new Map(seasons.map((season) => [season.id, season.name]));
    const track = new Map(tracks.map((entry) => [entry.id, entry]));

    let events: EventSummary[];
    let name: string;
    if (scope === "current") {
      const current = await currentPublishedSeason(siteId, now);
      if (!current) {
        return NextResponse.json({ error: "No season has been published yet." }, { status: 404 });
      }
      events = current.events;
      name = `Chennai Turbo Riders · ${current.season.name}`;
    } else {
      events = (await listPublishedEvents(siteId)).filter((event) => {
        const end = eventEnd(event);
        return end ? end.getTime() >= now.getTime() : false;
      });
      name = "Chennai Turbo Riders · Upcoming rounds";
    }

    const site = (process.env.SITE_URL ?? "").trim().replace(/\/+$/, "");
    let host = "console.invalid";
    try {
      if (site) host = new URL(site).hostname;
    } catch {
      // A malformed SITE_URL only costs the UIDs their domain part.
    }

    const days: CalendarDay[] = events.map((event) => {
      const circuit = track.get(event.track_id);
      const label = eventName(event, circuit?.name ?? "");
      const round = eventNumber("Round", event);
      const season = seasonName.get(event.season_id) ?? "";
      return {
        // Stable per round, so re-importing the file updates rather than duplicates.
        uid: `ctr-round-${event.id}@${host}`,
        from: event.date_from,
        to: event.date_to,
        summary: ["CTR", round, label].filter(Boolean).join(" · "),
        location: [circuit?.name ?? event.venue, circuit?.location ?? event.city].filter(Boolean).join(", "),
        description: [season, event.subtitle].filter(Boolean).join("\n"),
        url: site ? `${site}/schedule` : undefined,
      };
    });

    const file = `ctr-${scope === "current" ? "season" : "upcoming"}-${stamp(now)}.ics`;
    return icsResponse(file, toIcs(name, days, now));
  } catch (error) {
    return exportFailed("calendar", error);
  }
}
