import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { driverHref } from "@/lib/team";
import type { Driver } from "@/types/site";

/**
 * One driver as a poster.
 *
 * Tall, the portrait in grayscale under a dark wash, the car number set at a
 * size that makes it the picture's frame, the name leaning forward along the
 * bottom edge and three readouts underneath. Colour arrives on hover. It is
 * the same block whether it stands in the roster grid or rides in the reel.
 */
export function DriverPoster({
  driver,
  index,
  className = "",
  eager = false,
}: {
  driver: Driver;
  index?: number;
  className?: string;
  eager?: boolean;
}) {
  return (
    <Link
      href={driverHref(driver)}
      className={`group relative block overflow-hidden bg-carbon-900 ${className}`}
      aria-label={`${driver.firstName} ${driver.lastName}, #${driver.number}`}
    >
      <img
        src={driver.image}
        alt=""
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-top grayscale brightness-[0.8] transition-[transform,filter] duration-700 ease-out group-hover:scale-[1.04] group-hover:grayscale-0 group-hover:brightness-100 group-focus-visible:grayscale-0"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-carbon-950 via-carbon-950/20 to-carbon-950/30" />
      <div className="grain absolute inset-0 opacity-30" />

      {/* Top: number and index */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <span className="heading-font lean text-[6rem] font-bold leading-[0.8] text-white/80 transition-colors group-hover:text-racing-yellow md:text-[7.5rem]">
          {driver.number}
        </span>
        <span className="readout mt-1 flex flex-col items-end gap-1 text-[10px]">
          {index !== undefined ? <span>{String(index + 1).padStart(2, "0")}</span> : null}
          <span className="bg-racing-yellow px-1.5 py-0.5 font-semibold text-carbon-950">
            {driver.championship ?? driver.car}
          </span>
        </span>
      </div>

      {/* Bottom: name and readouts */}
      <div className="absolute inset-x-0 bottom-0 p-4 md:p-5">
        <p className="readout text-[10px]">
          {driver.flagEmoji} {driver.nationality}
        </p>
        <h3 className="heading-font lean mt-1 text-3xl font-bold uppercase leading-[0.88] text-white md:text-4xl">
          {driver.firstName}
          <br />
          <span className="text-racing-yellow">{driver.lastName}</span>
        </h3>
        <dl className="mt-4 grid grid-cols-3 gap-px border-t border-white/15 pt-3">
          {[
            { l: "Pts", v: driver.stats.points },
            { l: "Wins", v: driver.stats.raceWins },
            { l: "Podiums", v: driver.stats.podiums },
          ].map((s) => (
            <div key={s.l}>
              <dd className="heading-font text-xl font-bold leading-none text-white">{s.v}</dd>
              <dt className="readout mt-1 text-[9px]">{s.l}</dt>
            </div>
          ))}
        </dl>
      </div>

      <span className="absolute bottom-4 right-4 flex size-9 items-center justify-center rounded-full border border-white/25 text-white transition-colors group-hover:border-racing-yellow group-hover:bg-racing-yellow group-hover:text-carbon-950 md:bottom-5 md:right-5">
        <ArrowUpRight className="size-4" />
      </span>
    </Link>
  );
}
