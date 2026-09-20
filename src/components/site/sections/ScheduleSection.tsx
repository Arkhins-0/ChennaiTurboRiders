import { MapPin } from "lucide-react";
import { CountdownTimer } from "@/components/site/CountdownTimer";
import { Reveal } from "@/components/site/Reveal";
import { SectionHeading } from "@/components/site/SectionHeading";
import { eventDateLabel, eventDateParts, eventIsPast, eventStart, nextEventIndex } from "@/lib/raceDates";
import { currentPublishedSeason } from "@/lib/server/seasonsRepo";
import { getRootSite } from "@/lib/server/sitesRepo";
import { getTrack } from "@/lib/server/tracksRepo";

/**
 * The calendar on the home page.
 *
 * Reads the same season the /schedule page reads, so the two can never
 * disagree about which round is next. Nothing published yet: the band goes
 * rather than announcing a calendar that does not exist.
 */
export async function ScheduleSection() {
  const site = await getRootSite();
  const now = new Date();
  const current = await currentPublishedSeason(site.id, now);
  const events = current?.events ?? [];

  if (!current || events.length === 0) return null;

  const upcoming = events[nextEventIndex(events, now)];
  const track = upcoming?.track_id ? await getTrack(upcoming.track_id) : null;
  const startsAt = upcoming ? eventStart(upcoming) : null;

  return (
    <section id="schedule" className="relative overflow-hidden border-y border-white/10 bg-carbon-900/50 py-24 md:py-32">
      <div className="hud-grid pointer-events-none absolute inset-0" />
      <div className="section-container relative">
        <SectionHeading
          index="04"
          label={current.season.name}
          title="Race Calendar"
          action={{ href: "/schedule", label: "Full calendar" }}
        />

        <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          {upcoming ? (
            <Reveal className="hud-corners relative overflow-hidden bg-carbon-950">
              {track?.photo_url ? (
                <img
                  src={track.photo_url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover opacity-30 grayscale"
                />
              ) : null}
              <div className="grain absolute inset-0 opacity-30" />
              <div className="absolute inset-0 bg-gradient-to-t from-carbon-950 via-carbon-950/80 to-carbon-950/40" />
              <div className="relative flex h-full flex-col justify-between gap-10 p-6 md:p-8">
                <div>
                  <p className="readout flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-racing-yellow animate-blink" />
                    Next race{upcoming.round ? ` · Round ${upcoming.round}` : ""}
                  </p>
                  <h3 className="heading-font lean mt-5 text-4xl font-bold uppercase leading-[0.9] text-white md:text-5xl">
                    {upcoming.title || track?.name || upcoming.venue}
                  </h3>
                  <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-carbon-200">
                    {upcoming.city || upcoming.venue ? (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="size-4 text-racing-yellow" />
                        {upcoming.city || upcoming.venue}
                      </span>
                    ) : null}
                    <span className="font-mono text-xs">{eventDateLabel(upcoming)}</span>
                  </p>
                </div>
                {startsAt ? <CountdownTimer targetIso={startsAt.toISOString()} /> : null}
              </div>
            </Reveal>
          ) : null}

          <Reveal delay={0.1}>
            <ol className="border-t border-white/10">
              {events.map((event, i) => {
                const isNext = event.id === upcoming?.id;
                const past = eventIsPast(event, now);
                const parts = eventDateParts(event);
                return (
                  <li
                    key={event.id}
                    className={`grid grid-cols-[3rem_1fr_auto] items-center gap-4 border-b border-white/10 py-4 md:grid-cols-[4rem_1fr_auto] ${
                      past ? "opacity-40" : ""
                    }`}
                  >
                    <span
                      className={`heading-font lean text-3xl font-bold tabular-nums leading-none ${
                        isNext ? "text-racing-yellow" : "text-carbon-400"
                      }`}
                    >
                      {event.round || String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <p className="heading-font truncate text-lg font-bold uppercase leading-tight text-white md:text-xl">
                        {event.title || event.venue}
                      </p>
                      <p className="readout mt-1 truncate text-[10px]">
                        {event.subtitle || event.city}
                        {event.badge ? <span className="ml-2 text-racing-yellow">· {event.badge}</span> : null}
                        {isNext ? <span className="ml-2 text-racing-yellow">· Next</span> : null}
                      </p>
                    </div>
                    <div className="text-right">
                      {parts ? (
                        <>
                          <p className="heading-font text-lg font-bold tabular-nums leading-none text-white">
                            {parts.days}
                          </p>
                          <p className="readout mt-1 text-[10px]">{parts.month}</p>
                        </>
                      ) : (
                        <p className="readout text-[10px]">TBC</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
