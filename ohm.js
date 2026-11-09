// Turns an OpenHistoricalMap Overpass response into GeoJSON line features.
// OpenHistoricalMap maps railways as they were, with start_date/end_date,
// so closed lines stay complete instead of only the parts still visible today.
// Shared by the browser app and scripts/fetch-data.mjs.

export const OVERPASS_URL = "https://overpass-api.openhistoricalmap.org/api/interpreter";

// OHM has no present-day country areas to filter on, so use a box around the island
// and drop the corner of Kintyre that falls inside it (see inIreland).
export const OVERPASS_QUERY = `
[out:json][timeout:180];
way["railway"~"^(rail|narrow_gauge|monorail|abandoned|disused|dismantled|razed)$"](51.3,-10.7,55.45,-5.4);
out tags geom;
`;

const YEAR = /\b(1[6-9]\d\d|20\d\d)\b/;

function yearOf(value) {
  const m = value && String(value).match(YEAR);
  return m ? Number(m[1]) : 0; // 0 = unknown
}

function gaugeOf(tags) {
  const mm = parseInt(String(tags.gauge || "").split(";")[0], 10);
  if (!mm) return tags.railway === "narrow_gauge" ? "Narrow gauge" : "";
  if (mm === 1600) return "Irish standard (5 ft 3 in)";
  if (mm === 914) return "Narrow (3 ft)";
  if (mm === 1435) return "Standard (4 ft 8½ in)";
  if (mm < 1435) return `Narrow (${mm} mm)`;
  return `${mm} mm`;
}

// Scotland's Kintyre peninsula sits inside the query box, north-east of Antrim.
function inIreland(points) {
  const mid = points[Math.floor(points.length / 2)];
  return !(mid.lat > 55.25 && mid.lon > -6.0);
}

function lengthKm(points) {
  const R = 6371, rad = Math.PI / 180;
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    km += 2 * R * Math.asin(Math.sqrt(h));
  }
  return km;
}

export function buildGeoJSON(ohm) {
  const features = [];
  let oid = 1;
  for (const el of ohm.elements || []) {
    if (el.type !== "way" || !el.geometry) continue;
    const points = el.geometry.filter(Boolean);
    if (points.length < 2 || !inIreland(points)) continue;
    const t = el.tags || {};
    const closedYear = yearOf(t.end_date);
    const lifecycleTag = ["abandoned", "disused", "dismantled", "razed"].includes(t.railway);
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: points.map((p) => [+p.lon.toFixed(6), +p.lat.toFixed(6)]),
      },
      properties: {
        oid: oid++,
        way_id: String(el.id),
        name: t.name || "",
        status: closedYear || lifecycleTag ? "closed" : "current",
        operator: t.operator || "",
        gauge: gaugeOf(t),
        opened_year: yearOf(t.start_date),
        closed_year: closedYear,
        km: +lengthKm(points).toFixed(3),
      },
    });
  }
  return { type: "FeatureCollection", generated: new Date().toISOString(), features };
}
