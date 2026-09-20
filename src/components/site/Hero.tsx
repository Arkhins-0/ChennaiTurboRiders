"use client";

import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { Counter } from "@/components/site/Counter";
import type { CarSpecs, HeroData, SiteConfig } from "@/types/site";

const ease = [0.22, 1, 0.36, 1] as const;
const words = ["Chennai", "Turbo", "Riders"];

/**
 * The opening: the onboard feed.
 *
 * The video runs at full strength under scanlines and grain, framed by the
 * readouts a broadcast puts in the corners — season, live marker, the
 * coordinates of the city, the founding year. The team's name arrives one
 * word at a time, wiped in from below, leaning forward; the middle word is
 * outlined so the three read as one mark rather than a list. The season's
 * numbers count up along the baseline. Everything drifts up and fades as the
 * page is scrolled, so the next band arrives over it.
 */
/*
 * Its content arrives as props, not as an import.
 *
 * This is a "use client" component — the video, the scroll transform and the
 * reduced-motion check all need the browser — so it cannot await a repo. The
 * home page reads the three it needs and hands them down, which is the shape
 * every client component in the (site) tree uses now that the content is in
 * the database rather than in a file that could be imported from anywhere.
 */
export function Hero({
  site,
  hero,
  /* The car, for the still behind the video and for its poster frame. */
  car,
}: {
  site: SiteConfig;
  hero: HeroData;
  car: CarSpecs;
}) {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, reduced ? 0 : 140]);
  const opacity = useTransform(scrollY, [0, 500], [1, reduced ? 1 : 0.15]);

  const up = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.8, ease },
        };

  return (
    <section className="relative flex min-h-[100svh] flex-col overflow-hidden bg-carbon-950 text-white">
      {/* The feed */}
      <div className="absolute inset-0">
        <img
          src={car.image}
          alt=""
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="h-full w-full object-cover object-[65%_center]"
        />
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden
          poster={car.image}
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src={hero.videoSrc} type="video/mp4" />
        </video>
        <div className="scanlines absolute inset-0 opacity-60" />
        <div className="grain absolute inset-0 opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-r from-carbon-950/90 via-carbon-950/40 to-carbon-950/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-carbon-950 via-carbon-950/10 to-carbon-950/70" />
        {/* The sweep of a camera's refresh */}
        {reduced ? null : (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 animate-scan bg-gradient-to-b from-transparent via-racing-yellow/[0.06] to-transparent" />
        )}
      </div>

      {/* Corner readouts */}
      <div className="section-container pointer-events-none absolute inset-x-0 top-24 z-10 flex justify-between md:top-28">
        <motion.p {...up(0.9)} className="readout whitespace-nowrap text-[10px] md:text-[11px]">
          <span className="text-racing-yellow">{site.abbreviation}</span> // S
          {String(site.currentSeason).padStart(2, "0")}
        </motion.p>
        <motion.p {...up(1.0)} className="readout flex items-center gap-2 whitespace-nowrap text-[10px] md:text-[11px]">
          <span className="size-1.5 rounded-full bg-red-500 animate-blink" />
          Live<span className="hidden sm:inline"> · {site.championship.split(" (")[0]}</span>
        </motion.p>
      </div>

      {/* Copy */}
      <motion.div
        style={{ y, opacity }}
        className="section-container relative z-10 flex flex-1 flex-col justify-end pb-6 pt-36 md:pb-8"
      >
        <motion.p {...up(0.1)} className="readout mb-6 flex items-center gap-3 text-racing-yellow">
          <span className="h-px w-10 bg-racing-yellow" />
          {hero.description}
        </motion.p>

        <h1 className="heading-font lean text-[clamp(3.5rem,12vw,10rem)] font-bold uppercase leading-[0.82] tracking-tight">
          {words.map((word, i) => (
            <span key={word} className="block overflow-hidden pb-[0.06em]">
              <motion.span
                initial={reduced ? false : { y: "110%" }}
                animate={{ y: 0 }}
                transition={{ delay: 0.25 + i * 0.12, duration: 0.9, ease }}
                className={`block ${i === 1 ? "text-stroke-white" : i === 2 ? "text-racing-yellow" : ""}`}
              >
                {word}
              </motion.span>
            </span>
          ))}
        </h1>

        <div className="mt-8 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
          <motion.div {...up(0.7)}>
            <p className="heading-font max-w-md text-lg font-semibold uppercase tracking-[0.2em] text-carbon-200 md:text-xl">
              {hero.subtitle}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/drivers" className="btn-primary">
                <span>Meet the grid</span>
                <ArrowUpRight className="size-4" />
              </Link>
              <Link href="/schedule" className="btn-ghost">
                Season {site.currentSeason} calendar
              </Link>
            </div>
          </motion.div>

          <motion.div {...up(0.9)} className="readout hidden items-center gap-3 md:flex">
            Scroll
            <ArrowDown className="size-4 animate-bounce text-racing-yellow" />
          </motion.div>
        </div>
      </motion.div>

      {/* Baseline: numbers and coordinates */}
      <motion.div {...up(1.0)} className="section-container relative z-10 pb-6">
        <dl className="grid grid-cols-2 gap-px border border-white/10 bg-white/10 sm:grid-cols-4">
          {hero.stats.map((s) => (
            <div key={s.label} className="bg-carbon-950/70 px-4 py-4 backdrop-blur-sm sm:px-5">
              <dt className="readout text-[10px]">{s.label}</dt>
              <dd className="heading-font mt-1 text-4xl font-bold leading-none text-white md:text-5xl">
                <Counter value={s.value} />
              </dd>
            </div>
          ))}
        </dl>
        <div className="readout mt-4 flex flex-wrap justify-between gap-3 text-[10px]">
          <span>13.0827° N · 80.2707° E · Chennai, IN</span>
          <span>Est. {site.founded}</span>
        </div>
      </motion.div>
    </section>
  );
}
