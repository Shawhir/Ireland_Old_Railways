// 2050: the network the All-Island Strategic Rail Review (Arup, for the Department of Transport and
// the Department for Infrastructure, 2024) proposes, for the story's last
// chapter. A dark layer slides over the old map (which still shows faintly through it, a ghost
// of 1920), and the proposed railway is drawn on it in light: new electric lines, electrified
// upgrades, new lines, and improvements to the rest, each as glowing lines with light running
// along them, the stations as rings. Under them, faint and dashed in old amber, the railway as it
// was in 1920.
//
// Traced from the review's own map (as printed in New Civil Engineer, 2024), town to town. Where
// the old railway ran between two of its towns, the line is laid along the 1920 track (shortest
// path through the 1920 network, see routeAlong1920), so it covers the old line instead of running
// beside it as if it were another route; where no track ran (Dublin Airport, say) it's straight.
// The exact alignments aren't decided yet.

// Stations, [longitude, latitude].
const S = {
  Derry: [-7.32, 55.0], Letterkenny: [-7.73, 54.95], Strabane: [-7.46, 54.83], Omagh: [-7.3, 54.6],
  Dungannon: [-6.77, 54.51], Portadown: [-6.44, 54.42], Lisburn: [-6.04, 54.51], Belfast: [-5.93, 54.6],
  "Belfast Airport": [-6.22, 54.66], Antrim: [-6.21, 54.72], Ballymena: [-6.28, 54.86], Coleraine: [-6.67, 55.13],
  Portrush: [-6.65, 55.2], Limavady: [-6.95, 55.05], Larne: [-5.82, 54.86], Bangor: [-5.67, 54.66],
  Newry: [-6.34, 54.18], Dundalk: [-6.4, 54.0], Drogheda: [-6.35, 53.72], Malahide: [-6.15, 53.45],
  "Dublin Airport": [-6.27, 53.43], Dublin: [-6.25, 53.35], Navan: [-6.68, 53.65], Dunboyne: [-6.47, 53.42],
  Maynooth: [-6.59, 53.38], Hazelhatch: [-6.52, 53.32], Kildare: [-6.91, 53.16], Portarlington: [-7.19, 53.16],
  Tullamore: [-7.49, 53.27], Athlone: [-7.94, 53.42], Ballinasloe: [-8.22, 53.33], Athenry: [-8.74, 53.3],
  Galway: [-9.05, 53.27], Tuam: [-8.85, 53.51], Claremorris: [-8.95, 53.72], Manulla: [-9.19, 53.83],
  Westport: [-9.52, 53.8], Ballina: [-9.15, 54.11], Roscommon: [-8.19, 53.63], Mullingar: [-7.34, 53.53],
  Longford: [-7.8, 53.73], "Carrick-on-Shannon": [-8.09, 53.95], Sligo: [-8.47, 54.27], Cavan: [-7.36, 53.99],
  Clones: [-7.23, 54.18], Monaghan: [-6.97, 54.25], Armagh: [-6.65, 54.35], Portlaoise: [-7.3, 53.03],
  Ballybrophy: [-7.6, 52.9], Thurles: [-7.8, 52.68], "Limerick Junction": [-8.2, 52.5], Mallow: [-8.65, 52.14],
  Cork: [-8.47, 51.9], Cobh: [-8.3, 51.85], Midleton: [-8.17, 51.92], Killarney: [-9.5, 52.06],
  Tralee: [-9.7, 52.27], Limerick: [-8.63, 52.66], Ennis: [-8.98, 52.84], "Shannon Airport": [-8.92, 52.7],
  Foynes: [-9.11, 52.61], Nenagh: [-8.2, 52.86], Clonmel: [-7.7, 52.35], Waterford: [-7.11, 52.26],
  Kilkenny: [-7.25, 52.65], Carlow: [-6.93, 52.84], Wexford: [-6.46, 52.34], Rosslare: [-6.34, 52.25],
  Gorey: [-6.29, 52.67], Arklow: [-6.14, 52.8], Wicklow: [-6.04, 52.98], Greystones: [-6.06, 53.14], Bray: [-6.1, 53.2],
};

