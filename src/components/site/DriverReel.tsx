"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { DriverPoster } from "@/components/site/DriverPoster";
import type { Driver } from "@/types/site";

/**
 * The grid walk.
 *
 * On a wide screen the section pins itself and the posters travel sideways
 * as the page is scrolled down — the pit lane seen from the pit wall. The
 * distance they travel is measured, not guessed: the track's real width less
 * the window's, so the last poster stops flush with the right edge.
 *
 * On a phone, and under reduced motion, it is an ordinary row that scrolls
 * sideways with a flick and snaps to each poster. Same posters, same order.
 */
export function DriverReel({ drivers, header }: { drivers: Driver[]; header: React.ReactNode }) {
  const reduced = useReducedMotion();
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const update = () => setPinned(wide.matches && !reduced);
    update();
    wide.addEventListener("change", update);
    return () => wide.removeEventListener("change", update);
  }, [reduced]);

  if (!pinned) {
    return (
      <div>
        <div className="section-container">{header}</div>
        <div className="rail-scroll mt-10 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-4 md:px-8">
          {drivers.map((driver, i) => (
            <DriverPoster
              key={driver.id}
              driver={driver}
              index={i}
              className="h-[70vh] min-h-[420px] w-[78vw] shrink-0 snap-start sm:w-[46vw] md:w-[36vw]"
            />
          ))}
        </div>
      </div>
    );
  }

  return <PinnedReel drivers={drivers} header={header} />;
}

/**
 * The pinned version, its own component so the scroll target ref exists on
 * the first render that asks for it.
 */
function PinnedReel({ drivers, header }: { drivers: Driver[]; header: React.ReactNode }) {
  const [travel, setTravel] = useState(0);
  const section = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!track.current) return;
    const measure = () => {
      const width = track.current?.scrollWidth ?? 0;
      setTravel(Math.max(0, width - window.innerWidth));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.5 });
  const x = useTransform(smooth, [0, 1], [0, -travel]);

  return (
    <div ref={section} style={{ height: `${Math.max(200, drivers.length * 55)}vh` }}>
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
        <div className="section-container">{header}</div>
        <motion.div ref={track} style={{ x }} className="mt-8 flex w-max gap-4 px-8">
          {drivers.map((driver, i) => (
            <DriverPoster
              key={driver.id}
              driver={driver}
              index={i}
              className="h-[62vh] w-[24vw] min-w-[300px] shrink-0"
            />
          ))}
          <div className="flex w-[24vw] min-w-[300px] shrink-0 flex-col justify-end border-l border-white/10 pl-8">
            <p className="readout">End of grid</p>
            <p className="heading-font lean mt-3 text-5xl font-bold uppercase leading-[0.88] text-white">
              {drivers.length} drivers.
              <br />
              <span className="text-racing-yellow">One team.</span>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
