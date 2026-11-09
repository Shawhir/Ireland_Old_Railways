// County names across the island, lettered as the 1920 Railway Clearing House map letters
// them: widely spaced roman capitals in a pale ink, sitting under everything else. Placed by
// hand near each county's middle (lon, lat), nudged off the busiest junctions, and well clear of
// the county town of the same name, so the two never read as one name printed twice; and placed
// clear of the town names and station circles (worked out against both at the home view and zoomed
// in, moving each name at most 14 km, so it stays in its county).
const COUNTIES = [
  ["Antrim", -6.15, 54.85], ["Armagh", -6.52, 54.12], ["Down", -5.77, 54.3], ["Fermanagh", -7.62, 54.23],
  ["Derry", -6.88, 54.9], ["Tyrone", -7.37, 54.55], ["Donegal", -8, 54.92],
  ["Monaghan", -6.82, 54.05], ["Cavan", -7.62, 54.08], ["Louth", -6.53, 53.92], ["Leitrim", -8.05, 54.12],
  ["Sligo", -8.82, 54.1], ["Mayo", -9.4, 54.05], ["Roscommon", -8.3, 53.86], ["Longford", -7.62, 53.62],
  ["Westmeath", -7.38, 53.41], ["Meath", -6.47, 53.63], ["Dublin", -6.34, 53.57], ["Galway", -8.5, 53.42],
  ["Offaly", -7.62, 53.2], ["Kildare", -6.72, 53.3], ["Wicklow", -6.4, 52.97], ["Laois", -7.38, 52.97],
  ["Clare", -9.2, 52.79], ["Tipperary", -7.98, 52.62], ["Kilkenny", -7.32, 52.44],
  ["Carlow", -6.85, 52.64], ["Wexford", -6.65, 52.56], ["Limerick", -8.98, 52.42],
  ["Waterford", -7.6, 52.2], ["Kerry", -9.62, 51.97], ["Cork", -8.88, 52.1]
];

// Counties named after a town that's lettered at the home view: from afar the two names sit a
// finger's width apart and read as one name printed twice, so these county names come in only
// once you zoom in, where they're well apart.
const TOWN_NAMED = new Set(["Antrim", "Armagh", "Derry", "Donegal", "Monaghan", "Cavan", "Sligo", "Longford",
  "Dublin", "Galway", "Kildare", "Wicklow", "Tipperary", "Kilkenny", "Carlow", "Wexford", "Limerick", "Waterford", "Cork"]);
// The view's scale (at its middle): the home view is about 2.5 million.
const TOWN_NAMED_SCALE = 900000;

// "Donegal" -> "D O N E G A L": the old map spaces county names out across the county.
const spaced = (name) => name.toUpperCase().split("").join("  "); // two thin spaces

// A layer of names alone: no symbol at each point, only its label. As labels (not text graphics)
// they're deconflicted with the town names: where two would overlap, the map shows one.
export function nameLayer({ FeatureLayer, Graphic }, title, items, text, { classes = [{}], minScale = 0, ...extra } = {}) {
  // minScale hides the whole layer when zoomed out: then its names take no room from the others
  // (names hidden by a label class's own minScale seemed to still keep others off).
  return new FeatureLayer({
    title, minScale, listMode: "hide", objectIdField: "OBJECTID", geometryType: "point",
    spatialReference: { wkid: 4326 },
    fields: [{ name: "OBJECTID", type: "oid" }, { name: "label", type: "string" }, { name: "later", type: "integer" }],
    source: items.map(([label, longitude, latitude, later = 0], i) => new Graphic({
      geometry: { type: "point", longitude, latitude }, attributes: { OBJECTID: i + 1, label, later },
    })),
    elevationInfo: { mode: "on-the-ground" },
    renderer: { type: "simple", symbol: { type: "simple-marker", size: 0.5, color: [0, 0, 0, 0], outline: null } },
    // One label class, or one per `classes` entry ({ where, minScale }), all set alike.
    labelingInfo: classes.map((only) => ({
      labelExpressionInfo: { expression: "$feature.label" }, labelPlacement: "center-center",
      symbol: { type: "label-3d", symbolLayers: [text] },
      ...extra, ...only,
    })),
    labelsVisible: true,
  });
}

