import { LogoMarquee } from "@/components/site/LogoMarquee";
import { Reveal } from "@/components/site/Reveal";
import { SectionHeading } from "@/components/site/SectionHeading";
import { siteSponsors } from "@/lib/server/siteContent";
import type { Sponsor } from "@/types/site";

export async function SponsorsSection() {
  const sponsors = await siteSponsors();

  /*
   * The marquee shows the three top tiers and not `technical`, which is the
   * set this band has always drawn. The full four are on /sponsors.
   */
  const tiers: { label: string; items: Sponsor[] }[] = [
    { label: "Title Partner", items: sponsors.title },
    { label: "Principal Partner", items: sponsors.principal },
    { label: "Official Partners", items: sponsors.official },
  ];

  const all = tiers.flatMap((tier) => tier.items);

  // No partners yet: a marquee of nothing scrolls an empty strip forever.
  if (all.length === 0) return null;

  const items = all.map((s) => ({ id: s.id, label: s.name, href: s.website, logo: s.logo }));

  return (
    <section id="sponsors" className="relative border-t border-white/10 py-24 md:py-32">
      <div className="section-container">
        <SectionHeading
          index="06"
          label="Backed By The Best"
          title="Our Partners"
          action={{ href: "/sponsors", label: "All partners" }}
        />
      </div>

      <Reveal className="mt-14 border-y border-white/10">
        <LogoMarquee label="Partners" items={items} speed={36} />
        <LogoMarquee label="Partners, reversed" items={[...items].reverse()} direction="right" speed={28} className="border-t border-white/10" />
      </Reveal>

      <div className="section-container mt-4">
        <Reveal delay={0.1} className="grid gap-px border border-white/10 bg-white/10 md:grid-cols-3">
          {tiers.map((tier, i) => (
            <div key={tier.label} className="bg-carbon-950 p-6">
              <p className="readout">
                <span className="text-racing-yellow">{String(i + 1).padStart(2, "0")}</span>
                <span className="mx-2 text-carbon-400">/</span>
                {tier.label}
              </p>
              <ul className="mt-4 space-y-2">
                {tier.items.map((s) => (
                  <li key={s.id}>
                    <a
                      href={s.website}
                      target="_blank"
                      rel="noreferrer"
                      className="heading-font text-xl font-bold uppercase leading-tight text-white transition-colors hover:text-racing-yellow"
                    >
                      {s.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
