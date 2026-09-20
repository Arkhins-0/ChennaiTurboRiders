/** @type {import('next').NextConfig} */

/*
 * No next/image anywhere. Every image is a plain <img> pointing straight at a
 * .webp file that `npm run webp` already sized and compressed, so what ships is
 * what the browser draws. One less moving part, and nothing to resize per
 * request.
 */
const nextConfig = {
  reactStrictMode: true,

  /*
   * Where the build goes, overridable.
   *
   * `next dev` and `next build` share `.next`, so running a build to check a
   * change while a dev server is up leaves that server serving half a build —
   * it fails with "Cannot find module ./1331.js" and looks like a bug in the
   * code that was just written. `NEXT_DIST_DIR=.next-verify npm run build`
   * builds somewhere else and leaves the running one alone.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",

  async headers() {
    return [
      {
        // Assets under /images are replaced by name when they change, so the
        // bytes at a given path are stable and can be cached hard.
        source: "/images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

module.exports = nextConfig;
