"use client";

import { useRef } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";

/**
 * A block that tips towards the pointer, a few degrees, on a spring.
 *
 * The tilt is the only thing this does; whatever is inside is the card. It
 * stays flat on touch screens and under reduced motion, where a card that
 * leans as a finger passes over it would just look broken.
 */
export function TiltCard({
  children,
  className = "",
  max = 6,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 200, damping: 20 });

  function move(event: React.PointerEvent) {
    if (reduced || event.pointerType !== "mouse") return;
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    px.set((event.clientX - box.left) / box.width);
    py.set((event.clientY - box.top) / box.height);
  }

  function leave() {
    px.set(0.5);
    py.set(0.5);
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={move}
      onPointerLeave={leave}
      style={reduced ? undefined : { rotateX: rx, rotateY: ry, transformPerspective: 1000 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