// The review's four kinds of line, in the future look's colours (styles.css, body.future).
export const KINDS = {
  newElectric: { color: "#ff4fb0", width: 3.4, label: "New electric railway" },
  electric: { color: "#3ce8ff", width: 2.8, label: "Electrified and upgraded" },
  newLine: { color: "#a6ff5c", width: 2.8, label: "New or reopened railway" },
  improved: { color: "#6f8dff", width: 1.8, label: "Improved" },
};

const LINES = [
  // New electric railways.
  ["newElectric", ["Derry", "Strabane", "Omagh", "Dungannon", "Portadown"]],
  ["newElectric", ["Letterkenny", "Strabane"]],
  ["newElectric", ["Navan", "Dunboyne", "Dublin"]],
  ["newElectric", ["Malahide", "Dublin Airport", "Dublin"]],
  ["newElectric", ["Antrim", "Belfast Airport", "Belfast"]],
  // Electrified, and double or four track.
  ["electric", ["Belfast", "Lisburn", "Portadown", "Newry", "Dundalk", "Drogheda", "Malahide", "Dublin"]],
  ["electric", ["Dublin", "Hazelhatch", "Kildare", "Portarlington", "Tullamore", "Athlone", "Ballinasloe", "Athenry", "Galway"]],
  ["electric", ["Portarlington", "Portlaoise", "Ballybrophy", "Thurles", "Limerick Junction", "Mallow", "Cork"]],
  ["electric", ["Limerick Junction", "Limerick"]],
  ["electric", ["Kildare", "Carlow", "Kilkenny", "Waterford"]],
  ["electric", ["Dublin", "Maynooth", "Mullingar"]],
  // New or reopened, not electric at first.
  ["newLine", ["Portadown", "Armagh", "Monaghan", "Clones", "Cavan", "Mullingar"]],
  ["newLine", ["Claremorris", "Tuam", "Athenry"]],
  ["newLine", ["Waterford", "Wexford"]],
  ["newLine", ["Limerick", "Foynes"]],
  ["newLine", ["Limerick", "Shannon Airport"]],
  // The rest, improved.
  ["improved", ["Derry", "Limavady", "Coleraine", "Ballymena", "Antrim", "Belfast"]],
  ["improved", ["Coleraine", "Portrush"]],
  ["improved", ["Larne", "Belfast", "Bangor"]],
  ["improved", ["Westport", "Manulla", "Claremorris", "Roscommon", "Athlone"]],
  ["improved", ["Manulla", "Ballina"]],
  ["improved", ["Sligo", "Carrick-on-Shannon", "Longford", "Mullingar"]],
  ["improved", ["Athenry", "Ennis", "Limerick"]],
  ["improved", ["Limerick", "Nenagh", "Ballybrophy"]],
  ["improved", ["Tralee", "Killarney", "Mallow"]],
  ["improved", ["Limerick Junction", "Clonmel", "Waterford"]],
  ["improved", ["Dublin", "Bray", "Greystones", "Wicklow", "Arklow", "Gorey", "Wexford", "Rosslare"]],
  ["improved", ["Cork", "Cobh"]],
  ["improved", ["Cork", "Midleton"]],
];

// Named on the map: the cities and the places the new lines reach.
const NAMED = new Set(["Derry", "Letterkenny", "Omagh", "Belfast", "Armagh", "Monaghan", "Cavan", "Navan", "Dublin", "Sligo",
  "Westport", "Ballina", "Tuam", "Galway", "Athlone", "Mullingar", "Limerick", "Shannon Airport", "Tralee", "Cork", "Waterford",
  "Wexford", "Kilkenny", "Portadown", "Coleraine"]);
const NEW_STATIONS = new Set(LINES.filter(([k]) => k === "newElectric" || k === "newLine").flatMap(([, p]) => p));

const REVEAL_MS = 2600; // the lines draw themselves in
const SNAP_KM = 5; // a station joins the 1920 track if it's this close to it
const DETOUR = 1.6; // follow the old track between two stations unless it's this much longer than straight (+ 4 km)
const ANGLE_KM = 2; // the routed track is straightened into a few angled runs: corners further off than this stay
const KM_DEG = [66.2, 110.6]; // km per degree near Ireland: longitude, latitude

