import Link from "next/link";
import { ArrowUpRight, Trophy } from "lucide-react";

/**
 * One driver in one season's lineup.
 *
 * The roster poster's shape, but the numbers are THAT season's — a 2022 page
 * showing somebody's career totals would be quietly wrong. Drivers with a
 * profile bring their portrait and link to it; the ones who raced before the
 * site had profiles get their initials in its place, so the grid stays even.
 */
export function LineupCard({
  name,
  nationality,
  league,
  points,
  image,
  href,
  champion = false,
}: {
  name: string;
  nationality: string;
  league: string;
  points: number | null;
  image?: string;
  href?: string;
  champion?: boolean;
}) {
  const parts = name.trim().split(/\s+/);
  const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
  const last = parts[parts.length - 1] ?? "";
  const initials = parts.map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  const body = (
    <>
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-top grayscale brightness-[0.8] transition-[transform,filter] duration-700 ease-out group-hover:scale-[1.04] group-hover:grayscale-0 group-hover:brightness-100"
        />
      ) : (
        <span
          aria-hidden
          className="heading-font lean absolute inset-0 flex items-center justify-center text-[7rem] font-bold leading-none text-white/[0.06] md:text-[9rem]"
        >
          {initials}
        </span>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-carbon-950 via-carbon-950/20 to-carbon-950/30" />
      <div className="hud-grid pointer-events-none absolute inset-0 opacity-40" />

      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
        {champion ? (
          <span className="readout flex items-center gap-1.5 bg-racing-yellow px-1.5 py-0.5 text-[10px] font-semibold text-carbon-950">
            <Trophy className="size-3" /> Champion
          </span>
        ) : (
          <span />
        )}
        <span className="readout bg-racing-yellow px-1.5 py-0.5 text-[10px] font-semibold text-carbon-950">{league}</span>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4 md:p-5">
        {nationality ? <p className="readout text-[10px]">{nationality}</p> : null}
        <h3 className="heading-font lean mt-1 text-2xl font-bold uppercase leading-[0.88] text-white md:text-3xl">
          {first ? (
            <>
              {first}
              <br />
            </>
          ) : null}
          <span className="text-racing-yellow">{last}</span>
        </h3>
        <div className="mt-4 border-t border-white/15 pt-3">
          <p className="heading-font text-xl font-bold leading-none text-white">
            {points == null ? "—" : Number.isInteger(points) ? points : points.toFixed(1)}
          </p>
          <p className="readout mt-1 text-[9px]">Season points</p>
        </div>
      </div>

      {href ? (
        <span className="absolute bottom-4 right-4 flex size-9 items-center justify-center rounded-full border border-white/25 text-white transition-colors group-hover:border-racing-yellow group-hover:bg-racing-yellow group-hover:text-carbon-950 md:bottom-5 md:right-5">
          <ArrowUpRight className="size-4" />
        </span>
      ) : null}
    </>
  );

  const frame = "group relative block aspect-[3/4.4] overflow-hidden border border-white/10 bg-carbon-900";

  return href ? (
    <Link href={href} className={frame} aria-label={`${name} — profile`}>
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  );
}
