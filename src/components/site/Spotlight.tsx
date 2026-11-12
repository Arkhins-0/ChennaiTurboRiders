"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";

/**
 * A soft yellow light that follows the pointer.
 *
 * Only on devices with a fine pointer, and never under reduced motion: on a
 * phone there is no pointer to follow, and a light that trails a finger reads
 * as lag. It sits under everything and is `mix-blend-screen`, so it lifts the
 * blacks around the cursor without ever tinting the type.
 */
export function Spotlight() {
  const reduced = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const x = useMotionValue(-1000);
  const y = useMotionValue(-1000);
  const sx = useSpring(x, { stiffness: 120, damping: 24, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 120, damping: 24, mass: 0.6 });

  useEffect(() => {
    if (reduced) return;
    const fine = window.matchMedia("(pointer: fine)");
    const update = () => setEnabled(fine.matches);
    update();
    fine.addEventListener("change", update);
    return () => fine.removeEventListener("change", update);
  }, [reduced]);

  useEffect(() => {
    if (!enabled) return;
    const move = (event: PointerEvent) => {
      x.set(event.clientX);
      y.set(event.clientY);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [enabled, x, y]);

  if (!enabled) return null;

  /*
   * Centred by its position, NOT by `-translate-x-1/2 -translate-y-1/2`.
   * framer-motion writes `x`/`y` as an inline `transform`, which replaces
   * Tailwind's translate outright — so the centring was silently dropped and the
   * light's top-left corner followed the pointer, putting the glow below and to
   * the right of it. Half of 36rem is 18rem.
   */
  return (
    <motion.div
      aria-hidden
      style={{ x: sx, y: sy }}
      className="pointer-events-none fixed -left-[18rem] -top-[18rem] z-[1] size-[36rem] rounded-full bg-[radial-gradient(circle,rgba(247,214,25,0.10),transparent_60%)] mix-blend-screen"
    />
  );
}
