"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Turns the sound on for the video beside it.
 *
 * A video on this site autoplays muted, because that is the only way a browser
 * will start one. This is how somebody chooses to hear it — and it can only ever
 * be a choice made after the fact: a page may not start a video with sound, and
 * no amount of markup changes that.
 *
 * ── Why it finds the video by walking the DOM ─────────────────────────────
 *
 * `Media` renders `<video>` and then this, as adjacent siblings, and this reads
 * `previousElementSibling`. That is tighter coupling than passing a ref, and it
 * is what keeps `Media` free of `"use client"`: a ref cannot cross from a server
 * component into a client one, so the alternative is making every picture on the
 * site a client component to support a button that most of them do not have.
 *
 * The coupling is contained — one component renders both, three lines apart —
 * and it fails safe: no sibling, no video, nothing happens.
 *
 * ── Why the element's property and not React state ────────────────────────
 *
 * `element.muted = false` is what the browser reads. Driving it through a
 * `muted` prop would make React re-render the `<video>`, and a `<video>` whose
 * props change is a `<video>` that starts again from the beginning — the sound
 * would come on and the clip would jump back to zero.
 *
 * The state here only decides which glyph is drawn.
 */
export function SoundToggle({ className }: { className?: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const [muted, setMuted] = useState(true);

  return (
    <button
      ref={button}
      type="button"
      onClick={() => {
        const video = button.current?.previousElementSibling;
        if (!(video instanceof HTMLVideoElement)) return;

        video.muted = !video.muted;
        setMuted(video.muted);

        // A muted autoplaying video can be paused by the browser's own policies.
        // Unmuting is a user gesture, so this is the moment it will accept a
        // play() it would have refused before.
        void video.play().catch(() => {});
      }}
      aria-label={muted ? "Turn the sound on" : "Turn the sound off"}
      title={muted ? "Turn the sound on" : "Turn the sound off"}
      className={cn(
        "absolute bottom-3 right-3 z-20 grid size-9 place-items-center rounded-full",
        "border border-white/25 bg-black/45 text-white backdrop-blur transition",
        "hover:border-white/50 hover:bg-black/70",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/40",
        className
      )}
    >
      {muted ? <MutedIcon /> : <SoundIcon />}
    </button>
  );
}

/* Drawn here rather than imported: this is the only public component with an
   icon of its own, and the admin's set is not in this bundle. */

function SoundIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 7.5h2.5L10 4.5v11L6.5 12.5H4z" />
      <path d="M13 7.5a3.5 3.5 0 0 1 0 5" />
      <path d="M15.2 5.2a6.5 6.5 0 0 1 0 9.6" />
    </svg>
  );
}

function MutedIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 7.5h2.5L10 4.5v11L6.5 12.5H4z" />
      <path d="m13.5 8 4 4M17.5 8l-4 4" />
    </svg>
  );
}
