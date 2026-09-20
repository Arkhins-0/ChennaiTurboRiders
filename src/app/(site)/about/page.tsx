import type { Metadata } from "next";
import { Counter } from "@/components/site/Counter";
import { PageHeader } from "@/components/site/PageHeader";
import { Reveal } from "@/components/site/Reveal";
import { SectionHeading } from "@/components/site/SectionHeading";
import { siteAchievements, siteTeam } from "@/lib/server/siteContent";

/*
 * `generateMetadata` rather than a `metadata` constant.
 *
 * The description is the team's own copy, which is a row now — and a module
 * constant is evaluated when the module is first imported, which is before
 * there is a request to read one for. Next's answer to that is this function,
 * and `siteTeam` is memoised, so it is not a second query.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { about } = await siteTeam();
  return { title: "The Team", description: about.description };
}

export default async function AboutPage() {
  const [{ about, site, teamPrincipal }, achievements] = await Promise.all([
    siteTeam(),
    siteAchievements(),
  ]);

  return (
    <>
      <PageHeader
        crumb="Team"
        title="The Team"
        description={site.description}
        aside={`Est. ${site.founded} · Chennai`}
      />

      {/* Intro */}
      <section className="section-container py-16 md:py-24">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          <Reveal className="hud-corners p-3">
            <div className="relative aspect-[4/3] overflow-hidden bg-carbon-900">
              <img
                src={about.image}
                alt={`${site.name} team`}
                loading="eager"
                decoding="async"
                className="h-full w-full object-cover"
              />
              <div className="grain absolute inset-0 opacity-30" />
            </div>
            <p className="readout mt-3 flex justify-between text-[10px]">
              <span>Fig. 01 — The paddock</span>
              <span>{about.subtitle}</span>
            </p>
          </Reveal>
          <div className="flex flex-col justify-between gap-10">
            <Reveal>
              <p className="heading-font text-2xl font-semibold leading-snug text-white md:text-[2rem] md:leading-tight">
                {about.description}
              </p>
              <p className="mt-6 text-base leading-relaxed text-carbon-300">{about.description2}</p>
            </Reveal>
            <Reveal delay={0.1}>
              <dl className="grid grid-cols-2 gap-px border border-white/10 bg-white/10 sm:grid-cols-4">
                {about.stats.map((s) => (
                  <div key={s.label} className="bg-carbon-950 p-5">
                    <dd className="heading-font text-4xl font-bold leading-none text-racing-yellow">
                      <Counter value={s.value} />
                    </dd>
                    <dt className="readout mt-2 text-[10px]">{s.label}</dt>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Principal */}
      <section className="relative overflow-hidden border-y border-white/10 bg-carbon-900/50">
        <div className="hud-grid pointer-events-none absolute inset-0" />
        <Reveal className="section-container relative grid items-center gap-8 py-16 md:grid-cols-[auto_1fr_auto] md:gap-12">
          <img
            src={teamPrincipal.image}
            alt={teamPrincipal.name}
            width={128}
            height={128}
            loading="lazy"
            decoding="async"
            className="size-28 rounded-full object-cover ring-2 ring-racing-yellow md:size-32"
          />
          <div>
            <p className="readout text-racing-yellow">{teamPrincipal.title}</p>
            <h2 className="heading-font lean mt-2 text-4xl font-bold uppercase leading-none text-white md:text-6xl">
              {teamPrincipal.name}
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-carbon-300">
              Leading Chennai Turbo Riders&apos; charge to put Indian motorsport on the global map —
              from the first car in {site.founded} to a grid of eight across two championships.
            </p>
          </div>
          <blockquote className="heading-font max-w-xs border-l-2 border-racing-yellow pl-5 text-xl font-medium italic leading-snug text-carbon-100 md:text-2xl">
            “{site.tagline}”
          </blockquote>
        </Reveal>
      </section>

      {/* Journey */}
      <section className="section-container py-16 md:py-24">
        <SectionHeading index="02" label={`Since ${site.founded}`} title="Our Journey" />
        <ol className="mt-14 grid gap-px border border-white/10 bg-white/10 md:grid-cols-2 lg:grid-cols-4">
          {[...achievements].reverse().map((a, i) => (
            <Reveal
              key={a.id}
              as="li"
              delay={i * 0.06}
              className="group flex flex-col bg-carbon-950 p-6 md:min-h-[280px]"
            >
              <span className="heading-font lean text-6xl font-bold leading-none text-racing-yellow">
                {a.year}
              </span>
              <span className="mt-4 h-px w-10 bg-white/20 transition-[width] duration-500 group-hover:w-full group-hover:bg-racing-yellow" />
              <h3 className="heading-font mt-auto pt-8 text-2xl font-bold uppercase leading-tight text-white">
                {a.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-carbon-300">{a.description}</p>
            </Reveal>
          ))}
        </ol>
      </section>
    </>
  );
}
