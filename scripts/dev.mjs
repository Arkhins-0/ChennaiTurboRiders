/**
 * `npm run dev` — the site on 3000, the admin on 4000, one command.
 *
 * There is only ever ONE Next.js process. A second `next dev` would be a second
 * compiler, a second .next directory and two copies of every module in memory,
 * for an app that is one app. Instead port 4000 is a ~40-line reverse proxy onto
 * port 3000 that forwards the request untouched — including its Host header,
 * which still reads `localhost:4000`.
 *
 * That last detail is the whole trick. src/middleware.ts decides which of the
 * two applications to serve by looking at Host, so a request through 4000 takes
 * exactly the code path the admin hostname will take in production. Nothing
 * about the routing is dev-only, and nothing about it is mocked.
 *
 * WebSocket upgrades are proxied too, so hot reload works on both ports.
 *
 * Run only the Next server, on 3000, with: npm run dev:app
 */

import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";

const APP_PORT = Number(process.env.PORT ?? 3000);
const ADMIN_PORT = Number(process.env.ADMIN_PORT ?? 4000);
const UPSTREAM = "127.0.0.1";

/* ── The one Next.js server ───────────────────────────────────────────────── */

// shell:true so this works on Windows, where the binary is next.cmd. npm puts
// node_modules/.bin on PATH for scripts, which is how `next` resolves.
const next = spawn("next", ["dev", "-p", String(APP_PORT)], {
  stdio: "inherit",
  shell: true,
});

next.on("exit", (code) => {
  proxy.close();
  process.exit(code ?? 0);
});

/* ── The admin's port ─────────────────────────────────────────────────────── */

const proxy = http.createServer((req, res) => {
  const upstream = http.request(
    {
      host: UPSTREAM,
      port: APP_PORT,
      method: req.method,
      path: req.url,
      // Forwarded as they arrived. Host stays localhost:4000, which is what the
      // middleware reads to decide this is the admin.
      headers: req.headers,
    },
    (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    }
  );

  upstream.on("error", () => {
    // Almost always "the compiler has not finished starting yet".
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`No answer from the dev server on ${APP_PORT}. Still starting?\n`);
  });

  req.pipe(upstream);
});

/*
 * Hot reload is a WebSocket, which http.request cannot carry. Replay the request
 * line and its raw headers down a plain socket instead and let the two ends talk
 * to each other.
 */
proxy.on("upgrade", (req, clientSocket, head) => {
  const upstream = net.connect(APP_PORT, UPSTREAM, () => {
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n`);
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      upstream.write(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`);
    }
    upstream.write("\r\n");
    if (head?.length) upstream.write(head);

    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });

  upstream.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => upstream.destroy());
});

proxy.listen(ADMIN_PORT, () => {
  console.log(`\n  site   http://localhost:${APP_PORT}`);
  console.log(`  admin  http://localhost:${ADMIN_PORT}\n`);
});

/* ── Shutdown ─────────────────────────────────────────────────────────────── */

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    proxy.close();
    next.kill(signal);
  });
}
