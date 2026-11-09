// Names every section of line in data/rail.geojson by the places at its two ends, as a ticket
// names a journey: "Mallow – Tralee". (OpenHistoricalMap names only 32 of the 630 sections, some of
// them only a bridge.) Saves data/line-names.json, keyed by each section's oid: { from, to, name }.
//
// Each end takes the best town near it (data/towns.json): one with a station on the railway first,
// then the larger, then the nearer; in the English form the map uses (places.js). A section whose
// ends find the same town takes the best town near its middle for the other end. Where the data has
// a real line name ("Tralee and Dingle Light Railway"), it's kept as `name`; bridges and such aren't.
//   node scripts/name-lines.mjs

import { readFile, writeFile } from "node:fs/promises";
import { englishName } from "../places.js";

const KM = [66.2, 110.6];
const read = async (f) => JSON.parse(await readFile(new URL(f, import.meta.url), "utf8"));
const rail = await read("../data/rail.geojson");
const towns = await read("../data/towns.json");

const dist = (a, b) => Math.hypot((a[0] - b[0]) * KM[0], (a[1] - b[1]) * KM[1]);
// The best town for a point: stations first (on the railway, within 1.2 km), then size, then
// nearness; within `reach` km.
const best = (pt, reach = 12, not = null) => {
  let top = null, topScore = -Infinity;
  for (const t of towns) {
    const name = englishName(t.name);
    if (name === not) continue;
    const d = dist(pt, [t.lon, t.lat]);
    if (d > reach) continue;
    const station = Math.min(t.cur_km ?? 99, t.old_km ?? 99) <= 1.2;
    const score = (station ? 3 : 0) + Math.log10((t.pop || 0) + 50) - d / 2.5;
    if (score > topScore) { topScore = score; top = name; }
  }
  return top;
};

const NOT_A_LINE = /bridge|viaduct|tunnel|siding|spur|halt|station|yard|depot/i;
const out = {};
let named = 0;
for (const f of rail.features) {
  const c = f.geometry.coordinates, p = f.properties;
  const a = c[0], b = c[c.length - 1];
  let from = best(a) || best(a, 30), to = best(b, 12, from) || best(b, 30, from);
  if (!to || to === from) to = best(c[Math.floor(c.length / 2)], 30, from);
  const name = p.name && !NOT_A_LINE.test(p.name) ? p.name : null;
  out[p.oid] = { from, to, ...(name ? { name } : {}) };
  if (from && to) named++;
}
await writeFile(new URL("../data/line-names.json", import.meta.url), JSON.stringify(out));
console.log(`Named ${named} of ${rail.features.length} sections by their ends.`);
