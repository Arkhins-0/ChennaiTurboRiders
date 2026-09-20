import { DEFAULT_VIEW_BOX, type Track } from "@/lib/tracks";
import { cn } from "@/lib/utils";
import { Media } from "@/components/ui/Media";

/**
 * How a circuit's layout gets drawn, wherever it is drawn.
 *
 * Three sources, in order of preference, and the order is the whole point:
 *
 *   svg_path   a line the page draws itself, in the page's own colour. This is
 *              the one the design is built around — it takes the accent, it
 *              scales to any size without going soft, and the same circuit reads
 *              on the black page and on the admin's white tile without two files.
 *   map_url    a picture of a layout, whatever the circuit publishes. Always on
 *              white: track maps are drawn as dark ink on paper, and one with a
 *              transparent background would be invisible on this page.
 *   nothing    an honest empty frame that says so, rather than a blank hole.
 *
 * Shared by the public circuits pages and the admin's preview, so it takes a
 * whole Track rather than the two picture fields — every caller has one, and a
 * fourth source added later is then one edit here.
 */

/**
 * A circuit drawn from its path data.
 *
 * One <path>, stroked in the current colour with round caps, so the outline
 * takes the colour of whatever it is placed in.
 *
 * `fill="none"` matters — a track is a line, and a closed path with a fill would
 * come out as a blob.
 */
export function TrackOutline({
  path,
  viewBox,
  strokeWidth = 6,
  className,
}: {
  path: string;
  viewBox?: string;
  /** In the path's own coordinates, so it scales with the drawing. */
  strokeWidth?: number;
  className?: string;
}) {
  if (!path) return null;

  return (
    <svg
      viewBox={viewBox || DEFAULT_VIEW_BOX}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("h-full w-full", className)}
    >
      <path d={path} />
    </svg>
  );
}

export function CircuitMap({
  track,
  strokeWidth,
  className,
}: {
  track: Track;
  strokeWidth?: number;
  className?: string;
}) {
  if (track.svg_path) {
    return (
      <TrackOutline
        path={track.svg_path}
        viewBox={track.svg_view_box}
        strokeWidth={strokeWidth}
        className={className}
      />
    );
  }

  if (track.map_url) {
    return (
      <span className={cn("flex items-center justify-center bg-white p-3", className)}>
        <Media
          src={track.map_url}
          alt={`Circuit layout — ${track.name}`}
          loading="lazy"
          className="h-full w-full object-contain"
        />
      </span>
    );
  }

  return <LayoutPending className={className} />;
}

/**
 * The layout as a watermark, bled out of a corner and faded with a mask.
 *
 * Decoration, not information: it is `aria-hidden` and unclickable, and nothing
 * on the page depends on being able to read it. That is what lets it sit at the
 * opacity it does — a corner motif that says "circuit" at a glance and gives
 * each card its own silhouette, without competing with the type in front of it.
 *
 * A raster map needs handling a drawn path does not. Published layouts are dark
 * ink on white or on nothing, which is invisible on a dark panel; `invert` turns
 * the ink light, and `screen` drops the black ground that inverting a white one
 * leaves behind. Between them, a JPEG on white and a transparent PNG both come
 * out as pale line art.
 *
 * Position and size come from the caller — this only knows how to fade.
 */
export function CircuitGhost({ track, className }: { track: Track; className?: string }) {
  if (!track.svg_path && !track.map_url) return null;

  // Opaque into the bottom-right corner, gone by the time it reaches the copy.
  const fade = "linear-gradient(to top left, #000 12%, rgba(0,0,0,0.45) 50%, transparent 82%)";

  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute select-none", className)}
      style={{ maskImage: fade, WebkitMaskImage: fade }}
    >
      {track.svg_path ? (
        <TrackOutline
          path={track.svg_path}
          viewBox={track.svg_view_box}
          strokeWidth={7}
          className="h-full w-full"
        />
      ) : (
        <Media
          src={track.map_url}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain object-right-bottom mix-blend-screen invert"
        />
      )}
    </span>
  );
}

/**
 * What a circuit with no drawing shows.
 *
 * Deliberately not a stand-in shape: an invented outline would be read as this
 * circuit's outline. A dashed frame that says the drawing is missing is the only
 * honest thing to put here, and it is also the prompt to go and add one.
 */
export function LayoutPending({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex flex-col items-center justify-center gap-2 border border-dashed border-line px-4 text-center",
        className
      )}
    >
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="text-fg-faint/50"
      >
        <path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7z" />
        <path d="M9 4v13M15 7v13" />
      </svg>
      <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-fg-faint/70">
        Layout coming soon
      </span>
    </span>
  );
}
