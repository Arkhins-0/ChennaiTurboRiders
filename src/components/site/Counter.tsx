"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

/**
 * A number that counts up when it scrolls into view.
 *
 * Takes the value as the string the data holds — "11+", "S4", "230 km/h" — and
 * animates only the digits inside it, keeping whatever surrounds them. Under
 * reduced motion, or when there are no digits, it simply prints the string.
 */
export function Counter({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduced = useReducedMotion();

  const match = value.match(/(\d[\d,.]*)/);
  const target = match ? Number(match[1].replace(/,/g, "")) : NaN;
  const [prefix, suffix] = match
    ? [value.slice(0, match.index), value.slice((match.index ?? 0) + match[1].length)]
    : [value, ""];
  const decimals = match && match[1].includes(".") ? match[1].split(".")[1].length : 0;

  const [shown, setShown] = useState(reduced || Number.isNaN(target) ? value : `${prefix}0${suffix}`);

  useEffect(() => {
    if (!inView || reduced || Number.isNaN(target)) {
      setShown(value);
      return;
    }
    const controls = animate(0, target, {
      duration: 1.4,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(`${prefix}${v.toFixed(decimals)}${suffix}`),
    });
    return () => controls.stop();
  }, [inView, reduced, target, prefix, suffix, decimals, value]);

  return (
    <span ref={ref} className={className}>
      {shown}
    </span>
  );
}
