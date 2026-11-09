// The main loughs and rivers (data/water.geojson, from scripts/fetch-water.mjs), drawn as the
// 1920 railway map draws them: loughs in the inshore sea's green with a fine ink edge, rivers
// as fine dark lines. Added once the opening lands: outlines on draped fills are redrawn for
// every tile while the camera zooms, which hitched the flight.

const LOUGH = { color: "#b4ccb0", edge: "#2f2f28" };
const RIVER = "#56605a";

// Esri wants outer rings clockwise (GeoJSON is the other way round); islands in the loughs are
// left out (they're far below what the map shows).
const clockwise = (ring) => {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
  return a > 0 ? ring : [...ring].reverse();
};

export async function createWater({ GraphicsLayer, Graphic }) {
  const res = await fetch("data/water.geojson");
  if (!res.ok) throw new Error(`water.geojson: HTTP ${res.status}`);
  const { features } = await res.json();
  const graphics = [];
  for (const { properties, geometry: g } of features) {
    if (properties.kind === "lake") {
      const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      graphics.push(new Graphic({
        geometry: { type: "polygon", rings: polys.map(([outer]) => clockwise(outer)) },
        symbol: { type: "simple-fill", color: LOUGH.color, outline: { color: LOUGH.edge, width: 0.8 } },
        attributes: { name: properties.name },
      }));
    } else {
      const paths = g.type === "LineString" ? [g.coordinates] : g.coordinates;
      graphics.push(new Graphic({
        geometry: { type: "polyline", paths },
        symbol: { type: "simple-line", color: RIVER, width: 0.9, cap: "round", join: "round" },
        attributes: { name: properties.name },
      }));
    }
  }
  // Rivers under the loughs they run through, so the loughs' edges stay clean.
  graphics.sort((a, b) => (a.geometry.type === "polyline" ? -1 : 0) - (b.geometry.type === "polyline" ? -1 : 0));
  return new GraphicsLayer({ title: "Loughs and rivers", listMode: "hide", graphics });
}
