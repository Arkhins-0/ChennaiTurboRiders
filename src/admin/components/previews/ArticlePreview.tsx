"use client";

import { useEffect, useRef, useState } from "react";
import type { Article } from "@/lib/articles";
import { richTextIsEmpty } from "@/lib/richtext";
import { cn } from "@/lib/utils";
import { PreviewMode } from "@/components/ui/PreviewMode";
import { ArticleBody } from "@/components/site/articles/ArticleBody";
import { ArticleHeader } from "@/components/site/articles/ArticleHeader";

/**
 * The real article page, rendered from the draft, shrunk to fit beside the
 * fields.
 *
 * The same two components the public route draws — not a mock. On a writing
 * screen that matters more than it does anywhere else in this admin: the editor
 * is a narrow column in a card, and how a paragraph actually breaks, how much air
 * a heading has above it, and whether a picture dropped mid-sentence lands where
 * it was meant to are all questions only the finished page answers.
 *
 * Same mechanics as `DeckPreview`: `zoom` rather than `transform` so the box gets
 * its own height, and `pointer-events-none` because the header and footer in here
 * are real links and a stray click would navigate the ADMIN to the public site
 * with an unsaved article open.
 */

/** The viewport width the preview pretends to be. */
const PREVIEW_WIDTH = 1440;

export function ArticlePreview({
  article,
  className,
}: {
  /** The draft being edited, or null when no article is open. */
  article: Article | null;
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

  // Back to the top when the pane switches article — a short one opened while
  // scrolled halfway down a long one would otherwise start below its own end.
  useEffect(() => {
    paneRef.current?.scrollTo({ top: 0 });
  }, [article?.id]);

  const empty = !article || (richTextIsEmpty(article.body) && !article.title && !article.cover_image);

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
                {empty ? (
                  <div className="panel-card mx-auto max-w-2xl p-10 text-center">
                    <p className="body-copy">
                      {article ? "Nothing written yet — start typing." : "No article open."}
                    </p>
                  </div>
                ) : (
                  <article>
                    <ArticleHeader article={article} />
                    <ArticleBody doc={article.body} className="mt-8" />
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
