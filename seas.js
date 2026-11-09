// The seas, bays and loughs named as the 1920 Railway Clearing House map names them: open water
// in widely spaced italic capitals, larger the bigger the water, in a sea-green ink; bays and
// loughs in a small italic. The seas show from the start; the bays and loughs come in as you
// zoom in, so the home view isn't crowded. Labels, like the counties (counties.js), so they give
// way to the towns where they'd overlap.
import { nameLayer } from "./counties.js";

// "Irish Sea" -> "I R I S H   S E A": letters a thin space apart, words three.
const spaced = (name) => name.toUpperCase().split(" ").map((w) => w.split("").join(" ")).join("     ");

// [name, lon, lat], placed in open water clear of the coast.
const OCEAN = [["Atlantic Ocean", -11.15, 53.05]];
const SEAS = [
  ["Irish Sea", -5.25, 53.55], ["North Channel", -6.0, 55.5], ["St. George's Channel", -5.75, 52.05],
  ["Celtic Sea", -8.1, 51.3],
];
const BAYS = [
  ["Donegal Bay", -8.65, 54.52], ["Galway Bay", -9.35, 53.17], ["Clew Bay", -9.78, 53.83], ["Dingle Bay", -10.12, 52.07],
  ["Bantry Bay", -9.75, 51.62], ["Tralee Bay", -9.92, 52.3], ["Sligo Bay", -8.68, 54.33], ["Dublin Bay", -6.05, 53.33],
  ["Dundalk Bay", -6.25, 53.95], ["Belfast Lough", -5.73, 54.71], ["Lough Foyle", -7.05, 55.13], ["Lough Swilly", -7.55, 55.2],
  ["Shannon Estuary", -9.35, 52.6], ["Waterford Harbour", -6.95, 52.17], ["Cork Harbour", -8.27, 51.82],
];
const LOUGHS = [
  ["Lough Neagh", -6.42, 54.6], ["Lough Corrib", -9.27, 53.45], ["Lough Mask", -9.37, 53.63], ["Lough Derg", -8.3, 52.95],
  ["Lough Ree", -8.0, 53.52], ["Upper Lough Erne", -7.45, 54.22], ["Lower Lough Erne", -7.82, 54.44], ["Lough Allen", -8.05, 54.13],
  ["Lough Conn", -9.27, 54.05],
];

const INK = [46, 74, 68, 0.85];
const HALO = { color: [205, 220, 200, 0.8], size: 1 };
const italic = { family: "Libre Caslon Text", style: "italic", weight: "normal" };
const text = (size, color = INK, halo = HALO) => ({ type: "text", size, material: { color }, font: italic, halo });

export function createSeaNames({ FeatureLayer, Graphic }) {
  return [
    nameLayer({ FeatureLayer, Graphic }, "Ocean", OCEAN.map(([n, x, y]) => [spaced(n), x, y]), text(13)),
    nameLayer({ FeatureLayer, Graphic }, "Seas", SEAS.map(([n, x, y]) => [spaced(n), x, y]), text(10.5)),
    nameLayer({ FeatureLayer, Graphic }, "Bays", BAYS, text(8), { minScale: 900000 }),
    // On the land, the loughs get a paper-coloured halo like the other land names.
    nameLayer({ FeatureLayer, Graphic }, "Loughs", LOUGHS, text(8, INK, { color: [245, 241, 227, 0.85], size: 1 }),
      { minScale: 900000 }),
  ];
}
