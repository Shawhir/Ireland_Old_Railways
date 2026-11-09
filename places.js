// Place names and stations, set as the 1920 Railway Clearing House map sets them: towns on the
// railway in bold grotesque capitals, sized by importance, each with a small station circle on
// its line; places off the railway in a small italic. Names come in by rank as you zoom in: the
// cities and principal towns at the home view, then the other large towns, towns, rail villages
// and the rest; where names collide, the scene keeps the more important one. A panel toggle
// (showSmaller) leaves only the cities and principal towns.
//
// From data/towns.json (places with their population and distance from the railway, then and
// now). A town within STATION_KM of a line is taken as its station: the circle is put on the
// nearest point of that line, and shown only in years when the line is open.

const STATION_KM = 1.2;
const KM_PER_DEG = [66.2, 110.6]; // near Ireland: longitude, latitude
// The suburbs of Dublin and Belfast were separate villages in 1920, or fields: within this of
// either centre, a place is named only close up, however many live there now.
const METRO = [[-6.26, 53.35, 13], [-5.93, 54.6, 11]];

const INK = [31, 29, 26, 1];
const HALO = { color: [245, 241, 227, 0.9], size: 1.2 };
const caps = { type: "arcade", expression: "Upper($feature.label)" };
const caps9 = (size, minScale, weight = "bold") => ({
  symbol: { type: "label-3d", symbolLayers: [{ type: "text", material: { color: INK }, size, halo: HALO,
    font: { family: "Archivo", weight } }] },
  labelExpressionInfo: caps, minScale, labelPlacement: "above-center",
});

// The towns the 1920 sheet letters largest: the ports and cities, then the county towns and
// junctions that mattered to the railway. Ranked by hand rather than by today's population, which
// would promote commuter towns (Celbridge) and new towns (Craigavon, built in the 1960s).
const CITIES = new Set(["Dublin", "Belfast", "Cork", "Limerick", "Galway", "Derry", "Waterford"]);
const PRINCIPAL = new Set(["Sligo", "Athlone", "Kilkenny", "Wexford", "Dundalk", "Drogheda", "Newry", "Armagh",
  "Enniskillen", "Mullingar", "Tralee", "Ennis", "Clonmel", "Portadown", "Ballymena", "Coleraine", "Omagh",
  "Westport", "Letterkenny", "Mallow", "Killarney"]);

// The names as the 1920 sheet has them, in English. The data gives some Gaeltacht places in Irish
// only, or as "English / Irish": the English half is taken (and Derry, the name in everyday use),
// and the better known Irish-only names are given the English name the 1920 map used.
const ENGLISH = {
  "An Clochán Liath": "Dungloe", "Béal an Mhuirthead": "Belmullet", "An Fál Carrach": "Falcarragh",
  "Gort a' Choirce": "Gortahork", "Baile Chláir": "Claregalway", "Na Forbacha": "Furbo", "Doirí Beaga": "Derrybeg",
  "Baile Mhic Íre": "Ballymakeera", "Béal Átha an Ghaorthaidh": "Ballingeary", "Ailt an Chorráin": "Burtonport",
  "An Charraig": "Carrick", "Na Gleannta": "Glenties", "Bréanainn": "Brandon", "Eanach Dhúin": "Annaghdown",
  "Indreabhán": "Inverin", "An Fhairche": "Clonbur", "Dún Chaoin": "Dunquin", "An tInbhear": "Inver",
  "Baile na Finne": "Fintown", "An Machaire": "Maghery", "An Dúchoraidh": "Doochary", "An Eachléim": "Aghleam",
  "Leitir Mhic an Bhaird": "Lettermacaward", "Cill Chiaráin": "Kilkieran", "Ros an Mhíl": "Rossaveel",
  "Casla": "Costelloe", "Baile na nGall": "Ballydavid", "An Spidéal": "Spiddal", "An Cheathrú Rua": "Carraroe",
  "Gaoth Dobhair": "Gweedore", "Cill Rónáin": "Kilronan", "Baile an Fheirtéaraigh": "Ballyferriter",
  "Ceann Trá": "Ventry", "An Daingean": "Dingle", "Baile Bhuirne": "Ballyvourney", "Cúil Aodha": "Coolea",
  "An Rinn": "Ring", "Corr na Móna": "Cornamona", "Tuar Mhic Éadaigh": "Tourmakeady",
};
export const englishName = (name) => {
  if (name === "Derry/Londonderry") return "Derry";
  if (name.includes("/")) return name.split("/")[0].trim();
  return ENGLISH[name] || name;
};

// Rank: 1 cities, 2 principal towns (these two at the home view), 3 other large towns,
// 4 towns, 5 rail villages, 6 everything else.
function rankOf(t, label, station) {
  if (CITIES.has(label)) return 1;
  if (PRINCIPAL.has(label)) return 2;
  const pop = t.pop || 0;
  const metro = METRO.some(([lon, lat, km]) => Math.hypot((t.lon - lon) * KM_PER_DEG[0], (t.lat - lat) * KM_PER_DEG[1]) < km);
  if (metro) return station ? 5 : 6;
  if (pop >= 8000 || t.place === "city") return 3;
  if (pop >= 2500 || (t.place === "town" && station)) return 4;
  return station ? 5 : 6;
}

