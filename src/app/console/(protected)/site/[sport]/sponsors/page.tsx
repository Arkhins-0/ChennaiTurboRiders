import { requireSite } from "@/lib/server/access";
import { listSponsors } from "@/lib/server/sponsorsRepo";
import { SponsorsEditor } from "@/admin/screens/sponsors/SponsorsEditor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sport: string }> };

/** One site's partner board, ordered tier by tier — see `listSponsors`. */
export default async function SponsorsAdminPage({ params }: Props) {
  const { sport } = await params;
  const { site } = await requireSite(sport, "sponsors");

  return <SponsorsEditor initialSponsors={await listSponsors(site.id)} />;
}
