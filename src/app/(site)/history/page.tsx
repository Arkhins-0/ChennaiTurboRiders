import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Trophy } from "lucide-react";
import { PageHeader } from "@/components/site/PageHeader";
import { Reveal } from "@/components/site/Reveal";
import { SectionHeading } from "@/components/site/SectionHeading";
import { eventDateLabel } from "@/lib/raceDates";
import { siteHistory, siteTeam } from "@/lib/server/siteContent";
import type { HistorySeason } from "@/lib/server/historyRepo";

export async function generateMetadata(): Promise<Metadata> {
  const { site } = await siteTeam();
  return {
    title: "Team History",
    description: `Every season ${site.name} has raced — the leagues, the drivers and where the team finished.`,
  };
}

const fmt = (n: number | null) => (n == null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1));

export default async function HistoryPage() {
  const [{ site }, seasons] = await Promise.all([siteTeam(), siteHistory()]);

  const finished = seasons.filter((s) => s.finished);
  const running = seasons.filter((s) => !s.finished);

  const years = [...new Set(finished.map((s) => s.year))];
  const first = Math.min(...seasons.map((s) => s.year));
  const leagues = new Set(finished.map((s) => s.league?.name).filter(Boolean));
  const drivers = new Set(finished.flatMap((s) => s.drivers.map((d) => d.name.toLowerCase())));
  const best = finished
    .filter((s) => s.team_position)
    .sort((a, b) => (a.team_position ?? 99) - (b.team_position ?? 99))[0];
  const titles = finished.filter((s) => s.champion).length;

  const stats = [
    { value: String(finished.length), label: "Seasons raced" },
    { value: String(leagues.size), label: "Championships" },
    { value: String(drivers.size), label: "Drivers fielded" },
    { value: best?.result || "—", label: "Best team finish" },
    { value: String(titles), label: "Driver titles" },
  ];

  return (
    <>
      <PageHeader
        crumb="History"
        title="Team History"
        description={`Every season ${site.name} has raced — the leagues, the drivers and where the team finished.`}
        aside={seasons.length ? `Since ${first} · ${finished.length} seasons` : "History"}
      />

      {seasons.length === 0 ? (
        <div className="section-container py-16 md:py-24">
          <p className="hud-corners p-16 text-center text-carbon-300">The team&rsquo;s record is being written up.</p>
        </div>
      ) : (
        <>
          {/* The record in five numbers */}
          <section className="section-container pt-16 md:pt-24">
            <Reveal>
              <dl className="grid grid-cols-2 gap-px border border-white/10 bg-white/10 sm:grid-cols-3 lg:grid-cols-5">
                {stats.map((s) => (
                  <div key={s.label} className="bg-carbon-950 p-5">
                    <dd className="heading-font text-3xl font-bold uppercase leading-none text-racing-yellow md:text-4xl">
                      {s.value}
                    </dd>
                    <dt className="readout mt-2 text-[10px]">{s.label}</dt>
                  </div>
                ))}
              </dl>
            </Reveal>
          </section>

          {/* The season being raced now */}
          {running.length > 0 ? (
            <section className="section-container pt-10">
              {running.map((s) => (
                <Reveal key={s.id}>
                  <Link
                    href="/schedule"
                    className="group hud-corners flex flex-col gap-4 bg-carbon-900 p-6 transition-colors hover:bg-carbon-800 sm:flex-row sm:items-center sm:justify-between md:p-8"
                  >
                    <div>
                      <p className="readout flex items-center gap-2 text-racing-yellow">
                        <span className="size-1.5 rounded-full bg-racing-yellow animate-blink" />
                        Racing now
                      </p>
                      <p className="heading-font lean mt-2 text-3xl font-bold uppercase leading-none text-white md:text-4xl">
                        {s.name}
                      </p>
                      <p className="mt-2 text-sm text-carbon-300">
                        {s.rounds.length} round{s.rounds.length === 1 ? "" : "s"}
                        {s.drivers.length ? ` · ${s.drivers.map((d) => d.name).join(", ")}` : ""}
                      </p>
                    </div>
                    <span className="btn-ghost shrink-0 self-start sm:self-auto">
                      <span>Race calendar</span>
                      <ArrowUpRight className="size-4" />
                    </span>
                  </Link>
                </Reveal>
              ))}
            </section>
          ) : null}

          {/* Year by year */}
          <section className="section-container py-16 md:py-24">
            <SectionHeading index="01" label={`Since ${first}`} title="Season by Season" />

            <div className="mt-14 space-y-16">
              {years.map((year) => (
                <div key={year} className="grid gap-6 lg:grid-cols-[10rem_1fr] lg:gap-10">
                  <Reveal>
                    <h2 className="heading-font lean text-7xl font-bold leading-none text-racing-yellow lg:sticky lg:top-28">
                      {year}
                    </h2>
                  </Reveal>
                  <div className="grid gap-px border border-white/10 bg-white/10 xl:grid-cols-2 xl:[&>*:last-child:nth-child(odd)]:col-span-2">
                    {finished
                      .filter((s) => s.year === year)
                      .map((s, i) => (
                        <SeasonCard key={s.id} season={s} delay={i * 0.06} />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function SeasonCard({ season: s, delay }: { season: HistorySeason; delay: number }) {
  return (
    <Reveal as="article" delay={delay} className="flex flex-col bg-carbon-950 p-6 md:p-8">
      <p className="readout text-carbon-300">{s.league?.name ?? s.name}</p>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          {/*
            The headline is the team's result where the league has a teams'
            table. F4 does not, so a season there leads with the title one of
            the drivers won, or failing that with who drove — never a result
            nobody recorded.
          */}
          <p className="heading-font lean text-4xl font-bold uppercase leading-none text-white md:text-5xl">
            {s.result || (s.champion ? "Title won" : `${s.drivers.length} driver${s.drivers.length === 1 ? "" : "s"}`)}
          </p>
          <p className="readout mt-2 text-[10px]">
            {s.result ? "Team championship" : s.champion ? "Drivers' championship" : "Team entry"}
          </p>
        </div>
        {s.team_points != null ? (
          <div className="text-right">
            <p className="heading-font text-4xl font-bold leading-none text-racing-yellow">{fmt(s.team_points)}</p>
            <p className="readout mt-2 text-[10px]">Points</p>
          </div>
        ) : null}
      </div>

      {s.champion ? (
        <p className="mt-6 flex items-start gap-3 border-l-2 border-racing-yellow bg-racing-yellow/5 px-4 py-3 text-sm text-carbon-100">
          <Trophy className="mt-0.5 size-4 shrink-0 text-racing-yellow" />
          <span>
            <span className="font-semibold text-white">Drivers&rsquo; champion:</span> {s.champion}
          </span>
        </p>
      ) : null}

      {s.car ? (
        <p className="mt-6 text-sm text-carbon-300">
          <span className="readout mr-2 text-[10px]">Car</span>
          {s.car}
        </p>
      ) : null}

      {s.drivers.length > 0 ? (
        <div className="mt-6">
          <p className="readout text-[10px]">Drivers</p>
          <ul className="mt-3 divide-y divide-white/10 border-y border-white/10">
            {s.drivers.map((d) => (
              <li key={d.name} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
                <span className="min-w-0">
                  {d.slug ? (
                    <Link
                      href={`/drivers/${d.slug}`}
                      className="font-semibold text-white underline decoration-white/30 underline-offset-4 transition-colors hover:text-racing-yellow hover:decoration-racing-yellow"
                    >
                      {d.name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-white">{d.name}</span>
                  )}
                  {d.nationality ? <span className="ml-2 text-carbon-300">{d.nationality}</span> : null}
                </span>
                {d.points != null ? (
                  <span className="shrink-0 font-mono text-xs tabular-nums text-carbon-200">{fmt(d.points)} pts</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {s.rounds.length > 0 ? (
        <details className="group mt-6">
          <summary className="readout cursor-pointer list-none text-[10px] hover:text-racing-yellow">
            <span className="group-open:hidden">Show the {s.rounds.length} rounds</span>
            <span className="hidden group-open:inline">Hide the rounds</span>
          </summary>
          <ol className="mt-3 space-y-2 text-sm">
            {s.rounds.map((r) => (
              <li key={`${r.round}-${r.date_from}`} className="grid grid-cols-[2.5rem_1fr_auto] gap-3 text-carbon-200">
                <span className="font-mono text-xs text-carbon-300">R{r.round}</span>
                <span className="min-w-0 truncate">{r.venue}</span>
                <span className="font-mono text-xs text-carbon-300">{eventDateLabel(r)}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {s.notes ? <p className="mt-6 text-sm leading-relaxed text-carbon-300">{s.notes}</p> : null}
    </Reveal>
  );
}
