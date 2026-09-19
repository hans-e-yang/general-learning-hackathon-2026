#!/usr/bin/env node
// Circlr capture inspector — a throwaway, dependency-free stand-in for the
// Companion backend that lets you *see* each capture the extension uploads.
//
// It implements just enough of the frozen contract for the extension lane:
//   POST /session                     -> { uuid, eventsUrl }
//   POST /session/:uuid/material     -> store + live-stream the capture
//   GET  /session/:uuid/events       -> SSE stream (snapshot-first)
//   GET  /events[?s=<uuid>]          -> SSE stream across sessions
//   GET  /                            -> the viewer page (also used as the
//                                        side panel iframe's Companion URL)
//   GET  /health                      -> { sessions, captures }
//
// Captures live in memory only: nothing is written to disk, and everything is
// gone when the process exits. Run it on :3000 (the extension's default backend)
// with `npm run inspect`.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const RING_LIMIT = 50;
const MAX_BODY_BYTES = 25 * 1024 * 1024; // a 1280px JPEG is well under this

const here = dirname(fileURLToPath(import.meta.url));
const viewerPath = join(here, "inspect.html");

/** @type {Map<string, object[]>} session uuid -> captures (oldest first) */
const sessions = new Map();
/** @type {Set<{res: import("node:http").ServerResponse, session: string | null}>} */
const clients = new Set();
let seq = 0;

function cors(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

function json(res, status, body) {
  cors(res);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function normalizeImage(image) {
  // The extension sends bare base64; tolerate a data URL from older builds.
  if (typeof image !== "string") return "";
  return image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
}

function sseSend(client, event, data) {
  client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(capture) {
  for (const client of clients) {
    if (client.session === null || client.session === capture.session) {
      sseSend(client, "capture", capture);
    }
  }
}

function openStream(req, res, session) {
  cors(res);
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });
  res.write(": connected\n\n");

  // Snapshot-first: replay what we already have, then stream live captures.
  const history = session ? sessions.get(session) ?? [] : [];
  for (const capture of history) sseSend({ res }, "capture", capture);

  const client = { res, session };
  clients.add(client);
  req.on("close", () => clients.delete(client));
}

const heartbeat = setInterval(() => {
  for (const client of clients) client.res.write(": ping\n\n");
}, 15_000);
heartbeat.unref();

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && (path === "/" || path === "/index.html")) {
    try {
      const html = await readFile(viewerPath, "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(html);
    } catch {
      return json(res, 500, { error: "inspector page missing" });
    }
  }

  if (req.method === "GET" && path === "/health") {
    let captures = 0;
    for (const list of sessions.values()) captures += list.length;
    return json(res, 200, { sessions: sessions.size, captures, clients: clients.size });
  }

  if (req.method === "POST" && path === "/session") {
    const uuid = randomUUID();
    sessions.set(uuid, []);
    const base = `http://${req.headers.host ?? `localhost:${PORT}`}`;
    console.log(`[session] ${uuid}`);
    return json(res, 201, { uuid, eventsUrl: `${base}/session/${uuid}/events` });
  }

  const material = path.match(/^\/session\/([^/]+)\/material$/);
  if (req.method === "POST" && material) {
    const session = decodeURIComponent(material[1]);
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return json(res, 400, { error: "invalid json" });
    }
    const capture = {
      seq: ++seq,
      captureId: randomUUID(),
      session,
      pageIndex: Number(body.pageIndex ?? 0),
      scrollRatio: Number(body.scrollRatio ?? 0),
      timestamp: Number(body.timestamp ?? Date.now()),
      hash: typeof body.hash === "string" ? body.hash : "",
      image: normalizeImage(body.image),
      receivedAt: Date.now()
    };
    const list = sessions.get(session) ?? [];
    list.push(capture);
    if (list.length > RING_LIMIT) list.shift();
    sessions.set(session, list);
    broadcast(capture);
    console.log(
      `[capture] ${session.slice(0, 8)} #${capture.seq} page=${capture.pageIndex} ` +
        `scroll=${capture.scrollRatio} hash=${capture.hash || "(none)"} bytes≈${
          Math.round(capture.image.length * 0.75)
        }`
    );
    return json(res, 202, { accepted: true, deduped: false, captureId: capture.captureId });
  }

  if (req.method === "GET" && path === "/session" ) {
    return json(res, 200, {
      sessions: [...sessions.entries()].map(([uuid, list]) => ({ uuid, captures: list.length }))
    });
  }

  const events = path.match(/^\/session\/([^/]+)\/events$/);
  if (req.method === "GET" && events) {
    return openStream(req, res, decodeURIComponent(events[1]));
  }

  if (req.method === "GET" && path === "/events") {
    return openStream(req, res, url.searchParams.get("s"));
  }

  return json(res, 404, { error: "not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Circlr capture inspector on http://${HOST}:${PORT}`);
  console.log("Point the extension's backend URL here (default) and click Circlr on a document page.");
});
