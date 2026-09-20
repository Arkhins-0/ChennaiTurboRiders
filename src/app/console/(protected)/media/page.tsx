import { visibleRoots } from "@/lib/mediaPaths";
import { requireAnySite } from "@/lib/server/access";
import { isS3Configured } from "@/lib/server/s3";
import { listSites } from "@/lib/server/sitesRepo";
import { MediaLibrary } from "@/admin/screens/media/MediaLibrary";

export const dynamic = "force-dynamic";

/**
 * The media library, across every sport this account can reach.
 *
 * `visibleRoots` needs the full list of site slugs as well as the session,
 * because an owner holds no grants — their reach is the role, not a list — and
 * the explorer still has to show them every sport's folder.
 */
export default async function MediaAdminPage() {
  const session = await requireAnySite();
  const sites = await listSites();

  return (
    <MediaLibrary
      configured={isS3Configured()}
      roots={visibleRoots(session, sites.map((site) => site.slug))}
    />
  );
}
