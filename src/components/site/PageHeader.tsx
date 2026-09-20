import { siteTeam } from "@/lib/server/siteContent";

/**
 * The top of every inner page, dressed as a broadcast title card.
 *
 * A mono breadcrumb along the top edge, corner brackets framing the block,
 * the title leaning forward at the largest size the screen allows, and the
 * standfirst set to the right. The grid behind it fades out towards the edges
 * so it reads as a surface, not a spreadsheet.
 */
export async function PageHeader({
  crumb,
  title,
  description,
  aside,
}: {
  /** The mono line — "Drivers", "News". Prefixed with the team's initials. */
  crumb: string;
  title: string;
  description?: string;
  /** A short fact set on the right — "8 drivers", "Season 6". */
  aside?: string;
}) {
  // The team's initials, for the breadcrumb. One read per request: `siteTeam`
  // is memoised, and every page on the site draws this header.
  const { site } = await siteTeam();

  return (
    <section className="relative overflow-hidden bg-carbon-950 pb-14 pt-32 md:pb-20 md:pt-44">
      <div className="hud-grid pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -left-32 top-1/2 size-[30rem] -translate-y-1/2 rounded-full bg-racing-yellow/[0.07] blur-[140px]" />

      <div className="section-container relative">
        <div className="hud-corners px-5 py-6 md:px-8 md:py-8">
          <div className="readout flex flex-wrap items-center justify-between gap-3">
            <span>
              <span className="text-racing-yellow">{site.abbreviation}</span>
              <span className="mx-2 text-carbon-400">/</span>
              {crumb}
            </span>
            {aside ? <span>{aside}</span> : null}
          </div>

          <div className="mt-8 grid items-end gap-8 md:grid-cols-[1.5fr_1fr] md:gap-12">
            <h1 className="heading-font lean text-[clamp(3.25rem,11vw,8.5rem)] font-bold uppercase leading-[0.85] tracking-tight text-white">
              {title}
            </h1>
            {description ? (
              <p className="max-w-md text-base leading-relaxed text-carbon-300 md:justify-self-end md:pb-2 md:text-lg">
                {description}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
