"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

function diff(target: number) {
  const ms = Math.max(0, target - Date.now());
  return {
    days: Math.floor(ms / 86400000),
    hours: Math.floor((ms / 3600000) % 24),
    minutes: Math.floor((ms / 60000) % 60),
    seconds: Math.floor((ms / 1000) % 60),
  };
}

/** One digit that rolls out and the next rolls in, like a departures board. */
function Digit({ value, reduced }: { value: string; reduced: boolean }) {
  return (
    <span className="relative inline-block h-[1em] w-[0.62em] overflow-hidden align-top">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          initial={reduced ? false : { y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduced ? undefined : { y: "-100%", opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 text-center"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * Lights out, counted down.
 *
 * Renders dashes until it has mounted so the server's HTML and the browser's
 * first paint agree; then each digit rolls as it changes.
 */
export function CountdownTimer({
  targetIso,
  label = "Lights out in",
}: {
  targetIso: string;
  label?: string;
}) {
  const target = new Date(targetIso).getTime();
  const reduced = useReducedMotion() === true;
  const [t, setT] = useState(() => diff(target));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setT(diff(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  const cells = [
    { v: t.days, l: "Days" },
    { v: t.hours, l: "Hrs" },
    { v: t.minutes, l: "Min" },
    { v: t.seconds, l: "Sec" },
  ];

  return (
    <div role="timer" aria-label={label}>
      <p className="readout mb-3 flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-racing-yellow animate-blink" />
        {label}
      </p>
      <div className="grid grid-cols-4 gap-px border border-white/10 bg-white/10">
        {cells.map((c) => {
          const text = mounted ? String(c.v).padStart(2, "0") : "--";
          return (
            <div key={c.l} className="bg-carbon-950 px-2 py-4 text-center">
              <div className="heading-font text-4xl font-bold tabular-nums leading-none text-white sm:text-5xl">
                {text.split("").map((ch, i) => (
                  <Digit key={i} value={ch} reduced={reduced} />
                ))}
              </div>
              <div className="readout mt-2 text-[10px]">{c.l}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
