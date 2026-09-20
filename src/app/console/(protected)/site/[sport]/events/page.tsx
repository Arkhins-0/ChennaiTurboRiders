import { SITE } from "@/config/site";
import { requireSite } from "@/lib/server/access";
import { listEvents } from "@/lib/server/eventsRepo";
import { listTracks } from "@/lib/server/tracksRepo";
import { EventsEditor } from "@/admin/screens/events/EventsEditor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sport: string }> };

/**
 * One sport's season.
 *
 * A screen of its own rather than a panel inside the page editor, which is what
 * it was until migration 0018: the rounds were a repeater in the calendar band,
 * saved with the page they sat on. An event is a record now — its own address,
 * its own cover, its own report — so it is edited where a deck and an article
 * are, and the band simply draws whatever is published.
 *
 * Deliberately uses the throwing loader for the events themselves: an editor
 * that quietly showed an empty season after a failed read would invite someone
 * to announce the same four weekends a second time. The circuits and
 * the chrome beside it are only there for the pickers and the preview.
 */
export default async function EventsAdminPage({ params }: Props) {
  const { sport } = await params;
  const { site } = await requireSite(sport, "events");

  const [events, tracks] = await Promise.all([listEvents(site.id), listTracks(site.id)]);

  /*
   * The public origin, handed down rather than imported by the editor. The admin
   * answers on its own hostname, so a relative link to /calendar/<slug> from an
   * admin screen would resolve against the ADMIN host, where the public routes
   * do not exist. SITE.url is built from an environment variable that is not
   * NEXT_PUBLIC, so it is only readable on the server.
   */
  return (
    <EventsEditor
      initialEvents={events}
      tracks={tracks}
      siteUrl={`${SITE.url}${site.kind === "root" ? "" : `/${site.slug}`}`}
    />
  );
}
