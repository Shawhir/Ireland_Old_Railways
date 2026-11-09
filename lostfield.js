// The lost-railway scorch's grid maths (lostland.js draws it), run in a worker (lostland-worker.js)
// so a change of year never stalls the page: the scorch's reach for a year, from two distance
// fields on a 1 km grid, and each cell's clock, from when the moving lines' tips pass it.

export const BOX = { lon: [-10.75, -5.35], lat: [51.3, 55.5] };
export const KM = [66.2, 110.6];        // km per degree of longitude and latitude, near Ireland
export const SERVED_KM = 10;            // within this of an open line, a place has its railway
export const BAND_KM = 5;               // how far in the dissolving edge reaches
export const NX = Math.ceil((BOX.lon[1] - BOX.lon[0]) * KM[0]);
export const NY = Math.ceil((BOX.lat[1] - BOX.lat[0]) * KM[1]);
export const SPREAD_S = 0.2;             // after the rail passes, how long the ground takes to scorch: right behind the
                                         // retreating line, so a removal and its burn are over together in 0.7 s (was 2.6)
export const EMBER_S = 5.0;              // the embers smoulder on this long after
export const FADE_MS = 900;              // switching the scorch on or off
export const FIRST_SPAN_MS = 3400;       // the first burn, closures in order of year, over this long
export const GROW_MS = 900;              // as lines3d.js: one line pulling back end to end

// ---- Distance transform (Felzenszwalb & Huttenlocher), squared, in cells ----
function edt1d(f, n, d, v, z, arg) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) {
      const p = v[k];
      s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
      if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break;
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k];
    d[q] = (q - p) * (q - p) + f[p];
    if (arg) arg[q] = p;
  }
}

// Distance (km) from every cell to the nearest line drawn in `seed` (1 on a line, else 0).
function distanceField(seed) {
  const INF = 1e12, n = Math.max(NX, NY);
  const g = new Float64Array(NX * NY);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < NX; x++) {
    for (let y = 0; y < NY; y++) f[y] = seed[y * NX + x] ? 0 : INF;
    edt1d(f, NY, d, v, z);
    for (let y = 0; y < NY; y++) g[y * NX + x] = d[y];
  }
  const out = new Float32Array(NX * NY);
  for (let y = 0; y < NY; y++) {
    for (let x = 0; x < NX; x++) f[x] = g[y * NX + x];
    edt1d(f, NX, d, v, z);
    for (let x = 0; x < NX; x++) out[y * NX + x] = Math.min(Math.sqrt(d[x]), 1000);
  }
  return out;
}

// For every cell, the index of the nearest cell set in `seed` (-1 if there are none).
function nearestSeed(seed) {
  const INF = 1e12, n = Math.max(NX, NY);
  const g = new Float64Array(NX * NY), row = new Int32Array(NX * NY);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), arg = new Int32Array(n);
  let any = false;
  for (let x = 0; x < NX; x++) {
    for (let y = 0; y < NY; y++) { f[y] = seed[y * NX + x] ? 0 : INF; if (seed[y * NX + x]) any = true; }
    edt1d(f, NY, d, v, z, arg);
    for (let y = 0; y < NY; y++) { g[y * NX + x] = d[y]; row[y * NX + x] = arg[y]; }
  }
  const out = new Int32Array(NX * NY).fill(-1);
  if (!any) return out;
  for (let y = 0; y < NY; y++) {
    for (let x = 0; x < NX; x++) f[x] = g[y * NX + x];
    edt1d(f, NX, d, v, z, arg);
    for (let x = 0; x < NX; x++) { const px = arg[x]; out[y * NX + x] = row[y * NX + px] * NX + px; }
  }
  return out;
}

// Grid position (cells, y down from the north) of a lon, lat.
const gx = (lon) => (lon - BOX.lon[0]) * KM[0];
const gy = (lat) => (BOX.lat[1] - lat) * KM[1];

function drawLines(features, keep) {
  const seed = new Uint8Array(NX * NY);
  for (const f of features) {
    if (!keep(f.properties)) continue;
    const c = f.geometry.coordinates;
    for (let i = 1; i < c.length; i++) {
      const x0 = gx(c[i - 1][0]), y0 = gy(c[i - 1][1]), x1 = gx(c[i][0]), y1 = gy(c[i][1]);
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(x0 + ((x1 - x0) * s) / steps), y = Math.round(y0 + ((y1 - y0) * s) / steps);
        if (x >= 0 && y >= 0 && x < NX && y < NY) seed[y * NX + x] = 1;
      }
    }
  }
  return seed;
}

