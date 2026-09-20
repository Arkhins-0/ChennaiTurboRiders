import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Inter, JetBrains_Mono, Rajdhani } from "next/font/google";
import { MEDIA_BASE_URL } from "@/config/media";
import { SEO, SITE } from "@/config/site";
import "@/styles/globals.css";

/*
 * Self-hosted through next/font rather than a CSS @import, which would cost two
 * extra host connections before the first paint.
 *
 * Rajdhani is the site's headline face — squarish, technical, and the one the
 * F4 pages were designed against. It is bound to `--font-display`, which is the
 * name every shared component reads, so the site and anything ported alongside
 * it agree on which face is the display face without either knowing what it is.
 */
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-body" });
const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-display",
});

/*
 * The site's data face: the readouts, timestamps and labels that dress the
 * pages like a broadcast graphic. Two weights, because a readout is either
 * a label or a value.
 */
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-mono",
});

/*
 * The admin's face, and only the admin's. A humanist sans with a tall x-height
 * that stays legible at the 13-14px the tool is built at, and visibly not the
 * site's own type — the editor should never be mistaken for the page it edits.
 */
const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  variable: "--font-ui",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0A0A0A",
};

/*
 * `metadataBase` comes from SITE.url, which comes from SITE_URL — so the
 * canonical host is configuration, not a literal in the source. A repository
 * that names its own domain has to be edited to be moved.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SEO.title,
    template: `%s | ${SITE.name}`,
  },
  description: SEO.description,
  keywords: [...SEO.keywords],
  authors: [{ name: SITE.name }],
  icons: { icon: SEO.logo },
  alternates: { canonical: "/" },
  openGraph: {
    title: SEO.title,
    description: SEO.description,
    url: SITE.url,
    siteName: SITE.name,
    type: "website",
    locale: SITE.locale,
  },
  twitter: {
    card: "summary_large_image",
    title: SEO.title,
    description: SEO.description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${rajdhani.variable} ${mono.variable} ${plex.variable}`}>
      <body className="antialiased">
        {/*
          The first banner photo is the LCP element and lives on another host.
          Opening that connection during HTML parse saves the DNS + TLS
          round-trips it would otherwise cost.

          No crossOrigin: a preconnect is only reused by a request whose CORS
          mode matches, and every image here is drawn with a plain <img> and no
          `crossorigin` attribute — so `crossOrigin=""` would open an
          anonymous-CORS connection the images cannot use, then pay for a second.

          The host is not written down: it comes from MEDIA_BASE_URL, so this
          line cannot end up pointing at last month's host — or, on a deployment
          that has not set the variable, at somebody else's. Unset, it is "" and
          the hint is simply not emitted.
        */}
        {MEDIA_BASE_URL ? <link rel="preconnect" href={MEDIA_BASE_URL} /> : null}
        {children}
      </body>
    </html>
  );
}
