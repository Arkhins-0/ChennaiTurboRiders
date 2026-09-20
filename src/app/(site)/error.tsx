"use client";

import { useEffect } from "react";

/**
 * What a visitor sees when a public page cannot be drawn.
 *
 * Every loader on this site used to swallow a database error and return the
 * defaults — a document of copy kept in the repo — so an outage rendered a
 * complete, plausible, WRONG page: last quarter's calendar, a championship that
 * had moved on, a form that was no longer open. Nobody could tell from looking,
 * which is what made it worse than a blank screen. The defaults are gone and the
 * loaders throw, and this is where that lands.
 *
 * Deliberately says nothing about the cause. A visitor cannot act on "Neon
 * refused the connection", and an error page that prints internals to the
 * street is a gift to whoever is probing it. The real error goes to the console,
 * which is where the people who can fix it are looking.
 *
 * A CLIENT component, because every `error.tsx` is one — React needs to attach
 * it as a boundary in the browser, and `reset` is a callback it hands back.
 *
 * It renders inside the root layout, so the fonts and globals.css are already
 * there and the site's own classes work. `global-error.tsx` is the one that
 * cannot rely on that.
 */
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only thing tying what the visitor saw to a line in the
    // server log — Next replaces the message with it in production.
    console.error("[site] a page could not be rendered", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-page px-5 py-16">
      <div className="shell max-w-[560px] text-center">
        {/*
          Repo file, not an upload. The one picture on the page that must never
          depend on the thing that just failed — a logo served from the media
          bucket would be a broken image on the page apologising for the outage.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/logos/CTR_New_yellow.png"
          alt="Chennai Turbo Riders"
          width={72}
          height={72}
          className="mx-auto mb-8 h-16 w-auto"
        />

        <h1 className="headline text-[clamp(1.75rem,5vw,2.5rem)]">
          We&rsquo;ll be right back
        </h1>

        <p className="body-copy mx-auto mt-4 max-w-[42ch]">
          This page could not be loaded just now. It is being looked at — please
          try again in a moment.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-dark"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-full border border-line px-6 py-3 text-sm font-semibold text-fg transition-colors hover:bg-panel"
          >
            Go to the home page
          </a>
        </div>

        {/*
          Shown, not hidden. It is meaningless to a visitor and the whole of the
          conversation with support — "quote this code" beats "describe what you
          saw". Absent in dev, where the stack is on screen anyway.
        */}
        {error.digest ? (
          <p className="mt-8 font-mono text-xs text-fg-faint">
            Reference {error.digest}
          </p>
        ) : null}
      </div>
    </main>
  );
}
