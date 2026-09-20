"use client";

import { useEffect } from "react";

/**
 * The last boundary: an error in the ROOT layout itself, or in any route with no
 * nearer `error.tsx` — which is every console screen.
 *
 * This one REPLACES the root layout rather than rendering inside it, so it has
 * to supply its own <html> and <body>. That is also why every style here is
 * inline: `globals.css` is imported by the layout this file is standing in for,
 * so Tailwind's classes and the font variables are not guaranteed to be on the
 * page. A fallback that depends on the thing that just failed is not a fallback
 * — the same argument that took the default content out of the repo.
 *
 * Hence no logo either. The file under /public would almost certainly load, but
 * "almost certainly" is the wrong standard for the page of last resort, and a
 * broken image above an apology is worse than no image.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] the root boundary caught an error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "4rem 1.25rem",
          backgroundColor: "#000000",
          color: "#FFFFFF",
          // The site's faces if they loaded, and the system stack if they did
          // not. Naming them rather than using the CSS variables, which are set
          // by the layout that is not rendering.
          fontFamily:
            '"Plus Jakarta Sans", Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "560px" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(1.75rem, 5vw, 2.5rem)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.06,
            }}
          >
            We&rsquo;ll be right back
          </h1>

          <p
            style={{
              margin: "1rem auto 0",
              maxWidth: "42ch",
              fontSize: "15px",
              lineHeight: 1.7,
              color: "#C2C9D4",
            }}
          >
            Something went wrong and this page could not be loaded. Please try
            again in a moment.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "2rem",
              border: 0,
              borderRadius: "9999px",
              padding: "0.75rem 1.5rem",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              backgroundColor: "#F7D619",
              color: "#0A0A0A",
            }}
          >
            Try again
          </button>

          {error.digest ? (
            <p
              style={{
                marginTop: "2rem",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "12px",
                color: "#98A1AF",
              }}
            >
              Reference {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
