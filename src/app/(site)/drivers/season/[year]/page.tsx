import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Trophy } from "lucide-react";
import { LineupCard } from "@/components/site/LineupCard";
import { PageHeader } from "@/components/site/PageHeader";
import { Reveal } from "@/components/site/Reveal";
import { RosterYears } from "@/components/site/RosterYears";
import { siteDrivers, siteHistory, siteRosterYears, siteTeam } from "@/lib/server/siteContent";

/*
 * One page per year the team has a lineup on file. Static, like the driver
 * profiles: saving a season in the console revalidates everything under
 * /drivers (see revalidateSeasonPages).
 */
export async function generateStaticParams() {
  return (await siteRosterYears()).map((year) => ({ year: String(year) }));
}

type Props = { params: Promise<{ year: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const { site } = await siteTeam();
  return {
    title: `${year} Roster`,
    description: `The drivers who raced for ${site.name} in ${year}.`,
  };
}

export default async function SeasonRosterPage({ params }: Props) {
  const { year: raw } = await params;
  const year = Number(raw);
  if (!/^\d{4}$/.test(raw)) notFound();

  const [history, drivers, years] = await Promise.all([siteHistory(), siteDrivers(), siteRosterYears()]);
  const seasons = history.filter((s) => s.year === year && s.drivers.length > 0);
  if (seasons.length === 0) notFound();

  const bySlug = new Map(drivers.map((d) => [d.slug, d]));
  const count = new Set(seasons.flatMap((s) => s.drivers.map((d) => d.name.toLowerCase()))).size;

  return (
    <>
      <PageHeader
        crumb="Drivers"
        title={`${year} Roster`}
        description={`Who drove for the team in ${year}, league by league, with their points that season.`}
        aside={`${count} driver${count === 1 ? "" : "s"} · ${seasons.length} championship${seasons.length === 1 ? "" : "s"}`}
      />

      <div className="section-container space-y-20 py-16 md:py-24">
        <RosterYears years={years} active={year} />

        {seasons.map((s, si) => {
          const league = s.league?.short_name || s.league?.name || s.name;
          return (
            <section key={s.id} aria-labelledby={`season-${s.id}`}>
              <Reveal className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <p className="readout">
                    <span className="text-racing-yellow">{String(si + 1).padStart(2, "0")}</span>
                    <span className="mx-2 text-carbon-400">/</span>
                    {year}
                  </p>
                  <h2
                    id={`season-${s.id}`}
                    className="heading-font lean mt-2 text-4xl font-bold uppercase leading-none text-white md:text-5xl"
                  >
                    {s.league?.name ?? s.name}
                  </h2>
                </div>
                <p className="readout flex flex-wrap gap-x-4 gap-y-1">
                  {s.result ? <span className="text-white">Team {s.result.toLowerCase()}</span> : null}
                  {s.team_points != null ? <span>{s.team_points} pts</span> : null}
                  <span>{s.drivers.length} drivers</span>
                </p>
              </Reveal>

              {s.champion ? (
                <Reveal className="mb-6 flex items-start gap-3 border-l-2 border-racing-yellow bg-racing-yellow/5 px-4 py-3 text-sm text-carbon-100">
                  <Trophy className="mt-0.5 size-4 shrink-0 text-racing-yellow" />
                  <span>
                    <span className="font-semibold text-white">Drivers&rsquo; champion:</span> {s.champion}
                  </span>
                </Reveal>
              ) : null}

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                {s.drivers.map((d, i) => {
                  const profile = d.slug ? bySlug.get(d.slug) : undefined;
                  return (
                    <Reveal key={`${d.name}-${i}`} delay={i * 0.05}>
                      <LineupCard
                        name={d.name}
                        nationality={d.nationality}
                        league={league}
                        points={d.points}
                        image={profile?.image}
                        href={profile ? `/drivers/${profile.slug}` : undefined}
                        champion={Boolean(s.champion) && s.champion.toLowerCase().startsWith(d.name.toLowerCase())}
                      />
                    </Reveal>
                  );
                })}
              </div>
            </section>
          );
        })}

        <p className="flex justify-end">
          <Link href="/history" className="readout inline-flex items-center gap-2 text-[10px] transition-colors hover:text-racing-yellow">
            Season results <ArrowRight className="size-3.5" />
          </Link>
        </p>
      </div>
    </>
  );
}
