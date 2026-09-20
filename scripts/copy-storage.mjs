/*
 * Copy every object under a prefix from one bucket into the bucket this
 * deployment is configured with (S3_*), keeping keys, content types and cache
 * headers. Used to move media between providers — AWS S3 → Neon object
 * storage — without touching the database, which stores each object's key.
 *
 *   SOURCE_S3_BUCKET=… SOURCE_S3_REGION=… SOURCE_S3_ACCESS_KEY_ID=… SOURCE_S3_SECRET_ACCESS_KEY=… \
 *   [SOURCE_S3_ENDPOINT=…] [SOURCE_PREFIX=ctr-sports/] npm run storage:copy
 *
 * The target is read from .env (S3_BUCKET, S3_REGION, S3_ENDPOINT, keys). The
 * prefix defaults to `ctr-sports/`, which is everything this project owns; a
 * shared bucket may hold other projects' objects and those are left alone.
 *
 * Re-running is safe: an object already on the target with the same size is
 * skipped (pass --force to overwrite). Afterwards every copied key is read
 * back from the target and its md5 compared with the source copy.
 */

import { createHash } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const CONCURRENCY = 8;

function config(prefix) {
  const env = (k) => process.env[`${prefix}${k}`];
  const bucket = env("BUCKET");
  const accessKeyId = env("ACCESS_KEY_ID");
  const secretAccessKey = env("SECRET_ACCESS_KEY");
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(`${prefix}BUCKET, ${prefix}ACCESS_KEY_ID and ${prefix}SECRET_ACCESS_KEY must all be set`);
  }
  const endpoint = env("ENDPOINT")?.replace(/\/+$/, "") || undefined;
  return {
    bucket,
    client: new S3Client({
      region: env("REGION") || "us-east-1",
      endpoint,
      forcePathStyle: Boolean(endpoint),
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

async function listAll(client, bucket, prefix) {
  const out = [];
  let token;
  do {
    const r = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
    );
    for (const o of r.Contents ?? []) if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0 });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

async function fetchObject(client, bucket, key) {
  const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = Buffer.from(await r.Body.transformToByteArray());
  return {
    body,
    md5: createHash("md5").update(body).digest("hex"),
    contentType: r.ContentType,
    cacheControl: r.CacheControl,
    contentDisposition: r.ContentDisposition,
    metadata: r.Metadata,
  };
}

async function headSize(client, bucket, key) {
  try {
    return (await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))).ContentLength ?? null;
  } catch (err) {
    if (err?.name === "NotFound") return null;
    throw err;
  }
}

async function inParallel(items, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

async function main() {
  const force = process.argv.includes("--force");
  const prefix = process.env.SOURCE_PREFIX ?? "ctr-sports/";
  const source = config("SOURCE_S3_");
  const target = config("S3_");

  const objects = await listAll(source.client, source.bucket, prefix);
  const total = objects.reduce((n, o) => n + o.size, 0);
  console.log(`${objects.length} objects (${(total / 1048576).toFixed(1)} MB) under ${prefix} in ${source.bucket}\n`);

  const md5s = new Map();
  let copied = 0;
  let skipped = 0;
  await inParallel(objects, async (o) => {
    const existing = force ? null : await headSize(target.client, target.bucket, o.key);
    const obj = await fetchObject(source.client, source.bucket, o.key);
    md5s.set(o.key, obj.md5);
    if (existing === o.size) {
      skipped += 1;
      return;
    }
    await target.client.send(
      new PutObjectCommand({
        Bucket: target.bucket,
        Key: o.key,
        Body: obj.body,
        ContentType: obj.contentType,
        CacheControl: obj.cacheControl,
        ContentDisposition: obj.contentDisposition,
        Metadata: obj.metadata,
      })
    );
    copied += 1;
    if (copied % 25 === 0) console.log(`  ${copied} copied…`);
  });
  console.log(`\n${copied} copied, ${skipped} already present\n`);

  console.log("verifying…");
  const onTarget = new Map((await listAll(target.client, target.bucket, prefix)).map((o) => [o.key, o.size]));
  const problems = [];
  await inParallel(objects, async (o) => {
    if (onTarget.get(o.key) !== o.size) {
      problems.push(`${o.key}: size ${o.size} → ${onTarget.get(o.key) ?? "missing"}`);
      return;
    }
    const back = await fetchObject(target.client, target.bucket, o.key);
    if (back.md5 !== md5s.get(o.key)) problems.push(`${o.key}: md5 differs`);
  });
  source.client.destroy();
  target.client.destroy();

  if (problems.length > 0) {
    for (const problem of problems) console.error("  ✗ " + problem);
    throw new Error(`${problems.length} object(s) differ after copy`);
  }
  console.log(`  ✓ ${objects.length} objects match byte-for-byte on ${target.bucket}\n\nCopy complete ✓`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