// lines3d.js's easing, and its inverse: how far through its animation a line is when its tip
// is a share `e` of the way.
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const unease = (e) => {
  let lo = 0, hi = 1;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (easeInOut(m) < e) lo = m; else hi = m; }
  return (lo + hi) / 2;
};

const openedBy = (p, year) => (p.opened_year || 1840) <= year;
const openIn = (p, year, presentYear) => openedBy(p, year) && (p.status === "current" || (p.closed_year ? p.closed_year > year : year < presentYear));

// The scorch's reach, per cell, in km: positive inside it (how far in from its edge).
export function reachFor(features, year, presentYear) {
  const now = distanceField(drawLines(features, (p) => openIn(p, year, presentYear)));
  const ever = distanceField(drawLines(features, (p) => openedBy(p, year)));
  const s = new Float32Array(NX * NY);
  for (let i = 0; i < s.length; i++) s[i] = Math.min(now[i] - SERVED_KM, SERVED_KM - ever[i]);
  return s;
}

// Each cell's clock (ms, the page's performance.now() time): when the nearest point of a moving
// line is passed by its tip. `tipAt(line, fraction along it)` gives that, or null for a line
// that isn't moving. Cells with no moving line anywhere get `fallback`.
function clocks(features, tipAt, fallback) {
  const seed = new Uint8Array(NX * NY), T = new Float64Array(NX * NY).fill(Infinity);
  features.forEach((f, li) => {
    if (tipAt(li, 0) === null) return;
    const c = f.geometry.coordinates;
    const cum = [0];
    for (let i = 1; i < c.length; i++) cum.push(cum[i - 1] + Math.hypot((c[i][0] - c[i - 1][0]) * KM[0], (c[i][1] - c[i - 1][1]) * KM[1]));
    const total = cum[cum.length - 1] || 1;
    for (let i = 1; i < c.length; i++) {
      const x0 = gx(c[i - 1][0]), y0 = gy(c[i - 1][1]), x1 = gx(c[i][0]), y1 = gy(c[i][1]);
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
      for (let st = 0; st <= steps; st++) {
        const x = Math.round(x0 + ((x1 - x0) * st) / steps), y = Math.round(y0 + ((y1 - y0) * st) / steps);
        if (x < 0 || y < 0 || x >= NX || y >= NY) continue;
        const at = tipAt(li, (cum[i - 1] + (cum[i] - cum[i - 1]) * (st / steps)) / total);
        const j = y * NX + x;
        seed[j] = 1;
        if (at < T[j]) T[j] = at;
      }
    }
  });
  const near = nearestSeed(seed);
  const out = new Float64Array(NX * NY);
  for (let i = 0; i < out.length; i++) out[i] = near[i] < 0 ? fallback : T[near[i]];
  return out;
}

// The first burn, as the map lands: each closed line burning in the order it closed, its tip
// pulling back from its far end as lines3d draws a closure, starting at `now`.
export function firstClocks(features, year, presentYear, now) {
  const first = Math.min(...features.map((f) => f.properties.closed_year || year));
  return clocks(features, (li, frac) => {
    const p = features[li].properties;
    if (!openedBy(p, year) || openIn(p, year, presentYear)) return null;
    const order = year > first ? ((p.closed_year || year) - first) / (year - first) : 0;
    return now + 400 + order * FIRST_SPAN_MS + (1 - frac) * GROW_MS;
  }, now);
}

// A change of year: from lines3d's plan (each line's animation: from, to, start, dur in ms).
export function planClocks(features, plan, now) {
  return clocks(features, (li, frac) => {
    const a = plan[li];
    if (!a || a.to === a.from) return null;
    const e = a.to < a.from ? (a.from - frac) / (a.from - a.to) : (frac - a.from) / (a.to - a.from);
    if (e <= 0) return a.start;
    if (e >= 1) return a.start + a.dur;
    return a.start + unease(e) * a.dur;
  }, now);
}
