# Chennai Turbo Riders

The public site at **chennaiturboriders.in** and the console that edits it, in one
Next.js application. Which of the two a request gets is decided by its `Host`
header — see [The two front doors](#the-two-front-doors).

```bash
npm install
npm run db:migrate                              # the schema
npm run db:seed                                 # starting content
npm run create-admin -- <username> <password>   # an owner, or nothing opens
npm run dev                                     # site :3000, console :4000
```

Full first-run instructions, including the bucket and the CDN, are in
[docs/new-deployment.md](docs/new-deployment.md).

---

## What this is

The site was a set of hand-built pages reading a checked-in `site-data.json`.
Changing a headline meant a commit and a deploy, and only somebody with the
repository could do it. The content now lives in Postgres and is edited in a
console, while the pages themselves keep the design they had.

The console — every screen, the media library, the rich-text editor, the role
model, the S3 pipeline — is ported from the CTR Unified platform
(`../CTR_Sports_New`) rather than rewritten, so it arrives already working. What
is new here is the branding, the single-site shape, and the wiring from those
tables into this site's own pages.

### The two front doors

One build, one process, one database connection. `src/middleware.ts` reads the
`Host` header:

| Host | What it serves |
|---|---|
| `ADMIN_HOSTS` (e.g. `admin.chennaiturboriders.in`) | the console, at its own root — `/`, `/media`, `/login` |
| anything else | the public site, and nothing else |

The console lives at `src/app/console` on disk, which is a router detail and
never a URL: that path 404s on every host, including the admin one, and the
rewrite that maps one to the other is internal. The public domain therefore
carries no admin surface at all, and the session cookie — host-only, no `domain`
attribute — is never sent to the public site.

`ADMIN_HOSTS` unset means **no** host is the admin host. The console becomes
unreachable and the site is unaffected, which is the safe way round to fail.

---

## Layout

```
src/
  app/(site)/        the public pages — the F4 design, kept
  app/(site)/_shell/ the shared render layer, drawn by pages AND by console previews
  app/console/       every console screen
  app/api/admin/     what those screens post to
  admin/             the console's own components and UI kit
  lib/               shared model + rules  (browser-safe)
  lib/server/        one repo per table    (server-only)
  components/site/   this site's own components
  styles/globals.css
migrations/          NNNN_name.sql, applied in order, checksummed
scripts/             migrate, seed, create-admin, media tooling
```

`lib/` and `lib/server/` are split by what may reach the browser: anything under
`server/` imports `server-only`, so an accidental import from a client component
is a build error rather than a leaked connection string.

### Two palettes that never mix

`tailwind.config.ts` carries three sets of colours, and mixing them produces
something that looks like none of them:

| Set | Used by | Names |
|---|---|---|
| Site (brand) | `components/site/*`, the F4 pages | `racing-yellow`, `carbon-*`, `metal` |
| Site (shared) | the console's article and event previews | `accent`, `page`, `surface`, `panel`, `line`, `fg-*` |
| Console | `admin/*` | `background`, `card`, `muted`, `primary`, `border`, `ring` |

The console also has a typeface of its own (`font-ui`, IBM Plex Sans) so the tool
never reads as part of the thing it edits.

---

## What the console drives, and what it does not

Every screen edits something the site draws, and every page of the site reads
the database. There is no static content file.

| Screen | Public page |
|---|---|
| Team & site | the masthead, the footer, the hero and about bands on `/`, `/about`, the car panel, the timeline |
| Drivers | `/drivers`, `/drivers/[slug]`, and the reel on the home page |
| Sponsors | `/sponsors` and the logo marquee on the home page |
| Season · rounds | `/schedule` — the calendar, the next-race panel and its countdown |
| Circuits | the venue on each round of `/schedule` |
| Articles | `/news`, `/news/[slug]`, and the home page's latest-news band |
| Media, Accounts, Co-admins | console-side |

The console arrived as a port of CTR Unified's, and for a while it carried
that platform's screens too — a section-built landing page and its header and
footer, sports cards, decks, registration forms, enquiries — editing content
this site never rendered. `0025_ctr_shape.sql` removed all of it, along with
the unrouted page components under `_shell/` that would have drawn it. The
console is now the shape of the site.

### Two columns this deployment added

`0023_article_byline.sql` adds `category`, `author` and `tags` to `ctr.articles`.
The pages that draw an article show all three; the upstream schema has none of
them, and dropping them would have meant redesigning two working pages around a
limitation of the editor. This is the one place the schema diverges from
CTR Unified.

`0022_chennai_turbo_riders.sql` is the other local migration: it renames the root
site, switches on all five modules and deletes the `incrc` sport, because this
deployment serves one site and that site is the team.

---

## Everyday commands

```bash
npm run dev            # site :3000, console :4000 — one Next process, proxied
npm run dev:app        # just the Next server on :3000

npm run db:migrate     # apply pending migrations
npm run db:status      # what is applied, what is pending
npm run db:seed        # starting rows; each kind only fires on its own empty table
npm run create-admin -- <username> <password>

npx tsc --noEmit
npm run check:source && npm run check:articles
npm run build          # reads the database, so DATABASE_URL must be reachable
```

`NEXT_DIST_DIR=.next-verify npm run build` builds somewhere else, so checking a
change does not leave a running dev server serving half a build.

---

## Environment

`.env.example` is the canonical list and says what each variable is for. The
short version:

| | |
|---|---|
| `SITE_URL` | the public origin. Every canonical URL, the sitemap and the OG tags are built from it. Read at **build** time. |
| `ADMIN_HOSTS` | which hostnames serve the console. Needed at **build** time too — middleware runs in the Edge runtime. |
| `DATABASE_URL` | Neon Postgres. Every table is in the `ctr` schema. |
| `S3_*` | the media bucket. Unset, image fields still take pasted URLs. |
| `NEXT_PUBLIC_MEDIA_BASE_URL` | the CDN in front of the bucket. Inlined at **build** time, so changing it needs a redeploy. |

No domain is written down in the source. `SITE_URL` and `ADMIN_HOSTS` are the
only place this deployment learns its own name.
