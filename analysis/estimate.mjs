// Rough estimate of how many rail journeys the closed lines would carry today.
//   node analysis/estimate.mjs
// Inputs: data/towns.json from analysis/classify-towns.mjs (OSM towns, distance to open/closed lines).
// Outputs: data/lost-towns.geojson (the map's towns layer) and data/impact.json (the panel's numbers).
import { readFileSync, writeFileSync } from "node:fs";

const towns = JSON.parse(readFileSync(new URL("../data/towns.json", import.meta.url)));

// When a town lost its railway: when the LAST closed line within reach of it closed, not the
// nearest one (Letterkenny's nearest was the Burtonport extension, closed 1947, but its lines to
// Derry and Strabane ran until 1953 and 1960).
const REACH_KM = 3; // as analysis/classify-towns.mjs
const rail = JSON.parse(readFileSync(new URL("../data/rail.geojson", import.meta.url))).features;
const KX = 111.32 * Math.cos(53.5 * Math.PI / 180), KY = 110.57;
const closedSegs = [];
for (const f of rail) {
  if (f.properties.status !== "closed" || !f.properties.closed_year) continue;
  const c = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const line of c) for (let i = 1; i < line.length; i++) closedSegs.push([line[i - 1][0] * KX, line[i - 1][1] * KY, line[i][0] * KX, line[i][1] * KY, f.properties.closed_year]);
}
const lastClosure = (lon, lat) => {
  const x = lon * KX, y = lat * KY;
  let year = 0;
  for (const [ax, ay, bx, by, yr] of closedSegs) {
    if (yr <= year) continue;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    if (Math.hypot(ax + t * dx - x, ay + t * dy - y) <= REACH_KM) year = yr;
  }
  return year;
};

// Corrections the line data can't see.
const LOST_PASSENGER_SERVICE = { Navan: 1958 }; // track still used by Tara Mines freight, no passengers since 1958
const NOW_ON_LUAS = ["Rathfarnham"]; // Harcourt Street line is now the Luas Green Line

// Places OSM has no population for.
const ASSUMED_POP = { village: 550, town: 2500 }; // village = median of tagged villages; towns kept below the tagged median (5,752)

// Belts around cities where rail is used for commuting.
const CITIES = { Dublin: [-6.26, 53.35, 45], Belfast: [-5.93, 54.6, 45], Cork: [-8.47, 51.9, 25],
  Limerick: [-8.63, 52.66, 25], Galway: [-9.05, 53.27, 25], Derry: [-7.31, 55.0, 25] };
const km = (a, b) => Math.hypot((a[0] - b[0]) * 66.2, (a[1] - b[1]) * 110.6);

// Station boardings per resident per year (census-day boardings x 300 / town population),
// from NTA National Rail Census 2024. Regional towns run ~1.5 (Enniscorthy) to ~10 (Sligo, Mullingar),
// median ~5. Commuter-belt rates are an assumption: higher frequency and a city job market.
const RATES = {
  regional: { low: 2, central: 5, high: 10 },
  commuter: { low: 10, central: 20, high: 40 },
};
const JOURNEYS_PER_BOARDING = 2; // the return leg boards at the other end

const groups = { regional: 0, commuter: 0 };
const counted = { regional: 0, commuter: 0 };
const features = [];
for (const t of towns) {
  let lost = t.cls === "lost_rail";
  const passengerClosure = LOST_PASSENGER_SERVICE[t.name];
  if (passengerClosure) lost = true;
  if (NOW_ON_LUAS.includes(t.name)) lost = false;
  if (!lost) continue;
  const pop = t.pop || ASSUMED_POP[t.place === "village" ? "village" : "town"];
  const belt = Object.entries(CITIES).find(([, [lon, lat, r]]) => km([t.lon, t.lat], [lon, lat]) <= r)?.[0] || "";
  const g = belt ? "commuter" : "regional";
  groups[g] += pop;
  counted[g]++;
  features.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: [t.lon, t.lat] },
    properties: {
      oid: features.length + 1,
      name: t.name,
      place: t.place,
      pop,
      pop_assumed: t.pop ? 0 : 1,
      closed_year: passengerClosure || lastClosure(t.lon, t.lat) || t.closed_year || 0,
      open_line_km: passengerClosure ? 0 : t.cur_km,
      belt,
    },
  });
}
writeFileSync(new URL("../data/lost-towns.geojson", import.meta.url),
  JSON.stringify({ type: "FeatureCollection", features }));

const m = (n) => (n / 1e6).toFixed(1) + "m";
console.log("People in towns/villages within 3 km of a closed line (today's populations):");
for (const g of Object.keys(groups)) console.log(`  ${g}: ${m(groups[g])} in ${counted[g]} places`);
console.log(`  total: ${m(groups.regional + groups.commuter)}`);

console.log("\nJourneys per year if those lines ran today:");
const totals = {};
for (const s of ["low", "central", "high"]) {
  totals[s] = 0;
  const parts = Object.keys(groups).map((g) => {
    const j = groups[g] * RATES[g][s] * JOURNEYS_PER_BOARDING;
    totals[s] += j;
    return `${g} ${m(j)}`;
  });
  console.log(`  ${s.padEnd(7)} ${m(totals[s]).padStart(6)}  (${parts.join(", ")})`);
}

// Car trips removed: Borders Railway year-1 evaluation found ~35% of trips were new,
// and 57% of people who switched mode had driven the whole way before.
const CAR_SHARE = (1 - 0.35) * 0.57;
console.log(`\nCar-driver trips replaced (${Math.round(CAR_SHARE * 100)}% of rail journeys):`);
const carPerWeekday = {};
for (const s of ["low", "central", "high"]) {
  const y = totals[s] * CAR_SHARE;
  carPerWeekday[s] = Math.round(y / 300);
  console.log(`  ${s.padEnd(7)} ${m(y)} a year, ~${Math.round(y / 300 / 1000)}k per weekday`);
}

writeFileSync(new URL("../data/impact.json", import.meta.url), JSON.stringify({
  people: groups.regional + groups.commuter,
  places: counted.regional + counted.commuter,
  journeys: totals,
  carTripsPerWeekday: carPerWeekday,
}, null, 2));
console.log(`\nSaved ${features.length} towns to data/lost-towns.geojson and the totals to data/impact.json`);
