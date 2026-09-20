import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Counter } from "@/components/site/Counter";
import { Reveal } from "@/components/site/Reveal";
import { SectionHeading } from "@/components/site/SectionHeading";
import { siteTeam } from "@/lib/server/siteContent";

export async function AboutSection() {
  const { about, site, teamPrincipal } = await siteTeam();

  return (
    <section id="about" className="relative overflow-hidden py-24 md:py-32">
      <div className="hud-grid pointer-events-none absolute inset-0" />
      <div className="section-container relative">
        <SectionHeading
          index="01"
          label={about.subtitle}
          title={about.title}
          action={{ href: "/about", label: "The full story" }}
        />

        <div className="mt-14 grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          <Reveal className="hud-corners p-3">
            <div className="relative aspect-[4/3] overflow-hidden bg-carbon-900">
              <img
                src={about.image}
                alt={`${site.name} team`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover grayscale-[0.3] transition-[filter] duration-700 hover:grayscale-0"
              />
              <div className="grain absolute inset-0 opacity-30" />
              <div className="absolute inset-0 bg-gradient-to-t from-carbon-950/90 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 flex items-center gap-3 p-5">
                <img
                  src={teamPrincipal.image}
                  alt=""
                  width={48}
                  height={48}
                  loading="lazy"
                  decoding="async"
                  className="size-12 rounded-full object-cover ring-2 ring-racing-yellow"
                />
                <div>
                  <p className="heading-font text-base font-bold uppercase leading-none text-white">
                    {teamPrincipal.name}
                  </p>
                  <p className="readout mt-1 text-[10px] text-racing-yellow">{teamPrincipal.title}</p>
                </div>
              </div>
            </div>
            <p className="readout mt-3 flex justify-between text-[10px]">
              <span>Fig. 01 — The paddock</span>
              <span>Est. {site.founded}</span>
            </p>
          </Reveal>

          <div className="flex flex-col justify-between gap-10">
            <Reveal delay={0.1}>
              <p className="heading-font text-2xl font-semibold leading-snug text-white md:text-[2rem] md:leading-tight">
                {about.description}
              </p>
              <p className="mt-6 text-base leading-relaxed text-carbon-300">{about.description2}</p>
              <Link
                href="/about"
                className="group mt-6 inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-racing-yellow"
              >
                About the team
                <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </Reveal>

            <Reveal delay={0.2}>
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
      </div>
    </section>
  );
}
