// Landmarks to find your way around the map: the main cities, famous historic sites, and
// a few places that matter to the railway story. Each is a small symbolic 3D model
// (built by scripts/make-landmarks.mjs) standing on its spot, with a name that hides when
// it would collide with another, and a short popup.

const LANDMARKS = [
  // Cities
  { kind: "city", model: "dublin", name: "Dublin", lon: -6.2603, lat: 53.3498, info: "Capital of Ireland, and where the island's railways began in 1834." },
  { kind: "city", model: "belfast", name: "Belfast", lon: -5.9301, lat: 54.5973, info: "Capital of Northern Ireland." },
  { kind: "city", model: "cork", name: "Cork", lon: -8.4756, lat: 51.8985, info: "Ireland's second city." },
  { kind: "city", model: "limerick", name: "Limerick", lon: -8.6267, lat: 52.6638, info: "City on the River Shannon." },
  { kind: "city", model: "galway", name: "Galway", lon: -9.0568, lat: 53.2707, info: "City on the west coast, at the mouth of the River Corrib." },
  { kind: "city", model: "derry", name: "Derry", lon: -7.3086, lat: 54.9966, info: "Walled city on the River Foyle." },
  { kind: "city", model: "waterford", name: "Waterford", lon: -7.1101, lat: 52.2593, info: "Founded by the Vikings and often called Ireland's oldest city." },
  { kind: "city", model: "kilkenny", name: "Kilkenny", lon: -7.2448, lat: 52.6541, info: "Medieval city on the River Nore." },
  { kind: "city", model: "sligo", name: "Sligo", lon: -8.4761, lat: 54.2766, info: "Largest town in the north-west of the Republic." },

  // Historic sites
  { kind: "historic", model: "newgrange", name: "Newgrange", lon: -6.4755, lat: 53.6947, info: "Passage tomb built around 3200 BC, older than Stonehenge and the pyramids of Giza. Its passage lines up with the sunrise at the winter solstice." },
  { kind: "historic", model: "tara", name: "Hill of Tara", lon: -6.6119, lat: 53.5797, info: "Ancient seat of the High Kings of Ireland." },
  { kind: "historic", model: "cashel", name: "Rock of Cashel", lon: -7.8906, lat: 52.52, info: "Seat of the kings of Munster, crowned by a medieval cathedral and round tower." },
  { kind: "historic", model: "clonmacnoise", name: "Clonmacnoise", lon: -7.9864, lat: 53.3267, info: "Monastery founded by St Ciarán in the 6th century on the banks of the Shannon; its high crosses and round towers survive." },
  { kind: "historic", model: "glendalough", name: "Glendalough", lon: -6.3277, lat: 53.0103, info: "Monastic settlement founded by St Kevin in the 6th century, in a glacial valley in the Wicklow Mountains." },
  { kind: "historic", model: "causeway", name: "Giant's Causeway", lon: -6.5116, lat: 55.2408, info: "Around 40,000 interlocking basalt columns left by an ancient volcanic eruption; a UNESCO World Heritage Site." },
  { kind: "historic", model: "cliffs", name: "Cliffs of Moher", lon: -9.4309, lat: 52.9715, info: "Sea cliffs rising more than 200 m above the Atlantic." },
  { kind: "historic", model: "lough", name: "Lough Derravaragh", lon: -7.36, lat: 53.65, info: "In the legend, the Children of Lir spent their first 300 years as swans on this lake." },

  // Railway heritage
  { kind: "railway", model: "locomotive-green", name: "Dún Laoghaire (Kingstown)", lon: -6.134, lat: 53.2945, info: "Ireland's first passenger railway, the Dublin & Kingstown, opened on 17 December 1834, running from Westland Row in Dublin to Kingstown, now Dún Laoghaire." },
  { kind: "railway", model: "monorail", name: "Listowel monorail", lon: -9.4855, lat: 52.4467, info: "The Lartigue monorail ran about 15 km from Listowel to Ballybunion from 1888 to 1924. A short stretch has been rebuilt in Listowel." },
  { kind: "railway", model: "locomotive-green", name: "Moyasta Junction", lon: -9.533, lat: 52.644, info: "Junction on the narrow-gauge West Clare Railway, which closed in 1961. A section near Moyasta has been restored." },
  { kind: "railway", model: "locomotive-red", name: "Stranorlar", lon: -7.77, lat: 54.8, info: "Headquarters of the County Donegal Railways, once the largest narrow-gauge system in Ireland or Britain. It closed at the end of 1959." },
  { kind: "railway", model: "viaduct", name: "Ballydehob viaduct", lon: -9.459, lat: 51.564, info: "Twelve-arch viaduct on the Schull and Skibbereen tramway, which closed in 1947. The viaduct still stands." },
];

