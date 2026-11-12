import Link from "next/link";
import { canEdit, canManageAdmins, canSeeAnySite, type GrantModule } from "@/lib/roles";
import { eventDateLabel, eventEnd, eventStart, nextEventIndex } from "@/lib/raceDates";
import { eventName, eventNumber } from "@/lib/events";
import { hasModule, type Site } from "@/lib/sites";
import { getSession } from "@/lib/server/auth";
import { getSql } from "@/lib/server/db";
import { listSites } from "@/lib/server/sitesRepo";
import { currentPublishedSeason, listSeasons } from "@/lib/server/seasonsRepo";
import { listEvents } from "@/lib/server/eventsRepo";
import { listDrivers } from "@/lib/server/driversRepo";
import { listSponsors } from "@/lib/server/sponsorsRepo";
import { listArticles } from "@/lib/server/articlesRepo";
import { listTracks } from "@/lib/server/tracksRepo";
import { reachableSites } from "@/admin/components/shell/nav";
import { ConsolePage, PageStrip } from "@/admin/components/PageStrip";
import { EmptyState } from "@/admin/components/EmptyState";
import { Figure, Line, Panel, PanelEmpty } from "@/admin/screens/dashboard/parts";
import { buttonClass } from "@/admin/ui/Button";
import {
  AlertIcon,
  ArticlesIcon,
  CalendarPlusIcon,
  ChevronRightIcon,
  CircuitsIcon,
  ClockIcon,
  DashboardIcon,
  DriversIcon,
  SeasonsIcon,
  SponsorsIcon,
  TimerIcon,
  WriteIcon,
} from "@/admin/ui/icons";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

const DAY = 24 * 60 * 60 * 1000;
const ZONE = "Asia/Kolkata";

