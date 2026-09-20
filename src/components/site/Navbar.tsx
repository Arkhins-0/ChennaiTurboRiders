"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SiteConfig, SocialMedia } from "@/types/site";

const links = [
  { href: "/", label: "Home" },
  { href: "/about", label: "Team" },
  { href: "/drivers", label: "Drivers" },
  { href: "/schedule", label: "Calendar" },
  { href: "/news", label: "News" },
  { href: "/sponsors", label: "Partners" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * The navigation: a glass pill floating over the page.
 *
 * It never touches the edges. It hangs a little below the top, shrinks once
 * the page has moved, and carries a hairline of yellow along the very top of
 * the window that fills as the page is read — a progress bar, but drawn like a
 * lap timer. The active link is a shared yellow dot that slides between items.
 *
 * On a phone the menu takes the whole screen: the six links as enormous
 * leaning lines, numbered, with the socials beneath.
 */
export function Navbar({
  site,
  socialMedia,
}: {
  site: SiteConfig;
  socialMedia: SocialMedia;
}) {
  /*
   * Built per render rather than at module scope, and the blanks dropped: an
   * empty address would otherwise draw a social link whose href is "", which
   * is a link back to the page you are on. See the same filter in the footer.
   */
  const socials = [
    { href: socialMedia.instagram, label: "Instagram" },
    { href: socialMedia.facebook, label: "Facebook" },
    { href: socialMedia.twitter, label: "X" },
    { href: socialMedia.youtube, label: "YouTube" },
  ].filter((s) => s.href);

  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Lap-timer progress bar */}
      <motion.div
        aria-hidden
        style={{ scaleX: progress }}
        className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-racing-yellow"
      />

      <header className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3 sm:top-4 sm:px-4">
        <nav
          aria-label="Primary"
          className={cn(
            "glass pointer-events-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-full pl-2 pr-2 transition-[padding,background-color] duration-300",
            scrolled ? "py-1.5" : "py-2.5",
          )}
        >
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-full py-1 pl-1.5 pr-3"
            aria-label={`${site.name} — home`}
          >
            <img
              src="/images/logos/CTR_New_yellow.png"
              alt=""
              width={36}
              height={36}
              className="h-8 w-auto"
              decoding="async"
            />
            <span className="heading-font hidden text-sm font-bold uppercase tracking-[0.22em] text-white sm:block">
              CTR
            </span>
            <span className="readout hidden items-center gap-1.5 md:flex">
              <span className="size-1.5 rounded-full bg-racing-yellow animate-blink" />
              S{String(site.currentSeason).padStart(2, "0")}
            </span>
          </Link>

          <ul className="hidden items-center gap-0.5 md:flex">
            {links.map((l) => {
              const active = isActive(pathname, l.href);
              return (
                <li key={l.href} className="relative">
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative block rounded-full px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors",
                      active ? "text-white" : "text-carbon-300 hover:text-white",
                    )}
                  >
                    {l.label}
                  </Link>
                  {active ? (
                    <motion.span
                      layoutId="nav-dot"
                      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38 }}
                      className="absolute -bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-racing-yellow"
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-1.5">
            <Link
              href="/schedule"
              className="group hidden items-center gap-2 rounded-full bg-racing-yellow py-2 pl-4 pr-3 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-carbon-950 transition-colors hover:bg-white md:inline-flex"
            >
              Next race
              <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              className="relative flex size-10 items-center justify-center rounded-full text-white md:hidden"
            >
              <span
                className={cn(
                  "absolute h-[2px] w-5 bg-current transition-transform duration-300",
                  open ? "rotate-45" : "-translate-y-[4px]",
                )}
              />
              <span
                className={cn(
                  "absolute h-[2px] w-5 bg-current transition-transform duration-300",
                  open ? "-rotate-45" : "translate-y-[4px]",
                )}
              />
            </button>
          </div>
        </nav>
      </header>

      <AnimatePresence>
        {open ? (
          <motion.div
            id="mobile-menu"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-carbon-950 md:hidden"
          >
            <div className="hud-grid pointer-events-none absolute inset-0" />
            <div className="grain pointer-events-none absolute inset-0 opacity-40" />

            <ul className="section-container relative flex flex-1 flex-col justify-center gap-1 pb-10 pt-28">
              {links.map((l, i) => {
                const active = isActive(pathname, l.href);
                return (
                  <motion.li
                    key={l.href}
                    initial={reduced ? false : { opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08 + i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Link
                      href={l.href}
                      aria-current={active ? "page" : undefined}
                      className="flex items-baseline gap-4 border-b border-white/10 py-3"
                    >
                      <span className="readout w-8 text-racing-yellow">{String(i + 1).padStart(2, "0")}</span>
                      <span
                        className={cn(
                          "heading-font lean text-5xl font-bold uppercase leading-none",
                          active ? "text-racing-yellow" : "text-white",
                        )}
                      >
                        {l.label}
                      </span>
                    </Link>
                  </motion.li>
                );
              })}
            </ul>

            <div className="section-container relative flex flex-wrap items-center justify-between gap-4 border-t border-white/10 py-6">
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {socials.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    className="readout hover:text-white"
                  >
                    {s.label}
                  </a>
                ))}
              </div>
              <Link href="/schedule" className="btn-primary">
                <span>Next race</span>
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
