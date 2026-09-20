import "server-only";

import { DEFAULT_UPLOAD_FOLDER } from "@/lib/mediaPaths";
import { findUsage } from "@/lib/server/mediaUsage";
import { rewriteKeyPrefix } from "@/lib/server/mediaRefs";
import {
  copyFolder,
  copyObject,
  deleteObjects,
  listFolderDeep,
  prefixFor,
} from "@/lib/server/s3";

/**
 * A record's own folder, moved when its address moves and emptied when it goes.
 *
 * ── The invariant ─────────────────────────────────────────────────────────
 *
 * An entity folder exists if and only if the entity exists. Everything in this
 * file is in service of that one sentence: a renamed deck's pictures follow it,
 * and a deleted deck leaves nothing behind but the files somebody ELSE is using.
 *
 * ── Ordering, which is the whole difficulty ───────────────────────────────
 *
 * None of this is transactional with Postgres, and it cannot be made so: S3 has
 * no rename, no transaction and no rollback. What can be chosen is the order,
 * and there is only one defensible one.
 *
 *     copy  →  re-address the database  →  delete the originals
 *
 * A failure at any point leaves duplicate objects and a database pointing at one
 * consistent set of them. Duplicates are recoverable — re-run, or sweep later.
 * The other order, deleting before re-addressing, leaves rows pointing at keys
 * that are gone, which is a broken picture on a live page and nothing to
 * reconstruct it from.
 *
 * ── Why a failure here must not fail the save ─────────────────────────────
 *
 * By the time these are called the row is already written or already deleted.
 * Turning a folder problem into a 500 would tell the editor their edit was lost
 * when it was not. The callers log and carry on; the cost of that is a folder at
 * the old address, which is untidy, visible in the explorer, and fixable.
 */

/**
 * The files that were under `from`, now under `to`, with every reference moved.
 *
 * Safe to call when the old folder never existed — a record whose pictures were
 * all uploaded before it had an address has nothing to move, and this leaves a
 * browsable empty folder at the new one.
 */
export async function moveEntityFolder(from: string, to: string): Promise<number> {
  if (!from || !to || from === to) return 0;

  const { pairs, markers } = await copyFolder(from, to);

  // Between the two halves. Everything that pointed into the old folder now
  // points into the new one, and the objects are already there to be found.
  await rewriteKeyPrefix(prefixFor(from), prefixFor(to));

  await deleteObjects([...pairs.map((pair) => pair.from), ...markers]);

  return pairs.length;
}

/**
 * Empties and removes a record's folder, rescuing anything still in use.
 *
 * CALL AFTER the row is gone, never before. That ordering is what makes the scan
 * below mean what it says: with the deck and its `deck_pages` already deleted,
 * every reference `findUsage` can still see is by definition a reference from
 * somewhere else — a section of a page, another record, a form's help text. No
 * partitioning, no owner to exclude, no chance of mistaking a record's own rows
 * for somebody else's.
 *
 * Survivors are moved to `uploads/` rather than left where they are. Leaving
 * them would mean a folder named after a deck that no longer exists, which the
 * next deck to take that address would silently adopt, inheriting a stray
 * picture nobody put there. `uploads/` is the folder that belongs to no page and
 * makes no claim about what is in it, which is exactly right for a file whose
 * owner has just been deleted.
 *
 * Fails CLOSED. If the scan throws, nothing is deleted — a database outage must
 * never read as "no references found, deleting".
 */
export async function deleteEntityFolder(
  folder: string
): Promise<{ deleted: number; rescued: number }> {
  if (!folder) return { deleted: 0, rescued: 0 };

  const { files, markers, truncated } = await listFolderDeep(folder);

  if (truncated) {
    throw new Error(`"${folder}" holds too many files to remove in one go.`);
  }

  if (files.length === 0) {
    await deleteObjects(markers);
    return { deleted: 0, rescued: 0 };
  }

  // Not caught here. The callers treat any throw as "leave the folder alone",
  // which is the correct response to not knowing what is referenced.
  const usage = await findUsage(files.map((file) => file.key));
  const survivors = usage.filter((row) => row.refs.length > 0).map((row) => row.key);

  if (survivors.length > 0) {
    const from = prefixFor(folder);
    const to = prefixFor(DEFAULT_UPLOAD_FOLDER);

    // Same relative path under the new folder, so one prefix rewrite re-addresses
    // all of them — including any that sat in a subfolder.
    for (let at = 0; at < survivors.length; at += 10) {
      await Promise.all(
        survivors
          .slice(at, at + 10)
          .map((key) => copyObject(key, `${to}${key.slice(from.length)}`))
      );
    }

    await rewriteKeyPrefix(from, to);
  }

  await deleteObjects([...files.map((file) => file.key), ...markers]);

  return { deleted: files.length - survivors.length, rescued: survivors.length };
}