// Behind everything, as on the old sheet: spaced out across the county, they're far too wide to
// keep clear of every town, so they're plain text, which never knocks a label off the map (as
// labels, they took the principal towns' names off). The towns' paper halos keep those legible over
// these. Two layers: the counties named after a town come in only once zoomed in.
export function createCountyNames({ GraphicsLayer, Graphic }) {
  const layer = (names, minScale = 0) => new GraphicsLayer({
    title: "Counties", listMode: "hide", minScale,
    elevationInfo: { mode: "on-the-ground" },
    graphics: names.map(([name, longitude, latitude]) => new Graphic({
      geometry: { type: "point", longitude, latitude },
      symbol: {
        type: "point-3d",
        symbolLayers: [{
          type: "text", text: spaced(name), size: 9,
          material: { color: [92, 84, 72, 0.5] },
          font: { family: "Libre Caslon Text", weight: "normal" },
          halo: { color: [245, 241, 227, 0.7], size: 1 },
        }],
      },
    })),
  });
  return [
    layer(COUNTIES.filter(([n]) => !TOWN_NAMED.has(n))),
    layer(COUNTIES.filter(([n]) => TOWN_NAMED.has(n)), TOWN_NAMED_SCALE),
  ];
}

// Britain's counties for the opening, as maps of the time named them (Carnarvon, Salop, Forfar),
// in the same pale spaced capitals: the larger ones only, as all of Britain is on screen at once.
// Placed by hand near each county's middle (lon, lat). Shown until Britain fades out.
const SHIRES = [
  ["Sutherland", -4.4, 58.15], ["Caithness", -3.45, 58.42], ["Ross", -5.0, 57.65], ["Inverness", -4.75, 57.1],
  ["Aberdeen", -2.65, 57.2], ["Argyll", -5.35, 56.3], ["Perth", -3.95, 56.6], ["Forfar", -2.9, 56.72], ["Fife", -3.1, 56.25],
  ["Lanark", -3.8, 55.6], ["Ayr", -4.5, 55.35], ["Dumfries", -3.55, 55.2], ["Kirkcudbright", -4.1, 54.98], ["Roxburgh", -2.7, 55.45],
  ["Northumberland", -2.0, 55.2], ["Cumberland", -3.05, 54.65], ["Westmorland", -2.6, 54.45], ["Durham", -1.75, 54.7],
  ["Yorkshire", -1.35, 54.0], ["Lancashire", -2.6, 53.8], ["Cheshire", -2.5, 53.2], ["Derby", -1.6, 53.1], ["Lincoln", -0.3, 53.1],
  ["Norfolk", 0.9, 52.65], ["Suffolk", 1.0, 52.2], ["Salop", -2.75, 52.6], ["Stafford", -2.0, 52.8], ["Leicester", -1.1, 52.65],
  ["Northampton", -0.9, 52.3], ["Warwick", -1.55, 52.35], ["Hereford", -2.75, 52.1], ["Gloucester", -2.2, 51.85],
  ["Oxford", -1.3, 51.8], ["Essex", 0.6, 51.8], ["Kent", 0.8, 51.2], ["Sussex", -0.3, 50.95], ["Wilts", -1.9, 51.3],
  ["Hants", -1.3, 51.1], ["Dorset", -2.3, 50.8], ["Somerset", -3.0, 51.1], ["Devon", -3.8, 50.75], ["Cornwall", -4.8, 50.4],
  ["Anglesey", -4.35, 53.28], ["Carnarvon", -4.0, 53.0], ["Merioneth", -3.8, 52.85], ["Montgomery", -3.4, 52.55],
  ["Cardigan", -4.0, 52.25], ["Pembroke", -4.9, 51.85], ["Carmarthen", -4.2, 51.9], ["Brecknock", -3.45, 51.95], ["Glamorgan", -3.5, 51.6],
];

export function createShireNames({ GraphicsLayer, Graphic }) {
  return new GraphicsLayer({
    title: "Shires", listMode: "hide",
    elevationInfo: { mode: "on-the-ground" },
    graphics: SHIRES.map(([name, longitude, latitude]) => new Graphic({
      geometry: { type: "point", longitude, latitude },
      symbol: {
        type: "point-3d",
        symbolLayers: [{
          type: "text", text: spaced(name), size: 9,
          material: { color: [92, 84, 72, 0.5] },
          font: { family: "Libre Caslon Text", weight: "normal" },
          halo: { color: [245, 241, 227, 0.7], size: 1 },
        }],
      },
    })),
  });
}
