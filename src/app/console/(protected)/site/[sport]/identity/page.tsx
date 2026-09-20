import { requireSite } from "@/lib/server/access";
import { getCar, getTeam, listAchievements } from "@/lib/server/teamRepo";
import { IdentityEditor } from "@/admin/screens/identity/IdentityEditor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sport: string }> };

/**
 * The site's own details: who it is, what it says, and the car.
 *
 * Not part of the page editor, for the reason the circuits screen is not
 * either: these are not sections of a document. They are the values the whole
 * site is built from — the masthead, the footer, the breadcrumb on every inner
 * page — so they belong to the site rather than to any one page of it.
 */
export default async function IdentityAdminPage({ params }: Props) {
  const { sport } = await params;
  const { site } = await requireSite(sport, "identity");

  const [team, car, achievements] = await Promise.all([
    getTeam(site.id),
    getCar(site.id),
    listAchievements(site.id),
  ]);

  return <IdentityEditor initialTeam={team} initialCar={car} initialAchievements={achievements} />;
}
