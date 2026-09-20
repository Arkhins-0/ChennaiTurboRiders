"use client";

import { useEffect, useRef, useState } from "react";
import { eventName, type CtrEvent } from "@/lib/events";
import { eventDateLabel, eventDateParts } from "@/lib/raceDates";
import { richTextIsEmpty } from "@/lib/richtext";
import { findTrack, type Track } from "@/lib/tracks";
import { cn } from "@/lib/utils";
import { PreviewMode } from "@/components/ui/PreviewMode";
import { ArticleBody } from "@/components/site/articles/ArticleBody";
import { Media } from "@/components/ui/Media";

/**
 * The event's page, rendered from the draft, shrunk to fit beside the fields.
 *
 * ── Why this one is not the public component ──────────────────────────────
 *
 * Every other preview in this admin renders the route's own component, and that
 * is the rule worth keeping. `EventDetail` cannot be one of them: it is an async
 * server component that reads the event, the circuits and the entry forms out of
 * the database by slug, and a preview has to draw a draft that has not been
 * saved and may not have an address yet.
 *
 * So the layout is repeated here — the header block, the date, the place, the
 * cover, the report — and the parts that CAN be shared are: `ArticleBody` draws
 * the report through the same renderer the page uses, and `eventName`,
 * `eventDateLabel` and `eventDateParts` are the same functions. What is copied
 * is the arrangement, and the two are checked against each other by eye.
 *
 * Same mechanics as the other previews: `zoom` rather than `transform` so the
 * box gets its own height, and `pointer-events-none` because the header and
 * footer in here are real links and a stray click would navigate the ADMIN to
 * the public site with an unsaved event open.
 */

/** The viewport width the preview pretends to be. */
const PREVIEW_WIDTH = 1440;

/** The pin beside the venue. Was in the sections library, which is gone. */
function PinIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function EventPreview({
  event,
  tracks,
  className,
}: {
  /** The draft being edited, or null when no event is open. */
  event: CtrEvent | null;
  tracks: Track[];
  className?: string;
}) {
  const paneRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const element = paneRef.current;
    if (!element) return;

    const measure = () => {
      const width = element.clientWidth;
      if (width > 0) setScale(width / PREVIEW_WIDTH);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Back to the top when the pane switches event.
  useEffect(() => {
    paneRef.current?.scrollTo({ top: 0 });
  }, [event?.id]);

  const track = event ? findTrack(tracks, event.track_id) : undefined;
  const name = event ? eventName(event, track?.name) : "";
  const where = track?.location || event?.city || "";
  const cover = event?.cover_image || track?.photo_url || "";
  const when = event ? eventDateLabel(event) : "";
  const date = event ? eventDateParts(event) : null;

  return (
    <div
      ref={paneRef}
      className={cn("overflow-y-auto rounded-lg border border-border bg-black", className)}
    >
      <div style={{ zoom: scale }} className="pointer-events-none origin-top-left">
        <PreviewMode>
          {/*
            No header and no footer around the record. They used to be drawn
            from the chrome document — the section-built header and footer of
            the platform this console was ported from — and this site has
            neither: its navigation and footer are components that read the
            team's profile. What is worth previewing is the record itself.
          */}
          <div className="min-h-[60vh] bg-carbon-950 p-8 text-white">
            <div className="mx-auto max-w-4xl">

              <section className="shell py-14">
                {!event ? (
                  <div className="panel-card mx-auto max-w-2xl p-10 text-center">
                    <p className="body-copy">No event open.</p>
                  </div>
                ) : (
                  <article>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="pill-label">Calendar</span>
                      {event.round ? (
                        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-fg-faint">
                          {event.round}
                        </span>
                      ) : null}
                      {event.badge ? (
                        <span className="rounded-full border border-line px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-fg-faint">
                          {event.badge}
                        </span>
                      ) : null}
                      {event.status === "draft" ? (
                        <span className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-accent-ink">
                          Draft
                        </span>
                      ) : null}
                    </div>

                    <h1 className="headline mt-4 text-[clamp(1.9rem,4.5vw,3.2rem)]">
                      {name || "Untitled event"}
                    </h1>
                    {event.subtitle ? (
                      <p className="body-copy mt-4 max-w-2xl">{event.subtitle}</p>
                    ) : null}

                    <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-fg-muted">
                      {when ? <span className="font-semibold text-fg">{when}</span> : null}
                      {where ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-accent">
                            <PinIcon />
                          </span>
                          {where}
                        </span>
                      ) : null}
                      {/* The date block is not repeated here — the line above says
                          the same thing and the page proper only sets it large on
                          the calendar's cards, not on the event's own page. */}
                      {date ? null : null}
                    </div>

                    {cover ? (
                      <Media
                        src={cover}
                        alt=""
                        aria-hidden
                        className="mt-8 aspect-[16/7] w-full rounded-card object-cover"
                      />
                    ) : null}

                    {richTextIsEmpty(event.body) ? (
                      <div className="panel-card mt-10 p-8 text-center">
                        <p className="body-copy">
                          Nothing written yet — which is the normal state of an event before it
                          happens. The details above are the page.
                        </p>
                      </div>
                    ) : (
                      <ArticleBody doc={event.body} className="mt-10" />
                    )}
                  </article>
                )}
              </section>
            </div>
          </div>
        </PreviewMode>
      </div>
    </div>
  );
}
