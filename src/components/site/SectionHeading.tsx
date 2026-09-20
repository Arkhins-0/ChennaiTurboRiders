import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Reveal } from "./Reveal";

/**
 * How every band opens.
 *
 * A mono readout on the left — index, label — like the lower-third of a
 * broadcast; a headline leaning forward under it; an optional link sitting on
 * the same baseline at the right. Centred variant for the bands that want to
 * be symmetrical.
 */
export function SectionHeading({
  index,
  label,
  title,
  action,
  align = "left",
  className = "",
}: {
  index?: string;
  label?: string;
  title: string;
  action?: { href: string; label: string };
  align?: "left" | "center";
  className?: string;
}) {
  const centered = align === "center";

  return (
    <Reveal
      className={`flex flex-col gap-6 ${
        centered ? "items-center text-center" : "md:flex-row md:items-end md:justify-between"
      } ${className}`}
    >
      <div className={centered ? "flex flex-col items-center" : ""}>
        {(index || label) && (
          <p className="readout mb-4 flex items-center gap-3">
            {index ? <span className="text-racing-yellow">{index}</span> : null}
            {index && label ? <span className="h-px w-6 bg-racing-yellow/60" /> : null}
            {label ? <span>{label}</span> : null}
          </p>
        )}
        <h2 className="heading-font lean text-5xl font-bold uppercase leading-[0.88] tracking-tight text-white sm:text-6xl md:text-7xl">
          {title}
        </h2>
      </div>

      {action ? (
        <Link
          href={action.href}
          className="group inline-flex items-center gap-2 self-start font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-white md:self-auto"
        >
          <span className="border-b border-white/25 pb-1 transition-colors group-hover:border-racing-yellow group-hover:text-racing-yellow">
            {action.label}
          </span>
          <ArrowUpRight className="size-4 text-racing-yellow transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      ) : null}
    </Reveal>
  );
}