// How wide each model stands on the map, in metres. Giant, so they read at country scale.
const MODEL_WIDTH_M = {
  dublin: 11000, belfast: 11000, cork: 10000, limerick: 9500, galway: 9000, derry: 9500,
  waterford: 9000, kilkenny: 9000, sligo: 9000,
  newgrange: 7000, tara: 6500, cashel: 7000, clonmacnoise: 6000, glendalough: 7000,
  causeway: 7000, cliffs: 8000, lough: 6500,
  "locomotive-green": 6500, "locomotive-red": 6500, monorail: 7000, viaduct: 8000,
};

const SIZE = 1.8; // scales every model; at 1 they're too small to make out in the overview

// Label colours, shared with the legend in index.html.
export const LANDMARK_KINDS = {
  city: { label: "City", color: "#1f2a44" },
  historic: { label: "Historic site", color: "#b7791f" },
  railway: { label: "Railway heritage", color: "#9c3d1e" },
};

// `heading` turns every model to face the camera's opening view (their fronts face +z).
export function createLandmarks({ FeatureLayer, Graphic, heading }) {
  const source = LANDMARKS.map((l, i) => new Graphic({
    geometry: { type: "point", longitude: l.lon, latitude: l.lat },
    attributes: { oid: i + 1, name: l.name, kind: l.kind, model: l.model, info: l.info },
  }));

  const modelSymbol = (model) => ({
    type: "point-3d",
    symbolLayers: [{
      type: "object",
      resource: { href: new URL(`assets/landmarks/${model}.glb`, location.href).href },
      width: MODEL_WIDTH_M[model] * SIZE,
      heading,
      anchor: "bottom",
    }],
  });

  const label = (kind, size, weight) => ({
    where: `kind = '${kind}'`,
    labelExpressionInfo: { expression: "$feature.name" },
    labelPlacement: "above-center",
    symbol: {
      type: "label-3d",
      symbolLayers: [{
        type: "text", size, material: { color: LANDMARK_KINDS[kind].color },
        font: { weight, family: "sans-serif" }, halo: { color: "white", size: 1.5 },
      }],
    },
  });

  return new FeatureLayer({
    title: "Landmarks",
    source,
    objectIdField: "oid",
    geometryType: "point",
    spatialReference: { wkid: 4326 },
    fields: [
      { name: "oid", type: "oid" },
      { name: "name", type: "string" },
      { name: "kind", type: "string" },
      { name: "model", type: "string" },
      { name: "info", type: "string" },
    ],
    outFields: ["*"],
    elevationInfo: { mode: "relative-to-ground" },
    renderer: {
      type: "unique-value",
      field: "model",
      uniqueValueInfos: Object.keys(MODEL_WIDTH_M).map((value) => ({ value, symbol: modelSymbol(value) })),
    },
    // Cities first, so they win when labels collide.
    labelingInfo: [label("city", 11, "bold"), label("historic", 9.5, "bold"), label("railway", 9, "normal")],
    popupTemplate: {
      title: "{name}",
      content: ({ graphic }) => {
        const a = graphic.attributes;
        return `<p style="margin:0 0 6px;color:${LANDMARK_KINDS[a.kind].color};font-weight:600">${LANDMARK_KINDS[a.kind].label}</p><p style="margin:0">${a.info}</p>`;
      },
    },
  });
}
