import { requireSite } from "@/lib/server/access";
import { listDrivers } from "@/lib/server/driversRepo";
import { DriversEditor } from "@/admin/screens/drivers/DriversEditor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sport: string }> };

/**
 * One site's roster.
 *
 * Uses the throwing loader rather than a safe one, the same call the circuits
 * screen makes: an editor that quietly showed an empty list after a failed read
 * would invite somebody to add the same eight drivers a second time.
 */
export default async function DriversAdminPage({ params }: Props) {
  const { sport } = await params;
  const { site } = await requireSite(sport, "drivers");

  return <DriversEditor initialDrivers={await listDrivers(site.id)} />;
}
