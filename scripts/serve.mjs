// Local static server for the map. Every response is sent with Cache-Control: no-store, so
// a normal refresh always loads the current files. A stale cached module (an old outline.js
// next to a new app.js) stops the whole app from starting.
//
//   node scripts/serve.mjs [port]

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 8765);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const handler = async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain", "Cache-Control": "no-store" }).end("Not found");
  }
};

// Listen on both loopback addresses: "localhost" resolves to ::1 first on Windows, and some
// browsers (Brave) don't fall back to 127.0.0.1. Local machine only either way.
for (const host of ["127.0.0.1", "::1"]) {
  createServer(handler)
    .on("error", (err) => console.warn(`Not listening on ${host}: ${err.message}`))
    .listen(PORT, host, () => console.log(`Serving ${ROOT} at http://${host.includes(":") ? `[${host}]` : host}:${PORT}`));
}
