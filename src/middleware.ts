import { NextResponse, type NextRequest } from "next/server";

/**
 * One deployment, two front doors.
 *
 * Every request is answered by the same build, the same process and the same
 * database connection. What the hostname decides is which of the two
 * applications in this repo is reachable:
 *
 *   the admin host     the admin, at its own root: /, /landing, /incrc, /login
 *   every other host   the public site, and nothing else
 *
 * Which hostnames are which is configuration, not code — see ADMIN_HOSTS below.
 * No domain is written down anywhere in this repository.
 *
 * ── Why the admin is mounted at /console ──────────────────────────────────
 *
 * Next.js routes by folder, so two applications served at "/" cannot both be
 * called "/" on disk: src/app/(site)/page.tsx and an admin page.tsx would claim
 * the same URL and the build would refuse them. One of the two has to sit under
 * a folder. The admin does, at src/app/console.
 *
 * That folder is an implementation detail of the router and is NOT a URL. It is
 * unreachable from the outside on every host, including this one — see the 404
 * below — and nothing in src/admin knows it exists. Every link the admin writes
 * is a plain root path. The only thing that maps one to the other is the rewrite
 * at the bottom of adminHost(), which is invisible to the browser.
 *
 * ── What this is not ──────────────────────────────────────────────────────
 *
 * Routing, not authentication. The session cookie still gates every admin page,
 * in src/app/console/(protected)/layout.tsx. What the split buys is that the
 * public domain carries no admin surface at all, and that the session cookie —
 * host-only, no `domain` attribute — is never sent to the public site.
 */

/** The admin's mount point on disk. Never appears in a URL. */
const MOUNT = "/console";

/**
 * Hosts that serve the admin, comma-separated, matched with and without a port.
 *
 * Required in production. There is deliberately no domain baked in as a
 * fallback: an unset value means no host is the admin host, so the admin is
 * unreachable and the public site is unaffected — the safe way round to fail.
 *
 * Must be set at BUILD time as well as run time. Middleware runs in the Edge
 * runtime, where process.env is inlined when the app is compiled.
 *
 * The two localhost entries are the local development ports, not a site name,
 * and are additive: `npm run dev` proxies port 4000 into the one dev server, so
 * the admin answers there and the site answers on 3000.
 */
const ADMIN_HOSTS = (process.env.ADMIN_HOSTS ?? "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean)
  .concat(process.env.NODE_ENV === "development" ? ["localhost:4000", "127.0.0.1:4000"] : []);

/**
 * Whether to believe `x-forwarded-host`.
 *
 * Off by default, and deliberately: that header is client-supplied, so trusting
 * it unconditionally would let anyone ask the public domain for admin routing by
 * sending one. Turn it on only where a proxy you control overwrites it — most
 * platforms (Vercel, Render, Fly, Railway) pass the real Host through.
 */
const TRUST_FORWARDED_HOST = process.env.TRUST_FORWARDED_HOST === "1";

function isAdminHost(request: NextRequest): boolean {
  const forwarded = TRUST_FORWARDED_HOST ? request.headers.get("x-forwarded-host") : null;
  const host = (forwarded ?? request.headers.get("host") ?? "").toLowerCase().trim();
  if (!host) return false;

  // A forwarded header may carry a list; the first entry is the original client.
  const first = host.split(",")[0].trim();
  const bare = first.split(":")[0];
  if (ADMIN_HOSTS.includes(first) || ADMIN_HOSTS.includes(bare)) return true;

  // The convention, so a deployment that forgot the variable — or set it after
  // the build, where the Edge runtime cannot see it — still gets its console at
  // admin.<site>: any host whose first label is `admin` is the admin host.
  // `admin.localhost` is the same rule at a developer's machine.
  return bare.startsWith("admin.");
}

/** Anything with an extension is a real file, served the same on every host. */
function isFile(pathname: string): boolean {
  return /\.[a-z0-9]+$/i.test(pathname);
}

/**
 * A 404 answered here, rather than rewritten to a path that does not exist.
 *
 * The obvious way to write this is `rewrite("/404")` and let the framework's own
 * not-found page render. Do not: what happens to a rewrite whose target matches
 * no route is decided by whatever is running the app. `next start` resolves it
 * to the not-found page; a platform router that resolves rewrites against the
 * build manifest before the app ever sees them answers with ITS not-found page
 * instead — a plain-text error with a support ID, which is worse than useless
 * because it looks like the deployment is broken.
 *
 * Nobody legitimate ever sees these paths: they are the admin's mount point and
 * the admin's API, asked for on a host that does not serve them. A deterministic
 * 404 on every platform beats a pretty one on some of them.
 */
function notFound() {
  return new NextResponse("Not Found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-robots-tag": "noindex",
    },
  });
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The mount point is not an address. Asked for directly, on any host, it does
  // not exist — which is what stops the admin being reachable at a second URL,
  // and what stops it being reachable AT ALL from the public domain.
  if (pathname === MOUNT || pathname.startsWith(`${MOUNT}/`)) return notFound();

  return isAdminHost(request) ? adminHost(request, pathname) : publicHost(pathname);
}

function adminHost(request: NextRequest, pathname: string) {
  // Nothing on this host should ever be indexed, whatever the public robots.txt
  // says. Answered here so it holds however that route file changes.
  if (pathname === "/robots.txt") {
    return new NextResponse("User-agent: *\nDisallow: /\n", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Route handlers keep their real paths: the admin calls /api/... with an
  // absolute path, and moving those would send them somewhere that is not a
  // route. Files (/images/..., favicons) are likewise served as they are.
  if (pathname.startsWith("/api/") || isFile(pathname)) return NextResponse.next();

  // /landing → /console/landing, / → /console. The address bar keeps showing the
  // clean path: a rewrite is internal and is not re-run through this middleware,
  // so the mount point stays unreachable from outside.
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? MOUNT : `${MOUNT}${pathname}`;
  return NextResponse.rewrite(url);
}

function publicHost(pathname: string) {
  // The admin's API is part of the admin. Absent here, like the screens.
  // Everything else passes. No public route takes a write any more: the
  // registration forms and the footer's enquiry box went with migration 0025.
  return pathname.startsWith("/api/admin") ? notFound() : NextResponse.next();
}

export const config = {
  /*
   * Everything except the framework's own asset routes and the static image
   * directory. robots.txt and sitemap.xml are deliberately NOT excluded — the
   * admin host answers the first one itself, above.
   */
  matcher: ["/((?!_next/static|_next/image|images).*)"],
};
