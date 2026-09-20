/**
 * What the media routes send back, as the browser sees it.
 *
 * Declared here rather than imported from `src/lib/server/s3.ts` and
 * `src/lib/server/mediaUsage.ts`: those are `server-only`, and a client
 * component that imports a type from one of them drags the module into the
 * bundle graph. These are the wire shapes, which is a different thing from the
 * server's own — they have already been through `JSON.stringify`, so `Date` is a
 * string here and always was.
 */

export type MediaObject = {
  key: string;
  url: string;
  size: number;
  /** ISO. Only ever displayed or sorted. */
  uploadedAt: string;
};

export type MediaFolder = { path: string; name: string };

export type Listing = {
  configured: boolean;
  folder: string;
  folders: MediaFolder[];
  files: MediaObject[];
  /** The cap was hit. The screen says so rather than implying it saw everything. */
  truncated: boolean;
  /** Whether this account may upload into, or delete from, the folder shown. */
  canWrite: boolean;
  /** Only sent for the root: the top-level folders this account may see. */
  roots?: string[];
};

export type UsageRef = { kind: string; label: string; site: string | null };
export type KeyUsage = { key: string; refs: UsageRef[] };
