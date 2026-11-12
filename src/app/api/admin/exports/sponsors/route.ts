import { guardRequestSite } from "@/lib/server/access";
import { listSponsors } from "@/lib/server/sponsorsRepo";
import { csvResponse, exportFailed, stamp, toCsv } from "@/lib/server/exports";
import { SPONSOR_TIER_LABELS } from "@/types/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The partners as a spreadsheet, tier by tier in the site's order. */
export async function GET(request: Request) {
  const guard = await guardRequestSite(request, "sponsors");
  if (guard.denied) return guard.denied;

  try {
    const sponsors = await listSponsors(guard.site.id);
    const csv = toCsv(
      ["Name", "Tier", "Website", "Description", "Logo", "Full logo"],
      sponsors.map((sponsor) => [
        sponsor.name,
        SPONSOR_TIER_LABELS[sponsor.tier] ?? sponsor.tier,
        sponsor.website,
        sponsor.description ?? "",
        sponsor.logo,
        sponsor.fullLogo ?? "",
      ])
    );
    return csvResponse(`ctr-sponsors-${stamp()}.csv`, csv);
  } catch (error) {
    return exportFailed("sponsors", error);
  }
}
