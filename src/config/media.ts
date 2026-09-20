/**
 * The one place the media host is decided.
 *
 * Everything uploaded through the admin's media library is served from here:
 * the URLs `src/config/images.ts` builds for the defaults, the preconnect in
 * `src/app/layout.tsx`, and — through the same env var — the absolute URL
 * `publicUrl()` hands back to the admin on upload (`src/lib/server/s3.ts`).
 *
 * `NEXT_PUBLIC_` because this module is imported by content modules that end up
 * in the client bundle. That means it is inlined at BUILD time: changing the
 * value on Vercel needs a redeploy, not a restart.
 *
 * ── There is no fallback, on purpose ──────────────────────────────────────
 *
 * It was the bucket's own address, on the argument that an unset variable should
 * degrade to the behaviour this project had before the CDN. That expired when
 * Block Public Access went on: S3 answers 403 for every object, so falling back
 * to it is not "slower", it is a site with no pictures.
 *
 * It was then briefly the distribution's address — which works, and is wrong in
 * a different way: a literal naming ONE deployment's CDN, in a repository that
 * gets stood up against new buckets and new domains. An unset variable there
 * would silently preconnect to somebody else's CDN.
 *
 * So it is "". The one consumer is the preconnect in src/app/layout.tsx, which
 * skips it when empty — a missing performance hint rather than a wrong one.
 * Nothing else reads this: `publicUrl()` in src/lib/server/s3.ts builds an
 * upload's address on the server from `S3_PUBLIC_BASE_URL`, this variable, and
 * finally the bucket's own virtual-hosted name, which it derives from
 * `S3_BUCKET` and `S3_REGION` and is therefore right for any bucket.
 *
 * The trailing-slash strip is what lets the variable be set either way round;
 * every caller joins with a `/` of its own.
 */
export const MEDIA_BASE_URL = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL || "").replace(/\/+$/, "");
