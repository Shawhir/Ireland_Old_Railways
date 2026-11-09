// Downloads Ireland's railway lines (current and closed) from OpenHistoricalMap
// and saves them to data/rail.geojson, so the app doesn't hit Overpass on every load.
// Also saves the coastlines of Ireland and Britain (outline.js) to data/.
//   node scripts/fetch-data.mjs

import { mkdir, writeFile } from "node:fs/promises";
import { buildGeoJSON, OVERPASS_QUERY, OVERPASS_URL } from "../ohm.js";
import { fetchIrelandOutline, fetchBritainOutline } from "../outline.js";

const dataDir = new URL("../data/", import.meta.url);
const outFile = new URL("rail.geojson", dataDir);

await mkdir(dataDir, { recursive: true });
const outline = await fetchIrelandOutline();
await writeFile(new URL("ireland.geojson", dataDir), JSON.stringify(outline));
console.log(`Saved island outline (${outline.geometry.coordinates.length} polygons) to data/ireland.geojson`);
const britain = await fetchBritainOutline();
await writeFile(new URL("britain.geojson", dataDir), JSON.stringify(britain));
console.log(`Saved Britain's outline (${britain.geometry.coordinates.length} polygons) to data/britain.geojson`);

console.log("Querying Overpass (can take a minute or two)...");
const res = await fetch(OVERPASS_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "Ireland_Old_Railways/0.1",
  },
  body: "data=" + encodeURIComponent(OVERPASS_QUERY),
});
if (!res.ok) {
  console.error(`Overpass returned ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const fc = buildGeoJSON(await res.json());
await writeFile(outFile, JSON.stringify(fc));

const by = {};
for (const f of fc.features) {
  const p = f.properties;
  const key = p.status === "current" ? "current" : p.closed_year ? "closed (dated)" : "closed (no date)";
  by[key] = (by[key] || 0) + p.km;
}
console.log(`Saved ${fc.features.length} ways to data/rail.geojson`);
for (const [k, km] of Object.entries(by)) console.log(`  ${k}: ${Math.round(km)} km`);
