import { readFileSync, writeFileSync } from "node:fs";
const [placesFile, railFile, outFile] = process.argv.slice(2);
const places = JSON.parse(readFileSync(placesFile)).elements;
const rail = JSON.parse(readFileSync(railFile)).features;
const KX = 111.32 * Math.cos(53.5 * Math.PI / 180), KY = 110.57; // km per degree near Ireland
const segs = { current: [], closed: [] };
for (const f of rail) {
  const c = f.geometry.coordinates, p = f.properties;
  for (let i = 1; i < c.length; i++) segs[p.status].push([c[i-1][0]*KX, c[i-1][1]*KY, c[i][0]*KX, c[i][1]*KY, p.closed_year, p.oid]);
}
function nearest(list, x, y) {
  let best = Infinity, hit = null;
  for (const s of list) {
    const [ax, ay, bx, by] = s; const dx = bx-ax, dy = by-ay; const L = dx*dx+dy*dy;
    let t = L ? ((x-ax)*dx + (y-ay)*dy) / L : 0; t = Math.max(0, Math.min(1, t));
    const ex = ax + t*dx - x, ey = ay + t*dy - y; const d = ex*ex + ey*ey;
    if (d < best) { best = d; hit = s; }
  }
  return { km: Math.sqrt(best), seg: hit };
}
const R = 3; // km: a town within this distance of a line is treated as served by it
const rows = [];
for (const e of places) {
  const t = e.tags; const lon = e.lon, lat = e.lat;
  const pop = parseInt(String(t.population || "").replace(/[ ,]/g, ""), 10) || 0;
  const x = lon*KX, y = lat*KY;
  const cur = nearest(segs.current, x, y), old = nearest(segs.closed, x, y);
  const cls = cur.km <= R ? "served_now" : old.km <= R ? "lost_rail" : "never";
  rows.push({ name: t.name, place: t.place, pop, popDate: t["population:date"] || "", lon, lat, cur_km: +cur.km.toFixed(2), old_km: +old.km.toFixed(2), closed_year: cls === "lost_rail" ? old.seg[4] : null, cls });
}
const sum = {};
for (const r of rows) { const k = `${r.cls}`; sum[k] ??= { places: 0, towns: 0, withPop: 0, pop: 0, villages: 0 }; const s = sum[k]; s.places++; if (r.place !== "village") s.towns++; else s.villages++; if (r.pop) { s.withPop++; s.pop += r.pop; } }
console.log("radius", R, "km"); console.table(sum);
const lost = rows.filter(r => r.cls === "lost_rail" && r.place !== "village").sort((a, b) => b.pop - a.pop);
console.log("largest towns that lost rail:"); for (const r of lost.slice(0, 30)) console.log(`  ${r.name.padEnd(22)} ${String(r.pop).padStart(7)}  closed ${r.closed_year}  now ${r.cur_km} km from open line`);
const byDecade = {}; for (const r of rows.filter(r => r.cls === "lost_rail")) { const d = r.closed_year ? Math.floor(r.closed_year/10)*10 + "s" : "?"; byDecade[d] ??= { places: 0, pop: 0 }; byDecade[d].places++; byDecade[d].pop += r.pop; }
console.log("lost rail by closure decade:"); console.table(byDecade);
const yrs = {}; for (const r of rows) if (r.popDate) { const y = r.popDate.slice(0, 4); yrs[y] = (yrs[y] || 0) + 1; } console.log("population:date years", yrs);
writeFileSync(outFile, JSON.stringify(rows));
