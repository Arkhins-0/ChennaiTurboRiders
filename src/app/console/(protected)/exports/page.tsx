import { notFound } from "next/navigation";
import { canEdit } from "@/lib/roles";
import { hasModule } from "@/lib/sites";
import { requireAnySite } from "@/lib/server/access";
import { listSites } from "@/lib/server/sitesRepo";
import { reachableSites } from "@/admin/components/shell/nav";
import { ConsolePage, PageStrip, SectionStrip } from "@/admin/components/PageStrip";
import { ExportButton } from "@/admin/screens/exports/ExportButton";
import {
  DriversIcon,
  HistoryIcon,
  SeasonsIcon,
  SponsorsIcon,
} from "@/admin/ui/icons";

export const dynamic = "force-dynamic";

export const metadata = { title: "Exports" };

type Download = { label: string; file: string; href: string; primary?: boolean };
type Item = { key: string; icon: typeof DriversIcon; title: string; line: string; downloads: Download[] };

/**
 * Everything the console holds that is worth having in a spreadsheet or a
 * calendar, one card each: only the ones this account may edit.
 *
 * Each download is a route under /api/admin/exports, guarded by the module it
 * reads exactly as the editing routes are — the page hiding a card is a
 * courtesy, the route refusing is the rule.
 */
export default async function ExportsPage() {
  const session = await requireAnySite();
  const sites = await listSites();
  const reachable = reachableSites(session, sites);
  const site = reachable.find((entry) => entry.kind === "root") ?? reachable[0];
  if (!site) notFound();

  const q = `?site=${encodeURIComponent(site.slug)}`;
  const api = "/api/admin/exports";
  const events = canEdit(session, site.id, "events") && hasModule(site, "events");

  const spreadsheets: Item[] = [];
  if (canEdit(session, site.id, "drivers")) {
    spreadsheets.push({
      key: "drivers",
      icon: DriversIcon,
      title: "Drivers",
      line: "The roster: names, numbers, nationality, car, date of birth and career figures.",
      downloads: [{ label: "Drivers CSV", file: "ctr-drivers.csv", href: `${api}/drivers${q}` }],
    });
  }
  if (canEdit(session, site.id, "sponsors")) {
    spreadsheets.push({
      key: "sponsors",
      icon: SponsorsIcon,
      title: "Sponsors",
      line: "Every partner with its tier, website and logo.",
      downloads: [{ label: "Sponsors CSV", file: "ctr-sponsors.csv", href: `${api}/sponsors${q}` }],
    });
  }
  if (events) {
    spreadsheets.push({
      key: "rounds",
      icon: SeasonsIcon,
      title: "Rounds",
      line: "Every round of every season, drafts included: season, round, venue, dates and circuit.",
      downloads: [{ label: "Rounds CSV", file: "ctr-rounds.csv", href: `${api}/rounds${q}` }],
    });
    spreadsheets.push({
      key: "history",
      icon: HistoryIcon,
      title: "Team history",
      line: "One row per driver per season: the championship, the year, the team's result and points, each driver's points.",
      downloads: [{ label: "History CSV", file: "ctr-history.csv", href: `${api}/history${q}` }],
    });
  }

  const calendars: Item[] = events
    ? [
        {
          key: "calendar",
          icon: SeasonsIcon,
          title: "Race calendar",
          line: "The published rounds as all-day events, for Google Calendar, Outlook or a phone. Drafts are never included.",
          downloads: [
            { label: "This season (.ics)", file: "ctr-season.ics", href: `${api}/calendar${q}&scope=current`, primary: true },
            { label: "All upcoming (.ics)", file: "ctr-upcoming.ics", href: `${api}/calendar${q}&scope=upcoming` },
          ],
        },
      ]
    : [];

  if (spreadsheets.length === 0 && calendars.length === 0) notFound();

  return (
    <ConsolePage width="lg">
      <PageStrip
        title="Exports"
        sub="Download what the console holds. Spreadsheets are CSV in UTF-8, which Excel, Numbers and Google Sheets all open."
      />

      <div className="space-y-8">
        {spreadsheets.length > 0 ? (
          <section>
            <SectionStrip title="Spreadsheets" count={spreadsheets.length} />
            <div className="grid gap-3 md:grid-cols-2">
              {spreadsheets.map((item) => (
                <ExportCard key={item.key} item={item} />
              ))}
            </div>
          </section>
        ) : null}

        {calendars.length > 0 ? (
          <section>
            <SectionStrip title="Calendars" />
            <div className="grid gap-3 md:grid-cols-2">
              {calendars.map((item) => (
                <ExportCard key={item.key} item={item} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </ConsolePage>
  );
}

function ExportCard({ item }: { item: Item }) {
  const Icon = item.icon;
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-foreground">{item.title}</h3>
          <p className="mt-0.5 text-[13px] text-faint">{item.line}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 pl-11">
        {item.downloads.map((download) => (
          <ExportButton
            key={download.href}
            href={download.href}
            label={download.label}
            fallbackName={download.file}
            variant={download.primary ? "default" : "outline"}
          />
        ))}
      </div>
    </div>
  );
}
