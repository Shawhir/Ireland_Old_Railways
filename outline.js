// Outline of the island of Ireland (Republic + Northern Ireland), used to mask
// out Britain and the rest of the basemap. Shared by the app and scripts/fetch-data.mjs,
// which saves both outlines to data/ so the app doesn't fetch them on every load.
//
// The detailed (not generalized) World Countries layer, so the coast follows the basemap's own
// into the bays and inlets: the generalized one is off by kilometres in places (Clew Bay, the
// Shannon, Lough Foyle), and the grey basemap showed through wherever it cut across the water.

const COUNTRIES_URL =
  "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/World_Countries/FeatureServer/0/query";

// Ireland closely (about 50 m), Britain loosely: it's only seen from far out, in the opening.
const DETAIL = {
  island: { offsetDeg: 0.0006, minKm2: 0.2 },
  britain: { offsetDeg: 0.003, minKm2: 5 },
};

// Northern Ireland is the part of the UK polygon west of the North Channel, south of the
// Scottish islands (Rathlin, its northernmost point, is ~55.3°N) and north of 54°N, which keeps
// out the Isles of Scilly (49.9°N, also west of 5.4°W) now that the detailed layer includes them.
const isNorthernIreland = (polygon) => polygon[0].every(([lon, lat]) => lon < -5.4 && lat < 55.45 && lat > 54);

// Rough area of a ring in km² (shoelace on degrees, scaled at the ring's latitude).
const ringKm2 = (ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  const lat = (ring[0][1] * Math.PI) / 180;
  return (Math.abs(a) / 2) * 111.32 * 111.32 * Math.cos(lat);
};

async function fetchPolygons(isos, { offsetDeg, minKm2 }) {
  const params = new URLSearchParams({
    where: `ISO_CC IN (${isos.map((c) => `'${c}'`).join(",")})`,
    outFields: "ISO_CC",
    outSR: "4326",
    maxAllowableOffset: String(offsetDeg),
    geometryPrecision: "5",
    f: "geojson",
  });
  const res = await fetch(`${COUNTRIES_URL}?${params}`);
  if (!res.ok) throw new Error(`World Countries service returned ${res.status}`);
  const { features } = await res.json();
  const polygons = [];
  for (const f of features) {
    const g = f.geometry;
    for (const p of g.type === "Polygon" ? [g.coordinates] : g.coordinates) {
      if (p[0].length >= 4 && ringKm2(p[0]) >= minKm2) polygons.push({ iso: f.properties.ISO_CC, p });
    }
  }
  return polygons;
}

export async function fetchIrelandOutline() {
  const polygons = (await fetchPolygons(["IRL", "GBR"], DETAIL.island))
    .filter(({ iso, p }) => iso === "IRL" || isNorthernIreland(p))
    .map(({ p }) => p);
  return {
    type: "Feature",
    properties: { name: "Island of Ireland" },
    geometry: { type: "MultiPolygon", coordinates: polygons },
  };
}

// Great Britain and the Isle of Man: shown at the start of the opening flight, then covered
// by sea as the camera zooms in.
export async function fetchBritainOutline() {
  const polygons = (await fetchPolygons(["GBR", "IMN"], DETAIL.britain))
    .filter(({ p }) => !isNorthernIreland(p))
    .map(({ p }) => p);
  return { type: "Feature", properties: { name: "Great Britain" }, geometry: { type: "MultiPolygon", coordinates: polygons } };
}
