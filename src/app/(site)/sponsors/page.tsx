import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { LogoMarquee } from "@/components/site/LogoMarquee";
import { PageHeader } from "@/components/site/PageHeader";
import { Reveal } from "@/components/site/Reveal";
import { siteSponsors, siteTeam } from "@/lib/server/siteContent";
import { SPONSOR_TIER_LABELS, SPONSOR_TIERS, type Sponsor } from "@/types/site";

export const metadata: Metadata = {
  title: "Partners",
  description: "The partners and sponsors powering Chennai Turbo Riders.",
};

export default async function SponsorsPage() {
  const [sponsors, { site, contact }] = await Promise.all([siteSponsors(), siteTeam()]);

  /*
   * All four tiers here, unlike the band on the home page, which shows three.
   * This is the full board, so a technical partner belongs on it — and the
   * labels come from SPONSOR_TIER_LABELS rather than being written out again,
   * so the console and the page call a tier the same thing.
   */
  const tiers: { label: string; items: Sponsor[] }[] = SPONSOR_TIERS.map((tier) => ({
    label: SPONSOR_TIER_LABELS[tier],
    items: sponsors[tier],
  }));

  const all = tiers.flatMap((tier) => tier.items);
  const items = all.map((s) => ({ id: s.id, label: s.name, href: s.website, logo: s.logo }));

  return (
    <>
      <PageHeader
        crumb="Partners"
        title="Our Partners"
        description="Chennai Turbo Riders is proudly powered by organisations that share our drive for excellence."
        aside={`${all.length} partners`}
      />

      <Reveal className="border-y border-white/10">
        <LogoMarquee label="Partners" items={items} speed={36} />
      </Reveal>

      <div className="section-container space-y-24 py-16 md:py-24">
        {tiers.map(
          (tier, ti) =>
            tier.items.length > 0 && (
              <section key={tier.label} aria-labelledby={`tier-${ti}`}>
                <Reveal className="mb-8 border-b border-white/10 pb-4">
                  <p className="readout">
                    <span className="text-racing-yellow">{String(ti + 1).padStart(2, "0")}</span>
                    <span className="mx-2 text-carbon-400">/</span>
                    Tier
                  </p>
                  <h2
                    id={`tier-${ti}`}
                    className="heading-font lean mt-2 text-4xl font-bold uppercase leading-none text-white md:text-5xl"
                  >
                    {tier.label}
                  </h2>
                </Reveal>
                <div className="grid gap-px border border-white/10 bg-white/10 md:grid-cols-2">
                  {tier.items.map((s, i) => (
                    <Reveal
                      key={s.id}
                      delay={i * 0.06}
                      className="group grid gap-6 bg-carbon-950 p-6 sm:grid-cols-[10rem_1fr] sm:items-center md:p-8"
                    >
                      <div className="flex h-24 items-center justify-center bg-white p-4">
                        <img
                          src={s.fullLogo ?? s.logo}
                          alt={s.name}
                          loading="lazy"
                          decoding="async"
                          className="max-h-16 w-auto max-w-full object-contain"
                        />
                      </div>
                      <div>
                        <h3 className="heading-font text-2xl font-bold uppercase leading-tight text-white">{s.name}</h3>
                        {s.description ? (
                          <p className="mt-2 text-sm leading-relaxed text-carbon-300">{s.description}</p>
                        ) : null}
                        <a
                          href={s.website}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-4 inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-racing-yellow"
                        >
                          Visit website
                          <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </a>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </section>
            ),
        )}

        <Reveal className="hud-corners grid gap-6 p-8 md:grid-cols-[1fr_auto] md:items-center md:p-12">
          <div>
            <p className="readout text-racing-yellow">Become a partner</p>
            <h2 className="heading-font lean mt-3 text-4xl font-bold uppercase leading-[0.9] text-white md:text-6xl">
              Race with us in Season {site.currentSeason}.
            </h2>
          </div>
          <a href={`mailto:${contact.email}`} className="btn-primary self-start">
            <span>{contact.email}</span>
            <ArrowUpRight className="size-4" />
          </a>
        </Reveal>
      </div>
    </>
  );
}
