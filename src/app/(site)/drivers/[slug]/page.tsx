import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Quote } from "lucide-react";
import { Counter } from "@/components/site/Counter";
import { Reveal } from "@/components/site/Reveal";
import { siteDriver, siteDrivers, siteTeam } from "@/lib/server/siteContent";
import { driverHref, driverName } from "@/lib/team";
import type { DriverStats } from "@/types/site";

/*
 * The addresses to pre-render, read from the database at build time.
 *
 * Async now, where it used to map over an imported array. Everything else
 * about the route is unchanged: it is still an SSG page with one HTML file per
 * driver, and `revalidateDriverPages` throws them away when the console saves.
 */
export async function generateStaticParams() {
  const drivers = await siteDrivers();
  return drivers.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const driver = await siteDriver(slug);
  if (!driver) return { title: "Driver" };
  return {
    title: driverName(driver),
    description: driver.biography.slice(0, 155),
  };
}

const statLabels: { key: keyof DriverStats; label: string }[] = [
  { key: "grandPrix", label: "Grands Prix" },
  { key: "raceWins", label: "Wins" },
  { key: "podiums", label: "Podiums" },
  { key: "polePositions", label: "Poles" },
  { key: "fastestLaps", label: "Fastest Laps" },
  { key: "points", label: "Points" },
];

export default async function DriverPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  /*
   * The whole roster, not just this driver: the foot of the page links to the
   * one before and the one after, so the list is needed either way. Both reads
   * are memoised for the request and `siteDriver` resolves through the same
   * list, so this is one query rather than three.
   */
  const [drivers, { site }] = await Promise.all([siteDrivers(), siteTeam()]);

  const index = drivers.findIndex((d) => d.slug === slug);
  if (index === -1) notFound();

  const driver = drivers[index];
  const prev = drivers[(index - 1 + drivers.length) % drivers.length];
  const next = drivers[(index + 1) % drivers.length];

  return (
    <article>
      {/* Title card */}
      <section className="relative overflow-hidden bg-carbon-950 pt-28 md:pt-32">
        <div className="hud-grid pointer-events-none absolute inset-0" />
        <span
          aria-hidden
          className="heading-font lean pointer-events-none absolute -right-4 top-8 select-none text-[46vw] font-bold leading-none text-white/[0.035] md:-right-8 md:top-0 md:text-[30rem]"
        >
          {driver.number}
        </span>

        <div className="section-container relative grid items-end gap-8 md:grid-cols-[1.2fr_1fr]">
          <div className="pb-10 md:pb-16">
            <Link
              href="/drivers"
              className="readout inline-flex items-center gap-2 transition-colors hover:text-racing-yellow"
            >
              <ArrowLeft className="size-4" /> All drivers
            </Link>

            <p className="readout mt-10">
              <span className="text-racing-yellow">{site.abbreviation}</span>
              <span className="mx-2 text-carbon-400">/</span>
              {driver.championship ?? driver.car}
              <span className="mx-2 text-carbon-400">/</span>
              {driver.flagEmoji} {driver.nationality}
            </p>

            <h1 className="heading-font lean mt-4 text-[clamp(3.5rem,12vw,9rem)] font-bold uppercase leading-[0.82] tracking-tight text-white">
              {driver.firstName}
              <br />
              <span className="text-stroke-white">{driver.lastName}</span>
            </h1>

            <dl className="mt-8 grid max-w-md grid-cols-3 gap-px border border-white/10 bg-white/10">
              {[
                { l: "Car No.", v: `#${driver.number}` },
                { l: "Height", v: driver.height },
                { l: "Weight", v: driver.weight },
              ].map((f) => (
                <div key={f.l} className="bg-carbon-950 p-4">
                  <dt className="readout text-[10px]">{f.l}</dt>
                  <dd className="heading-font mt-1 text-2xl font-bold leading-none text-white">{f.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative mx-auto h-[48vh] w-full max-w-sm md:h-[62vh]">
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-carbon-950 to-transparent" />
            <img
              src={driver.heroImage}
              alt={`${driver.firstName} ${driver.lastName}`}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="h-full w-full object-contain object-bottom"
            />
          </div>
        </div>
      </section>

      {/* Telemetry */}
      <section className="border-y border-white/10 bg-carbon-900/50">
        <dl className="section-container grid grid-cols-3 gap-px bg-white/10 md:grid-cols-6">
          {statLabels.map((s) => (
            <div key={s.key} className="bg-carbon-950 py-8 text-center">
              <dd className="heading-font text-4xl font-bold leading-none text-racing-yellow md:text-5xl">
                <Counter value={String(driver.stats[s.key])} />
              </dd>
              <dt className="readout mt-2 text-[10px]">{s.label}</dt>
            </div>
          ))}
        </dl>
      </section>

      {/* Bio + highlights */}
      <section className="section-container grid gap-12 py-16 md:grid-cols-[1.4fr_1fr] md:gap-16 md:py-24">
        <Reveal>
          <blockquote className="hud-corners p-6">
            <Quote className="mb-3 size-6 text-racing-yellow" />
            <p className="heading-font text-2xl font-medium italic leading-snug text-white md:text-3xl">
              “{driver.quote}”
            </p>
          </blockquote>
          <h2 className="readout mt-12 text-racing-yellow">Biography</h2>
          <p className="mt-4 text-base leading-relaxed text-carbon-200 md:text-lg">{driver.biography}</p>
        </Reveal>

        <Reveal delay={0.1}>
          <h2 className="readout text-racing-yellow">Career highlights</h2>
          <ol className="mt-4 border-t border-white/10">
            {driver.careerHighlights.map((h, i) => (
              <li key={h} className="flex gap-5 border-b border-white/10 py-4">
                <span className="readout pt-0.5">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-sm leading-relaxed text-carbon-100">{h}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      {/* Previous / next */}
      <nav aria-label="Other drivers" className="border-t border-white/10">
        <div className="section-container grid divide-y divide-white/10 md:grid-cols-2 md:divide-x md:divide-y-0">
          <Link href={driverHref(prev)} className="group flex items-center gap-5 py-8 md:pr-8">
            <ArrowLeft className="size-5 shrink-0 text-carbon-400 transition-[transform,color] group-hover:-translate-x-1 group-hover:text-racing-yellow" />
            <div>
              <p className="readout text-[10px]">Previous</p>
              <p className="heading-font lean mt-1 text-2xl font-bold uppercase leading-none text-white md:text-3xl">
                <span className="text-carbon-400">{String(prev.number).padStart(2, "0")}</span>{" "}
                {prev.firstName} {prev.lastName}
              </p>
            </div>
          </Link>
          <Link
            href={driverHref(next)}
            className="group flex items-center justify-end gap-5 py-8 text-right md:pl-8"
          >
            <div>
              <p className="readout text-[10px]">Next</p>
              <p className="heading-font lean mt-1 text-2xl font-bold uppercase leading-none text-white md:text-3xl">
                {next.firstName} {next.lastName}{" "}
                <span className="text-carbon-400">{String(next.number).padStart(2, "0")}</span>
              </p>
            </div>
            <ArrowRight className="size-5 shrink-0 text-carbon-400 transition-[transform,color] group-hover:translate-x-1 group-hover:text-racing-yellow" />
          </Link>
        </div>
      </nav>
    </article>
  );
}
