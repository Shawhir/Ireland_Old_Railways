// Towns that lost their railway, drawn as square towers under a hipped roof (town-model.js), rising out of the ground when the
// town's line closes and sink back if you go back in time. Each town is its own graphic,
// so one column can be animated every frame without redrawing the rest (swapping a whole
// layer's renderer in 3D redraws everything and stutters).
import { PAPER_MS } from "./paper.js";
import { createTownModels } from "./town-model.js";

const GROW_MS = 700; // one column rising from nothing to full height
const STAGGER_MS = 1200; // on a jump across many years, closures play out over this long, in order
const FRAME_MS = PAPER_MS; // a new drawing on the paper beat (paper.js), held in between
const WIDTH = 1800; // metres
const LABEL_GAP = 900; // metres between the top of a column and its name
const LABEL_COLOR = "#1f4434"; // dark green, to match the buildings
const SHOW_NAMES = false; // names on the columns: off, as the place names already give them

// Full height: 1.5 km at 500 people, 7 km at 5,000, 30 km at 35,000 and over.
export function fullHeight(pop) {
  if (pop <= 500) return 1500;
  if (pop <= 5000) return 1500 + ((pop - 500) / 4500) * 5500;
  if (pop <= 35000) return 7000 + ((pop - 5000) / 30000) * 23000;
  return 30000;
}

const easeOutCubic = (k) => 1 - (1 - k) ** 3; // rises quickly, then settles gently
const easeInCubic = (k) => k * k * k;

import { createTicketPopup } from "./ticketpop.js";

