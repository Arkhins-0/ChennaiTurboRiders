import { requireSite } from "@/lib/server/access";
import { listTracks } from "@/lib/server/tracksRepo";
import { TracksEditor } from "@/admin/screens/tracks/TracksEditor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sport: string }> };

/**
 * One sport's circuits.
 *
 * Not part of the page editor: a circuit is a thing the championship visits,
 * not a section of a document, and the calendar only points at it.
 *
 * Deliberately uses the throwing loader, not a safe one: an editor that quietly
 * showed an empty list after a failed read would invite someone to add the
 * same circuits a second time.
 */
export default async function TracksAdminPage({ params }: Props) {
  const { sport } = await params;
  const { site } = await requireSite(sport, "circuits");

  return <TracksEditor initialTracks={await listTracks(site.id)} />;
}