// Douglas-Peucker in km: keeps the corners that stand more than `tol` km off the straight run.
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a][0] * KM_DEG[0], ay = pts[a][1] * KM_DEG[1], bx = pts[b][0] * KM_DEG[0], by = pts[b][1] * KM_DEG[1];
    const len = Math.hypot(bx - ax, by - ay) || 1e-9;
    let far = -1, fd = tol;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0] * KM_DEG[0], py = pts[i][1] * KM_DEG[1];
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > fd) { fd = d; far = i; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// The 1920 network as a graph of its vertices (lines meet where they share a vertex), and each
// planned line laid along it where it can be: from each station to the nearest track, along the
// shortest path to the next station's, then on. Returns, per line, its [lon, lat] points.
function routeAlong1920(railLines, lines, stations) {
  const id = new Map(), lon = [], lat = [], adj = [];
  const node = ([x, y]) => {
    const k = `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
    let i = id.get(k);
    if (i === undefined) { i = lon.length; id.set(k, i); lon.push(x); lat.push(y); adj.push([]); }
    return i;
  };
  const km = (a, b) => Math.hypot((lon[a] - lon[b]) * KM_DEG[0], (lat[a] - lat[b]) * KM_DEG[1]);
  for (const line of railLines) {
    let prev = node(line[0]);
    for (let i = 1; i < line.length; i++) {
      const cur = node(line[i]);
      if (cur !== prev) { const d = km(prev, cur); adj[prev].push(cur, d); adj[cur].push(prev, d); }
      prev = cur;
    }
  }
  // Junctions: a line's end that stops just short of another line (the data's lines don't always
  // share the vertex where they meet) is joined to the nearest vertex within STITCH_KM.
  const STITCH_KM = 0.6;
  {
    const cell = (x, y) => `${Math.floor(x * KM_DEG[0] / STITCH_KM)},${Math.floor(y * KM_DEG[1] / STITCH_KM)}`;
    const grid = new Map();
    for (let i = 0; i < lon.length; i++) { const c = cell(lon[i], lat[i]); if (!grid.has(c)) grid.set(c, []); grid.get(c).push(i); }
    const ends = new Set();
    for (const line of railLines) { ends.add(node(line[0])); ends.add(node(line[line.length - 1])); }
    for (const e of ends) {
      const cx = Math.floor(lon[e] * KM_DEG[0] / STITCH_KM), cy = Math.floor(lat[e] * KM_DEG[1] / STITCH_KM);
      let best = -1, bd = STITCH_KM;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const i of grid.get(`${cx + dx},${cy + dy}`) || []) {
          if (i === e || adj[e].includes(i)) continue;
          const d = km(e, i);
          if (d < bd) { bd = d; best = i; }
        }
      }
      if (best >= 0) { adj[e].push(best, bd); adj[best].push(e, bd); }
    }
  }
  const nearest = ([x, y]) => {
    let best = -1, bd = Infinity;
    for (let i = 0; i < lon.length; i++) {
      const d = Math.hypot((lon[i] - x) * KM_DEG[0], (lat[i] - y) * KM_DEG[1]);
      if (d < bd) { bd = d; best = i; }
    }
    return bd <= SNAP_KM ? best : -1;
  };
  const snapped = Object.fromEntries(Object.entries(stations).map(([n, c]) => [n, nearest(c)]));
  // Shortest path a -> b, giving up past `maxKm` (a small binary heap keeps it quick).
  const path = (a, b, maxKm) => {
    const dist = new Map([[a, 0]]), prev = new Map(), heap = [[0, a]];
    const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [d, u] = pop();
      if (u === b) break;
      if (d > maxKm || d > dist.get(u)) continue;
      const e = adj[u];
      for (let k = 0; k < e.length; k += 2) {
        const v = e[k], nd = d + e[k + 1];
        if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); push([nd, v]); }
      }
    }
    if (!dist.has(b) || dist.get(b) > maxKm) return null;
    const out = [b];
    while (out[out.length - 1] !== a) out.push(prev.get(out[out.length - 1]));
    return out.reverse();
  };
  return lines.map(([, names]) => {
    const pts = [stations[names[0]]];
    for (let i = 1; i < names.length; i++) {
      const A = stations[names[i - 1]], B = stations[names[i]], a = snapped[names[i - 1]], b = snapped[names[i]];
      const straight = Math.hypot((A[0] - B[0]) * KM_DEG[0], (A[1] - B[1]) * KM_DEG[1]);
      const route = a >= 0 && b >= 0 && a !== b ? path(a, b, straight * DETOUR + 4) : null;
      if (route) {
        // Straightened into a few angled runs (Douglas-Peucker, ANGLE_KM): it still lies over
        // the old line, but reads as a schematic like the review's map, not the winding track.
        for (const q of simplify(route.map((n) => [lon[n], lat[n]]), ANGLE_KM)) pts.push(q);
      }
      pts.push(B);
    }
    return pts;
  });
}
const FADE_MS = 1200; // the dark layer comes and goes (styles.css matches)

export function createFuture({ view, Point }) {
  const host = view.container;
  const layer = document.createElement("div");
  layer.className = "future-layer";
  layer.innerHTML = `<canvas></canvas><div class="future-legend">${Object.values(KINDS).map((k) => `<span><i style="--c:${k.color}"></i>${k.label}</span>`).join("")}<span><b></b>New station</span><span><i class="ghost"></i>The railway in 1920</span><em>The network proposed for 2050 (schematic), after the All-Island Strategic Rail Review by Arup (2024)</em></div>`;
  host.appendChild(layer);
  const canvas = layer.querySelector("canvas");
  const legend = layer.querySelector(".future-legend");
  const ctx = canvas.getContext("2d");
  const points = Object.fromEntries(Object.entries(S).map(([n, [lon, lat]]) => [n, new Point({ longitude: lon, latitude: lat })]));

  let on = false, start = 0, raf = 0, offAt = 0;

  // The 1920 network, faint under the new one, so it's plain what's being put back and what never
  // will be. Every lines' vertices thinned to one in three; projected again only when the camera
  // or the canvas changes.
  let ghost = null, ghostKey = "", ghostXY = [];
  // The planned lines laid along the 1920 track (routeAlong1920), as Points; until the 1920
  // data is in, straight from town to town.
  let routed = null, routedKey = "", routedXY = [];
  fetch("data/rail.geojson").then((r) => r.json()).then((fc) => {
    ghost = [];
    const full = [];
    for (const f of fc.features) {
      const { opened_year: o, closed_year: c, status } = f.properties;
      if (!o || o > 1920 || (status === "closed" && c && c <= 1920)) continue;
      const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const line of lines) {
        full.push(line);
        const pts = line.filter((_, i) => i % 3 === 0 || i === line.length - 1);
        if (pts.length > 1) ghost.push(pts.map(([lon, lat]) => new Point({ longitude: lon, latitude: lat })));
      }
    }
    routed = routeAlong1920(full, LINES, S).map((line) => line.map(([lon, lat]) => new Point({ longitude: lon, latitude: lat })));
    routedKey = "";
  }).catch(() => {});
  const drawGhost = (w, h, a) => {
    if (!ghost) return;
    const c = view.camera, key = `${w}x${h}:${c.position.x},${c.position.y},${c.position.z},${c.heading},${c.tilt}`;
    if (key !== ghostKey) {
      ghostKey = key;
      ghostXY = ghost.map((line) => line.map((p) => view.toScreen(p)).filter(Boolean));
    }
    ctx.save();
    ctx.globalAlpha = 0.75 * a;
    ctx.strokeStyle = "#e0a85a";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    for (const line of ghostXY) {
      if (line.length < 2) continue;
      ctx.moveTo(line[0].x, line[0].y);
      for (let i = 1; i < line.length; i++) ctx.lineTo(line[i].x, line[i].y);
    }
    ctx.stroke();
    ctx.restore();
  };

  const draw = (now) => {
    const dpr = devicePixelRatio || 1;
    const w = host.clientWidth, h = host.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    // The legend in the middle of the map that's showing, clear of the panel and the drawer.
    const pad = view.padding || {};
    legend.style.left = `${(pad.left || 0) + (w - (pad.left || 0) - (pad.right || 0)) / 2}px`;
    legend.style.maxWidth = `${Math.max(240, w - (pad.left || 0) - (pad.right || 0) - 32)}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const xy = {};
    for (const [n, p] of Object.entries(points)) { const s = view.toScreen(p); if (s) xy[n] = [s.x, s.y]; }
    const reveal = Math.min(1, (now - start) / REVEAL_MS);
    const ease = 1 - (1 - reveal) ** 3;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    drawGhost(w, h, Math.min(1, (now - start) / 900));

    // The routed lines on screen, projected again only when the camera or the canvas changes.
    if (routed) {
      const c = view.camera, key = `${w}x${h}:${c.position.x},${c.position.y},${c.position.z},${c.heading},${c.tilt}`;
      if (key !== routedKey) {
        routedKey = key;
        routedXY = routed.map((line) => line.map((p) => { const s = view.toScreen(p); return s ? [s.x, s.y] : null; }).filter(Boolean));
      }
    }
    // Each line, cut to how far it has drawn in: its glow, its core, then light running along it.
    const order = ["improved", "newLine", "electric", "newElectric"];
    for (const kind of order) {
      const k = KINDS[kind];
      for (let li = 0; li < LINES.length; li++) {
        const [lk, path] = LINES[li];
        if (lk !== kind) continue;
        const pts = routed ? routedXY[li] : path.map((n) => xy[n]).filter(Boolean);
        if (pts.length < 2) continue;
        const segs = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
        let left = segs.reduce((a, b) => a + b, 0) * ease;
        ctx.beginPath();
        ctx.moveTo(...pts[0]);
        for (let i = 0; i < segs.length && left > 0; i++) {
          const f = Math.min(1, left / (segs[i] || 1));
          ctx.lineTo(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f);
          left -= segs[i];
        }
        ctx.setLineDash([]);
        ctx.strokeStyle = k.color;
        ctx.globalAlpha = 0.35; ctx.lineWidth = k.width * 3.2; ctx.shadowColor = k.color; ctx.shadowBlur = 14;
        ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = k.width; ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.shadowBlur = 0;
        if (kind !== "improved") {
          // Trains of light, faster on the electric lines.
          ctx.setLineDash([3, 26]);
          ctx.lineDashOffset = -((now / 1000) * (kind === "newLine" ? 34 : 60));
          ctx.strokeStyle = "#ffffff"; ctx.globalAlpha = 0.85; ctx.lineWidth = k.width * 0.7;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
    ctx.setLineDash([]);

    // Stations, once the lines have reached them: rings, the new ones larger and pulsing.
    if (reveal > 0.6) {
      const a = Math.min(1, (reveal - 0.6) / 0.4);
      ctx.globalAlpha = a;
      ctx.font = "600 10.5px 'Space Grotesk', system-ui, sans-serif";
      ctx.textBaseline = "middle";
      for (const [n, p] of Object.entries(xy)) {
        const isNew = NEW_STATIONS.has(n);
        const r = isNew ? 4.2 + Math.sin(now / 380 + p[0]) * 0.8 : 2.6;
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
        ctx.fillStyle = "#08111f"; ctx.fill();
        ctx.lineWidth = isNew ? 2 : 1.5; ctx.strokeStyle = isNew ? "#ffffff" : "#bfeaff";
        ctx.shadowColor = "#7fe9ff"; ctx.shadowBlur = isNew ? 10 : 0;
        ctx.stroke(); ctx.shadowBlur = 0;
        if (NAMED.has(n)) {
          const label = n.toUpperCase();
          ctx.lineWidth = 3; ctx.strokeStyle = "rgba(6,12,24,.85)";
          ctx.strokeText(label, p[0] + 8, p[1] - 1);
          ctx.fillStyle = "#e8f6ff"; ctx.fillText(label, p[0] + 8, p[1] - 1);
        }
      }
      ctx.globalAlpha = 1;
    }
    if (on || now - offAt < FADE_MS) raf = requestAnimationFrame(draw);
  };

  const set = (next) => {
    if (next === on) return;
    on = next;
    document.body.classList.toggle("future", on);
    layer.classList.toggle("on", on);
    cancelAnimationFrame(raf);
    if (on) start = performance.now();
    else offAt = performance.now();
    raf = requestAnimationFrame(draw);
  };
  return { set };
}
