import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SocialIcon } from "@/components/ui/SocialIcon";
import { TextMarquee } from "@/components/site/TextMarquee";
import { siteTeam } from "@/lib/server/siteContent";

const nav = [
  { href: "/about", label: "Team" },
  { href: "/drivers", label: "Drivers" },
  { href: "/schedule", label: "Calendar" },
  { href: "/news", label: "News" },
  { href: "/sponsors", label: "Partners" },
];

/**
 * The foot of every page.
 *
 * The call to partner across the top, the two marquee rows of the tagline
 * and the name, then the practical columns, then a mono status strip along
 * the bottom edge — the last line of a broadcast, all systems go.
 */
export async function Footer() {
  const { site, contact, socialMedia } = await siteTeam();
  const year = new Date().getFullYear();

  /*
   * Built here rather than at module scope, which is where it used to be:
   * the four addresses are rows now, so there is nothing to read until the
   * request has one.
   *
   * A blank address is dropped rather than rendered as `href=""`, which is a
   * link back to the current page wearing a social icon. That is what makes an
   * empty column in the console mean “we are not on X” — see the note on the
   * social columns in migration 0024.
   */
  const socials = (
    [
      { href: socialMedia.instagram, name: "instagram", label: "Instagram" },
      { href: socialMedia.facebook, name: "facebook", label: "Facebook" },
      { href: socialMedia.twitter, name: "twitter", label: "X" },
      { href: socialMedia.youtube, name: "youtube", label: "YouTube" },
    ] as const
  ).filter((s) => s.href);

  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-carbon-950">
      <div className="hud-grid pointer-events-none absolute inset-0" />

      {/* Partner call */}
      <div className="section-container relative flex flex-col gap-8 py-16 md:flex-row md:items-end md:justify-between md:py-24">
        <div>
          <p className="readout text-racing-yellow">Partner with the team</p>
          <h2 className="heading-font lean mt-4 max-w-3xl text-5xl font-bold uppercase leading-[0.88] text-white md:text-7xl">
            Put your name on India&rsquo;s fastest grid.
          </h2>
        </div>
        <a href={`mailto:${contact.email}`} className="btn-primary shrink-0 self-start md:self-auto">
          <span>Talk to us</span>
          <ArrowUpRight className="size-4" />
        </a>
      </div>

      <TextMarquee
        primary={site.tagline.replace(/\.$/, "")}
        secondary={site.name}
        className="border-y border-white/10"
      />

      {/* Columns */}
      <div className="section-container relative grid gap-12 py-14 md:grid-cols-[1.4fr_1fr_1fr] md:gap-8">
        <div>
          <div className="flex items-center gap-3">
            <img
              src="/images/logos/CTR_New_yellow.png"
              alt=""
              width={48}
              height={48}
              className="h-12 w-auto"
              loading="lazy"
              decoding="async"
            />
            <span className="heading-font flex flex-col leading-none">
              <span className="text-base font-bold uppercase tracking-[0.18em] text-white">Chennai Turbo</span>
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-racing-yellow">Riders</span>
            </span>
          </div>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-carbon-300">{site.description}</p>
          <ul className="mt-6 flex gap-2">
            {socials.map((s) => (
              <li key={s.label}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={s.label}
                  className="flex size-10 items-center justify-center rounded-full border border-white/15 text-carbon-200 transition-colors hover:border-racing-yellow hover:bg-racing-yellow hover:text-carbon-950"
                >
                  <SocialIcon name={s.name} className="size-4" />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <nav aria-labelledby="footer-explore">
          <h3 id="footer-explore" className="readout">
            Explore
          </h3>
          <ul className="mt-5 space-y-3">
            {nav.map((l, i) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="group inline-flex items-baseline gap-3 heading-font text-xl font-bold uppercase text-white transition-colors hover:text-racing-yellow"
                >
                  <span className="readout text-[10px] group-hover:text-racing-yellow">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <address className="not-italic">
          <h3 className="readout">Contact</h3>
          <ul className="mt-5 space-y-4 text-sm text-carbon-200">
            <li>
              <p className="readout text-[10px]">Email</p>
              <a href={`mailto:${contact.email}`} className="mt-1 block hover:text-racing-yellow">
                {contact.email}
              </a>
            </li>
            <li>
              <p className="readout text-[10px]">Phone</p>
              <a
                href={`tel:${contact.phone.replace(/\s+/g, "")}`}
                className="mt-1 block hover:text-racing-yellow"
              >
                {contact.phone}
              </a>
            </li>
            <li>
              <p className="readout text-[10px]">Paddock</p>
              <p className="mt-1 leading-relaxed">{contact.address}</p>
            </li>
          </ul>
        </address>
      </div>

      {/* Status strip */}
      <div className="relative border-t border-white/10">
        <div className="section-container readout flex flex-col justify-between gap-2 py-5 text-[10px] sm:flex-row sm:items-center">
          <p>
            © {year} {site.name} · All rights reserved
          </p>
          <p className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-racing-yellow animate-blink" />
            All systems go · Chennai, IN
          </p>
        </div>
      </div>
    </footer>
  );
}