// The nearest point on any line to (lon, lat), in km, with that line's years.
function nearestOnRail(lon, lat, features) {
  let best = null;
  for (const f of features) {
    const c = f.geometry.coordinates;
    for (let i = 1; i < c.length; i++) {
      const ax = (c[i - 1][0] - lon) * KM_PER_DEG[0], ay = (c[i - 1][1] - lat) * KM_PER_DEG[1];
      const bx = (c[i][0] - lon) * KM_PER_DEG[0], by = (c[i][1] - lat) * KM_PER_DEG[1];
      const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
      const k = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      const px = ax + dx * k, py = ay + dy * k, d = Math.hypot(px, py);
      if (!best || d < best.d) best = { d, lon: lon + px / KM_PER_DEG[0], lat: lat + py / KM_PER_DEG[1], p: f.properties };
    }
  }
  return best;
}

export async function createPlaces({ FeatureLayer, Graphic, rail }) {
  const res = await fetch("data/towns.json");
  if (!res.ok) throw new Error(`towns.json: HTTP ${res.status}`);
  const towns = await res.json();
  const names = [], stations = [];
  towns.forEach((t, i) => {
    const near = Math.min(t.cur_km ?? 99, t.old_km ?? 99) <= STATION_KM ? nearestOnRail(t.lon, t.lat, rail.features) : null;
    const station = !!near && near.d <= STATION_KM;
    const label = englishName(t.name);
    const rank = rankOf(t, label, station);
    names.push(new Graphic({
      geometry: { type: "point", longitude: t.lon, latitude: t.lat },
      attributes: { OBJECTID: i + 1, label, rank, station: station ? 1 : 0 },
    }));
    if (station) {
      // Open from the line's opening (or early, if not recorded) until its closure; a line
      // closed on an unknown date gets no circles after it opened, as we can't say when.
      const p = near.p;
      stations.push(new Graphic({
        geometry: { type: "point", longitude: near.lon, latitude: near.lat },
        attributes: {
          OBJECTID: i + 1, rank,
          opened: p.opened_year || 1840,
          closed: p.status === "current" ? 9999 : p.closed_year || 0,
        },
      }));
    }
  });

  const fields = (extra) => [{ name: "OBJECTID", type: "oid" }, { name: "rank", type: "integer" }, ...extra];
  const nameLayer = new FeatureLayer({
    title: "Place names", listMode: "hide", source: names, objectIdField: "OBJECTID", geometryType: "point",
    spatialReference: { wkid: 4326 },
    fields: fields([{ name: "label", type: "string" }, { name: "station", type: "integer" }]),
    elevationInfo: { mode: "on-the-ground" },
    // The names only: the point itself is drawn by the stations layer, or not at all.
    renderer: { type: "simple", symbol: { type: "simple-marker", size: 0.5, color: [0, 0, 0, 0], outline: null } },
    // Label scales are taken at each label, and the tilted view's near half is at a smaller
    // scale than its middle (the home view is about 2.5 million), so the tiers sit well under it.
    labelingInfo: [
      { ...caps9(11, 0, "bold"), where: "rank = 1" },
      { ...caps9(8.5, 0, "bold"), where: "rank = 2" },
      { ...caps9(8, 900000, "bold"), where: "rank = 3" },
      { ...caps9(7.5, 500000, "bold"), where: "rank = 4" },
      { ...caps9(7, 250000, "bold"), where: "rank = 5" },
      {
        where: "rank = 6", minScale: 150000, labelPlacement: "above-center",
        labelExpressionInfo: { expression: "$feature.label" },
        symbol: { type: "label-3d", symbolLayers: [{ type: "text", material: { color: [60, 55, 48, 1] }, size: 8, halo: HALO,
          font: { family: "Libre Caslon Text", style: "italic", weight: "normal" } }] },
      },
    ],
    labelsVisible: true,
  });
  // Station circles: small, paper-filled, ringed in ink. The lesser stations' circles come in
  // with their names, so the island isn't peppered with them from afar.
  const circle = (size) => ({ type: "simple-marker", style: "circle", size, color: [245, 241, 227, 1], outline: { color: INK, width: 1 } });
  const stationLayer = (graphics, minScale) => new FeatureLayer({
    title: "Stations", listMode: "hide", source: graphics, objectIdField: "OBJECTID", geometryType: "point",
    spatialReference: { wkid: 4326 }, minScale,
    fields: fields([{ name: "opened", type: "integer" }, { name: "closed", type: "integer" }]),
    elevationInfo: { mode: "on-the-ground" },
    renderer: {
      type: "unique-value", field: "rank",
      uniqueValueInfos: [{ value: 1, symbol: circle(6) }, { value: 2, symbol: circle(5) }, { value: 3, symbol: circle(4.5) }],
      defaultSymbol: circle(3.6),
    },
    definitionExpression: "1 = 0",
  });
  const major = stationLayer(stations.filter((g) => g.attributes.rank <= 2), 0);
  const minor = stationLayer(stations.filter((g) => g.attributes.rank > 2), 900000);

  return {
    layers: [major, minor, nameLayer],
    setYear(year) {
      for (const layer of [major, minor]) layer.definitionExpression = `opened <= ${year} AND closed > ${year}`;
    },
    // Smaller towns and villages off: only the cities and principal towns are named, at any zoom.
    showSmaller(on) {
      nameLayer.definitionExpression = on ? null : "rank <= 2";
    },
  };
}