const greeting = (hour: number) => (hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");

/** "4 min ago", "3 h ago", "2 days ago", then a date. */
function timeAgo(at: Date, now: Date): string {
  const minutes = Math.round((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return days === 1 ? "yesterday" : `${days} days ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: ZONE }).format(at);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A read the dashboard can live without: a failed panel says nothing rather than taking the page down. */
const maybe = <T,>(read: Promise<T>): Promise<T | null> =>
  read.catch((error) => {
    console.error("[console/dashboard]", error);
    return null;
  });

type Recent = { kind: "driver" | "sponsor" | "event" | "article" | "track" | "season"; title: string; updated_at: string };

/**
 * The latest rows by `updated_at` across the tables this account can edit.
 * One UNION, built from only the parts the account may see, so a co-admin's
 * dashboard never names a record from a screen they cannot open.
 */
async function recentlyChanged(siteId: string, kinds: Recent["kind"][]): Promise<Recent[]> {
  const parts: Record<Recent["kind"], string> = {
    driver: `SELECT 'driver' AS kind, trim(first_name || ' ' || last_name) AS title, updated_at FROM ctr.drivers WHERE site_id = $1`,
    sponsor: `SELECT 'sponsor', name, updated_at FROM ctr.sponsors WHERE site_id = $1`,
    event: `SELECT 'event', coalesce(nullif(e.title, ''), nullif(t.name, ''), nullif(e.venue, ''), 'Round ' || e.round), e.updated_at
              FROM ctr.events e LEFT JOIN ctr.tracks t ON t.id::text = e.track_id::text WHERE e.site_id = $1`,
    article: `SELECT 'article', title, updated_at FROM ctr.articles WHERE site_id = $1`,
    track: `SELECT 'track', name, updated_at FROM ctr.tracks WHERE site_id = $1`,
    season: `SELECT 'season', name, updated_at FROM ctr.seasons WHERE site_id = $1`,
  };
  if (kinds.length === 0) return [];

  const sql = getSql();
  const rows = (await sql.query(
    `SELECT kind, title, updated_at FROM (${kinds.map((kind) => parts[kind]).join(" UNION ALL ")}) r
      ORDER BY updated_at DESC LIMIT 8`,
    [siteId]
  )) as Recent[];
  return rows;
}

/**
 * The console's home: the date and a greeting, the two things done most
 * (a round, an article), four figures, the next round, what needs doing, and
 * what changed last. Every tile and panel is for a screen this account can
 * edit, and nothing else.
 */
export default async function DashboardPage() {
  const session = await getSession();
  const sites = await listSites();
  const now = new Date();

  const reachable = session ? reachableSites(session, sites) : [];
  const site: Site | undefined = reachable.find((entry) => entry.kind === "root") ?? reachable[0];

  if (!session || (!site && !canSeeAnySite(session) && !canManageAdmins(session))) {
    return (
      <ConsolePage width="md">
        <div className="mx-auto mt-10 max-w-md rounded-xl border border-border bg-card shadow-card">
          <EmptyState
            icon={DashboardIcon}
            title="Nothing assigned yet"
            line="This account has nothing on it. An owner can give it a site, or a part of one, from Accounts."
          />
        </div>
      </ConsolePage>
    );
  }

  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: ZONE }).format(now));
  const dateLine = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: ZONE }).format(now);
  const title = `${greeting(hour)}, ${session.username}`;

  if (!site) {
    // An account with the media library or the accounts screen, but no site screen.
    return (
      <ConsolePage>
        <PageStrip eyebrow={dateLine} title={title} />
        <div className="rounded-xl border border-border bg-card shadow-card">
          <EmptyState
            icon={DashboardIcon}
            title="No site screens on this account"
            line="Use the sidebar to open what it does have."
            action={canManageAdmins(session) ? { label: "Open Accounts", href: "/admins" } : { label: "Open Media", href: "/media" }}
          />
        </div>
      </ConsolePage>
    );
  }

  const base = `/site/${site.slug}`;
  const can = (module: GrantModule) =>
    canEdit(session, site.id, module) &&
    (module === "events" || module === "articles" || module === "circuits" ? hasModule(site, module) : true);

  const seeEvents = can("events");
  const seeDrivers = can("drivers");
  const seeSponsors = can("sponsors");
  const seeArticles = can("articles");
  const seeCircuits = can("circuits");

  const [current, events, seasons, drivers, sponsors, articles, tracks, recent] = await Promise.all([
    seeEvents ? maybe(currentPublishedSeason(site.id, now)) : null,
    seeEvents ? maybe(listEvents(site.id)) : null,
    seeEvents ? maybe(listSeasons(site.id)) : null,
    seeDrivers ? maybe(listDrivers(site.id)) : null,
    seeSponsors ? maybe(listSponsors(site.id)) : null,
    seeArticles ? maybe(listArticles(session, site.id)) : null,
    seeEvents || seeCircuits ? maybe(listTracks(site.id)) : null,
    maybe(
      recentlyChanged(
        site.id,
        [
          seeDrivers && ("driver" as const),
          seeSponsors && ("sponsor" as const),
          seeEvents && ("event" as const),
          seeEvents && ("season" as const),
          seeArticles && ("article" as const),
          seeCircuits && ("track" as const),
        ].filter((kind): kind is Recent["kind"] => Boolean(kind))
      )
    ),
  ]);

  const trackName = new Map((tracks ?? []).map((track) => [track.id, track.name]));
  const seasonName = new Map((seasons ?? []).map((season) => [season.id, season.name]));

  /* The next round, from the season a visitor is shown. */
  const seasonEvents = current?.events ?? [];
  const nextIndex = nextEventIndex(seasonEvents, now);
  const next = nextIndex >= 0 ? seasonEvents[nextIndex] : null;
  const nextStart = next ? eventStart(next) : null;
  const nextEnd = next ? eventEnd(next) : null;
  const racingNow = Boolean(nextStart && nextEnd && nextStart.getTime() <= now.getTime() && now.getTime() <= nextEnd.getTime());
  const daysToNext = nextStart ? Math.max(0, Math.ceil((nextStart.getTime() - now.getTime()) / DAY)) : null;
  const nextName = next ? eventName(next, trackName.get(next.track_id) ?? "") : "";
  const nextRound = next ? eventNumber("Round", next) : "";
  // The name is the title, else the circuit, else the venue; the line under it
  // says where, without repeating what the name already said.
  const venue = next ? trackName.get(next.track_id) || next.venue : "";
  const place = next ? [next.title ? venue : "", next.city].filter(Boolean).join(", ") : "";

  /* Needs attention. */
  const noPhoto = (drivers ?? []).filter((driver) => !driver.image);
  const noBio = (drivers ?? []).filter((driver) => !driver.biography.trim());
  const noCircuit = (events ?? []).filter((event) => !event.track_id);
  const draftArticles = (articles ?? []).filter((article) => article.status !== "published");
  const noLogo = (sponsors ?? []).filter((sponsor) => !sponsor.logo);
  const noWebsite = (sponsors ?? []).filter((sponsor) => !sponsor.website);

  const attention: { key: string; href: string; icon: typeof AlertIcon; title: string; sub?: string; end: string }[] = [];
  const names = (list: string[]) => (list.length > 3 ? `${list.slice(0, 3).join(", ")} and ${list.length - 3} more` : list.join(", "));
  const fullName = (driver: { firstName: string; lastName: string }) => `${driver.firstName} ${driver.lastName}`.trim() || "Unnamed driver";

  if (noPhoto.length) {
    attention.push({ key: "photo", href: `${base}/drivers`, icon: DriversIcon, title: `${plural(noPhoto.length, "driver has", "drivers have")} no photo`, sub: names(noPhoto.map(fullName)), end: "Drivers" });
  }
  if (noBio.length) {
    attention.push({ key: "bio", href: `${base}/drivers`, icon: DriversIcon, title: `${plural(noBio.length, "driver has", "drivers have")} no biography`, sub: names(noBio.map(fullName)), end: "Drivers" });
  }
  if (noCircuit.length) {
    attention.push({
      key: "circuit",
      href: `${base}/events`,
      icon: CircuitsIcon,
      title: `${plural(noCircuit.length, "round has", "rounds have")} no circuit`,
      sub: names(noCircuit.map((event) => [seasonName.get(event.season_id), eventNumber("Round", event) || eventName(event)].filter(Boolean).join(" · "))),
      end: "Seasons",
    });
  }
  if (draftArticles.length) {
    attention.push({ key: "drafts", href: `${base}/articles`, icon: ArticlesIcon, title: `${plural(draftArticles.length, "article is", "articles are")} still a draft`, sub: names(draftArticles.map((article) => article.title || "Untitled")), end: "Articles" });
  }
  if (noLogo.length) {
    attention.push({ key: "logo", href: `${base}/sponsors`, icon: SponsorsIcon, title: `${plural(noLogo.length, "sponsor has", "sponsors have")} no logo`, sub: names(noLogo.map((sponsor) => sponsor.name || "Unnamed")), end: "Sponsors" });
  }
  if (noWebsite.length) {
    attention.push({ key: "web", href: `${base}/sponsors`, icon: SponsorsIcon, title: `${plural(noWebsite.length, "sponsor has", "sponsors have")} no website`, sub: names(noWebsite.map((sponsor) => sponsor.name || "Unnamed")), end: "Sponsors" });
  }

  const RECENT: Record<Recent["kind"], { label: string; href: string; icon: typeof AlertIcon }> = {
    driver: { label: "Driver", href: `${base}/drivers`, icon: DriversIcon },
    sponsor: { label: "Sponsor", href: `${base}/sponsors`, icon: SponsorsIcon },
    event: { label: "Round", href: `${base}/events`, icon: SeasonsIcon },
    season: { label: "Season", href: `${base}/events`, icon: SeasonsIcon },
    article: { label: "Article", href: `${base}/articles`, icon: ArticlesIcon },
    track: { label: "Circuit", href: `${base}/tracks`, icon: CircuitsIcon },
  };

  const publishedArticles = (articles ?? []).filter((article) => article.status === "published").length;

  return (
    <ConsolePage>
      <div className="space-y-6">
        <PageStrip eyebrow={dateLine} title={title} className="mb-0">
          {seeArticles ? (
            <Link href={`${base}/articles`} className={buttonClass("outline", "sm")}>
              <WriteIcon className="size-4" />
              Write an article
            </Link>
          ) : null}
          {seeEvents ? (
            <Link href={`${base}/events`} className={buttonClass("default", "sm")}>
              <CalendarPlusIcon className="size-4" />
              Add a round
            </Link>
          ) : null}
        </PageStrip>

        {seeEvents || seeDrivers || seeArticles || seeSponsors ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {seeEvents ? (
              <Figure
                icon={TimerIcon}
                words={!next || racingNow}
                n={!next ? "None set" : racingNow ? "Racing now" : daysToNext === 0 ? "Today" : plural(daysToNext ?? 0, "day", "days")}
                label={!next ? "no round ahead this season" : racingNow ? `${nextRound || nextName} is on` : `to ${nextRound || nextName}`}
                href={`${base}/events`}
              />
            ) : null}
            {seeDrivers ? (
              <Figure icon={DriversIcon} n={drivers?.length ?? "–"} label={drivers?.length === 1 ? "driver on the roster" : "drivers on the roster"} href={`${base}/drivers`} />
            ) : null}
            {seeArticles ? (
              <Figure icon={ArticlesIcon} n={articles ? publishedArticles : "–"} label={publishedArticles === 1 ? "article published" : "articles published"} href={`${base}/articles`} />
            ) : null}
            {seeSponsors ? (
              <Figure icon={SponsorsIcon} n={sponsors?.length ?? "–"} label={sponsors?.length === 1 ? "partner" : "partners"} href={`${base}/sponsors`} />
            ) : null}
          </div>
        ) : null}

        {seeEvents && next ? (
          <Link
            href={`${base}/events`}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/40 sm:p-5"
          >
            <DateTile from={next.date_from} to={next.date_to} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">
                {racingNow ? "On now" : "Next up"}
                {current ? <span className="text-faint"> · {current.season.name}</span> : null}
              </p>
              <p className="mt-0.5 truncate text-lg font-semibold tracking-tight">
                {nextRound ? `${nextRound} · ` : ""}
                {nextName || "Venue to be confirmed"}
              </p>
              {place ? <p className="truncate text-[13px] text-faint">{place}</p> : null}
              <p className="mt-1.5 text-[13px] text-muted-fg">{eventDateLabel(next) || "Dates to be confirmed"}</p>
            </div>
            <ChevronRightIcon className="size-4 shrink-0 text-faint" />
          </Link>
        ) : null}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Panel title="Needs attention" count={attention.length}>
            {attention.length === 0 ? <PanelEmpty>Nothing waiting. Every record is complete.</PanelEmpty> : null}
            {attention.map((row) => (
              <Line key={row.key} href={row.href} icon={row.icon} title={row.title} sub={row.sub} end={row.end} />
            ))}
          </Panel>

          <Panel title="Recently changed">
            {!recent || recent.length === 0 ? <PanelEmpty>Nothing has been edited yet.</PanelEmpty> : null}
            {(recent ?? []).map((row, index) => {
              const kind = RECENT[row.kind];
              return (
                <Line
                  key={`${row.kind}-${index}`}
                  href={kind.href}
                  icon={kind.icon}
                  title={row.title || `Untitled ${kind.label.toLowerCase()}`}
                  sub={kind.label}
                  end={
                    <span className="inline-flex items-center gap-1">
                      <ClockIcon className="size-3" />
                      {timeAgo(new Date(row.updated_at), now)}
                    </span>
                  }
                />
              );
            })}
          </Panel>
        </div>

        {attention.length > 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-faint">
            <AlertIcon className="size-3.5" />
            Needs attention is worked out from what is saved; it clears itself as the records are filled in.
          </p>
        ) : null}
      </div>
    </ConsolePage>
  );
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** The month over the day(s), in a small bordered square. "TBC" without a date. */
function DateTile({ from, to }: { from: string; to: string }) {
  const start = from ? new Date(`${from}T00:00:00Z`) : null;
  const end = to ? new Date(`${to}T00:00:00Z`) : null;
  const valid = start && !Number.isNaN(start.getTime());
  const days = valid
    ? end && !Number.isNaN(end.getTime()) && end.getTime() !== start.getTime()
      ? `${start.getUTCDate()}–${end.getUTCDate()}`
      : String(start.getUTCDate())
    : "TBC";

  return (
    <span className="grid size-14 shrink-0 place-content-center rounded-xl border border-border bg-high text-center">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
        {valid ? MONTHS[start.getUTCMonth()] : "Date"}
      </span>
      <span className="text-base font-semibold leading-tight tabular-nums">{days}</span>
    </span>
  );
}
