// Hachures for the island's hills and mountains, as the 1920 railway map engraves them: short
// strokes running straight down the slope, packed closer and drawn heavier where it's steeper,
// so the peaks come out as dark starbursts. Saves data/hachures.json: for each weight, every stroke
// as whole numbers of 1/10,000 degree (about 11 m), its first point then each step from the last,
// which keeps 20,000 strokes to a small file (hachures.js decodes it).
//
// Heights from the AWS Terrain Tiles (Mapzen "terrarium" PNGs, open data: SRTM and others) at
// zoom 9, about 180 m a pixel here. Strokes start on a jittered grid, kept with a likelihood
// that grows with the slope, and follow the fall line downhill for a short way.
//   node scripts/make-hachures.mjs           (Ireland: data/hachures.json)
//   node scripts/make-hachures.mjs britain   (Britain, for the opening: data/hachures-britain.json,
//                                              a little sparser, as it's only seen from afar)

import { readFile, writeFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

const Z = 9;
const REGION = process.argv[2] === "britain" ? "britain" : "ireland";
const BOX = REGION === "britain" ? { lon: [-6.5, 1.8], lat: [49.9, 58.7] } : { lon: [-10.7, -5.4], lat: [51.35, 55.45] };
const OUTLINE = REGION === "britain" ? "../data/britain.geojson" : "../data/ireland.geojson";
const OUT = REGION === "britain" ? "../data/hachures-britain.json" : "../data/hachures.json";
const TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";

// Strokes: seed spacing (m), which ground gets them, how long they run, the step along them.
const SPACING = process.argv[2] === "britain" ? 900 : 480;
const MIN_HEIGHT = 110;   // m: below this it's lowland, left plain as on the old map
const MIN_SLOPE = 0.06;   // rise over run (3.5 degrees)
const FULL_SLOPE = 0.26;  // from here every seed gets a stroke
const STEEP = 0.16;       // steeper than this, the heavier stroke
const LENGTH = 1600, STEP = 160;

// ---- A small PNG decoder (8-bit RGB or RGBA, non-interlaced: what the tiles are) ----
function decodePng(buf) {
  let pos = 8, width = 0, height = 0, channels = 3;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error("unsupported PNG");
      channels = { 2: 3, 6: 4 }[data[9]];
      if (!channels) throw new Error(`unsupported PNG colour type ${data[9]}`);
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * channels;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      out[y * stride + x] = (line[x] + pred) & 255;
    }
  }
  return { width, height, channels, data: out };
}

// ---- Heights for the box, as one mosaic ----
const tileX = (lon) => ((lon + 180) / 360) * 2 ** Z;
const tileY = (lat) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z; };
const [x0, x1] = [Math.floor(tileX(BOX.lon[0])), Math.floor(tileX(BOX.lon[1]))];
const [y0, y1] = [Math.floor(tileY(BOX.lat[1])), Math.floor(tileY(BOX.lat[0]))];
const W = (x1 - x0 + 1) * 256, H = (y1 - y0 + 1) * 256;
const height = new Float32Array(W * H);
const jobs = [];
for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
  jobs.push((async () => {
    const res = await fetch(`${TILES}/${Z}/${tx}/${ty}.png`);
    if (!res.ok) throw new Error(`tile ${Z}/${tx}/${ty}: HTTP ${res.status}`);
    const png = decodePng(Buffer.from(await res.arrayBuffer()));
    for (let py = 0; py < 256; py++) for (let px = 0; px < 256; px++) {
      const i = (py * 256 + px) * png.channels, d = png.data;
      height[((ty - y0) * 256 + py) * W + (tx - x0) * 256 + px] = d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
    }
  })());
}
await Promise.all(jobs);
console.log(`Heights: ${jobs.length} tiles, ${W} x ${H}`);

const heightAt = (lon, lat) => {
  const fx = (tileX(lon) - x0) * 256 - 0.5, fy = (tileY(lat) - y0) * 256 - 0.5;
  const ix = Math.max(0, Math.min(W - 2, Math.floor(fx))), iy = Math.max(0, Math.min(H - 2, Math.floor(fy)));
  const u = fx - ix, v = fy - iy, h = (x, y) => height[y * W + x];
  return (h(ix, iy) * (1 - u) + h(ix + 1, iy) * u) * (1 - v) + (h(ix, iy + 1) * (1 - u) + h(ix + 1, iy + 1) * u) * v;
};
const M_LAT = 110540, mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);
// Downhill direction (east, north, unit) and slope (rise over run), from heights 200 m apart.
const fall = (lon, lat) => {
  const d = 200, dl = d / mLon(lat), dp = d / M_LAT;
  const gx = (heightAt(lon + dl, lat) - heightAt(lon - dl, lat)) / (2 * d);
  const gy = (heightAt(lon, lat + dp) - heightAt(lon, lat - dp)) / (2 * d);
  const s = Math.hypot(gx, gy);
  return { slope: s, e: -gx / (s || 1), n: -gy / (s || 1) };
};

// ---- Only the island (not Scotland's or Wales's hills in the box) ----
const outline = JSON.parse(await readFile(new URL(OUTLINE, import.meta.url), "utf8"));
const polys = outline.geometry.coordinates.map(([ring]) => {
  let [a, b, c, d] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const [x, y] of ring) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); d = Math.max(d, y); }
  return { ring, box: [a, b, c, d] };
});
const onIsland = (lon, lat) => polys.some(({ ring, box }) => {
  if (lon < box[0] || lon > box[1] || lat < box[2] || lat > box[3]) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
});

// ---- Strokes ----
let seed = 20200;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const steep = [], gentle = [];
const r5 = (v) => Math.round(v * 1e4) / 1e4; // about 11 m: finer than the strokes ever show
for (let lat = BOX.lat[0]; lat < BOX.lat[1]; lat += SPACING / M_LAT) {
  for (let lon = BOX.lon[0]; lon < BOX.lon[1]; lon += SPACING / mLon(lat)) {
    let x = lon + ((rand() - 0.5) * SPACING) / mLon(lat), y = lat + ((rand() - 0.5) * SPACING) / M_LAT;
    if (heightAt(x, y) < MIN_HEIGHT) continue;
    const f0 = fall(x, y);
    const keep = Math.min(1, Math.max(0, (f0.slope - MIN_SLOPE) / (FULL_SLOPE - MIN_SLOPE))) ** 0.75;
    if (rand() > keep || !onIsland(x, y)) continue;
    // Follow the fall line downhill, stopping where the ground flattens out.
    const path = [[r5(x), r5(y)]];
    for (let run = 0; run < LENGTH; run += STEP) {
      const f = fall(x, y);
      if (f.slope < MIN_SLOPE * 0.6) break;
      x += (f.e * STEP) / mLon(y); y += (f.n * STEP) / M_LAT;
      path.push([r5(x), r5(y)]);
    }
    if (path.length > 2) (f0.slope > STEEP ? steep : gentle).push(path);
  }
}
const encode = (paths) => paths.map((path) => path.flatMap(([x, y], i) => {
  const q = [Math.round(x * 1e4), Math.round(y * 1e4)];
  if (i === 0) return q;
  return [q[0] - Math.round(path[i - 1][0] * 1e4), q[1] - Math.round(path[i - 1][1] * 1e4)];
}));
await writeFile(new URL(OUT, import.meta.url), JSON.stringify({ steep: encode(steep), gentle: encode(gentle) }));
console.log(`Saved ${steep.length} steep and ${gentle.length} gentler hachures.`);