export function createTownColumns({ GraphicsLayer, Graphic, view, towns, color, roofColor, popupContent }) {
  const layer = new GraphicsLayer({
    title: "Towns that lost rail",
    elevationInfo: { mode: "relative-to-ground" },
  });
  // A town's details as a ticket (ticketpop.js), like the lines', not ArcGIS's popup.
  const popupTemplate = null;
  const ticketPop = createTicketPopup(view);
  view.on("click", async (event) => {
    if (!layer.visible) return;
    const hit = await view.hitTest(event, { include: [layer] });
    const g = hit.results.map((r) => r.graphic).find((gr) => gr.attributes?.name && gr.symbol?.symbolLayers?.getItemAt?.(0)?.type === "object");
    if (g) ticketPop.show(popupContent({ graphic: g }), event.mapPoint);
  });

  const items = towns.features.map((f) => {
    const p = f.properties;
    const [longitude, latitude] = f.geometry.coordinates;
    const column = new Graphic({
      geometry: { type: "point", longitude, latitude, z: 0 },
      attributes: p,
      popupTemplate,
      visible: false,
    });
    // No name on the column: the town is already named by the place names (places.js), and a
    // second name in another style beside it read as the same name printed twice.
    const label = SHOW_NAMES && p.pop >= 3000 ? new Graphic({
      geometry: { type: "point", longitude, latitude, z: 0 },
      attributes: p,
      visible: false,
      symbol: {
        type: "point-3d",
        symbolLayers: [{
          type: "text", text: p.name, size: p.pop >= 10000 ? 9 : 8, verticalAlignment: "bottom",
          material: { color: LABEL_COLOR }, font: { weight: "bold" }, halo: { color: "white", size: 1.5 },
        }],
      },
    }) : null;
    return {
      p, column, label,
      height: fullHeight(p.pop),
      labelMaxScale: p.pop >= 10000 ? 5000000 : 1500000,
      value: 0, // 0 = flat and hidden, 1 = full height
      drawn: NaN, // base height last drawn

      anim: null,
      lon: longitude, lat: latitude,
    };
  });
  layer.addMany(items.flatMap((i) => (i.label ? [i.column, i.label] : [i.column])));

  // Every building is the same model (town-model.js), one very tall tower as tall as the
  // tallest town, under one shared symbol, so ArcGIS draws them all as instances of one mesh.
  // A building "grows" by rising out of the ground: its roof sits at the town's height times
  // how far it has grown, and the rest of the tower reaches down below the map, where the
  // ground hides it. Moving a point is cheap in 3D; swapping a symbol rebuilds the object,
  // which stutters when hundreds of towns change at once.
  // The model comes in VARIANTS, its paper grain shifted in each, handed out at random (but
  // the same every time, from the town's name) so neighbouring buildings don't match.
  const VARIANTS = 8;
  const models = createTownModels({ width: WIDTH, color, roofColor });
  let towerHeight = 0; // the shared model's height, base to roof
  const pick = (name) => [...String(name)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % VARIANTS;
  Promise.all(Array.from({ length: VARIANTS }, (_, v) => models.modelFor(fullHeight(Infinity) + WIDTH, v))).then((ms) => {
    towerHeight = ms[0].height;
    const symbols = ms.map(({ url, height }) => new Graphic({
      symbol: { type: "point-3d", symbolLayers: [{ type: "object", resource: { href: url }, anchor: "bottom", height }] },
    }).symbol);
    for (const i of items) { i.column.symbol = symbols[pick(i.p.name)]; i.drawn = NaN; draw(i); }
  });

  const MOVE_M = 40; // smaller moves than this aren't visible, so skip them
  const showLabel = (i) => i.label && i.value > 0.6 && view.scale < i.labelMaxScale;
  const draw = (i) => {
    if (!towerHeight) return; // the model isn't made yet; drawn when it is
    const top = i.height * i.value;
    const z = top - towerHeight; // base of the tower, always well below the ground
    const visible = i.value > 0.002;
    if (visible === i.column.visible && Math.abs(z - i.drawn) < MOVE_M && i.value !== 0 && i.value !== 1) return;
    i.drawn = z;
    i.column.visible = visible;
    // A copy of its own point with a new height: cheaper than building a point afresh.
    if (visible) { const pt = i.column.geometry.clone(); pt.z = z; i.column.geometry = pt; }
    if (i.label) {
      i.label.visible = showLabel(i);
      if (i.label.visible) {
        const pt = i.label.geometry.clone(); pt.z = top + LABEL_GAP; i.label.geometry = pt;
      }
    }
  };

  const animating = new Set();
  let year = null;
  let filter = () => true;

  // Bring every town to where it should be in `nextYear`. With animate, columns that change
  // ease into place, in closure order when the jump spans several years.
  const setState = ({ year: nextYear, filter: nextFilter = filter, animate = true }) => {
    const from = year ?? nextYear;
    const span = nextYear - from;
    const now = performance.now();
    filter = nextFilter;
    year = nextYear;
    for (const i of items) {
      const target = i.p.closed_year <= nextYear && filter(i.p) ? 1 : 0;
      const heading = i.anim ? i.anim.to : i.value;
      if (target === heading) continue;
      if (!animate) {
        i.value = target;
        i.anim = null;
        animating.delete(i);
        draw(i);
        continue;
      }
      const order = Math.abs(span) > 2 ? Math.min(1, Math.max(0, (i.p.closed_year - from) / span)) : 0;
      i.anim = {
        from: i.value,
        to: target,
        start: now + order * STAGGER_MS,
        dur: GROW_MS * Math.max(0.35, Math.abs(target - i.value)),
      };
      animating.add(i);
    }
  };

  // One step per paper beat, all at the beat's time; a step that would take more than BUDGET_MS
  // (hundreds of columns moving at once) is finished over the next frame or two.
  const BUDGET_MS = 6;
  let lastFrame = 0, queue = [];
  const step = (i, now) => {
    const a = i.anim;
    if (!a) return;
    const k = (now - a.start) / a.dur;
    if (k < 0) return;
    const t = Math.min(1, k);
    const e = a.to > a.from ? easeOutCubic(t) : easeInCubic(t);
    i.value = a.from + (a.to - a.from) * e;
    if (t === 1) {
      i.value = a.to;
      i.anim = null;
      animating.delete(i);
    }
    draw(i);
  };
  const tick = (now) => {
    if (!animating.size && !queue.length) return;
    if (!queue.length && now - lastFrame >= FRAME_MS) { lastFrame = now; queue = [...animating]; }
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < BUDGET_MS) step(queue.pop(), lastFrame);
  };

  // Names come and go with the zoom level, like normal map labels.
  view.watch("scale", () => {
    for (const i of items) {
      if (!i.label || i.anim) continue;
      const visible = showLabel(i);
      if (visible !== i.label.visible) {
        i.label.visible = visible;
        if (visible) {
          i.label.geometry = { type: "point", longitude: i.lon, latitude: i.lat, z: i.height * i.value + LABEL_GAP };
        }
      }
    }
  });

  const byName = new Map(items.map((i) => [i.p.name, i.column]));
  // Still moving: any building still rising or sinking.
  const busy = () => animating.size > 0 || queue.length > 0;
  return { layer, setState, tick, busy, findTown: (name) => byName.get(name) };
}
