// Saves Ireland's main loughs and rivers to data/water.geojson, drawn on the map as the 1920
// railway map draws them: loughs tinted like the sea with an ink edge, rivers as fine ink lines.
// From Natural Earth (public domain): its 1:10m lakes and river centrelines, plus the European
// supplements, which add the western loughs and the Barrow, Suir and Blackwater. Cut to the
// island.
//   node scripts/fetch-water.mjs

import { writeFile } from "node:fs/promises";

const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/";
const LAYERS = [
  ["ne_10m_lakes.geojson", "lake"], ["ne_10m_lakes_europe.geojson", "lake"],
  ["ne_10m_rivers_lake_centerlines.geojson", "river"], ["ne_10m_rivers_europe.geojson", "river"],
];
const BOX = { lon: [-10.8, -5.3], lat: [51.3, 55.5] };

const inBox = ([lon, lat]) => lon >= BOX.lon[0] && lon <= BOX.lon[1] && lat >= BOX.lat[0] && lat <= BOX.lat[1];
const points = (g) => ({
  LineString: () => g.coordinates, MultiLineString: () => g.coordinates.flat(),
  Polygon: () => g.coordinates.flat(), MultiPolygon: () => g.coordinates.flat(2),
})[g.type]();
const round = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === "number" ? Math.round(x * 1e5) / 1e5 : x)));

const features = [];
const seen = new Set();
for (const [file, kind] of LAYERS) {
  const res = await fetch(NE + file);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  for (const f of (await res.json()).features) {
    // Ireland's, not Britain's: nearly all of a feature's points on the island's side of the box.
    const pts = points(f.geometry);
    if (!pts.length || pts.filter(inBox).length < pts.length * 0.8) continue;
    const name = f.properties.name || f.properties.NAME || "";
    const key = `${kind}:${name}:${JSON.stringify(pts[0])}`;
    if (seen.has(key)) continue;
    seen.add(key);
    features.push({ type: "Feature", properties: { kind, name }, geometry: round(f.geometry) });
  }
}
await writeFile(new URL("../data/water.geojson", import.meta.url), JSON.stringify({ type: "FeatureCollection", features }));
const names = (kind) => [...new Set(features.filter((f) => f.properties.kind === kind).map((f) => f.properties.name || "unnamed"))].join(", ");
console.log(`Saved loughs: ${names("lake")}\nand rivers: ${names("river")}`);
