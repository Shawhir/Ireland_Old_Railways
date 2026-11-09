// Draws the opening's cirrus once, as clouds are drawn on old engraved maps, into one texture
// (an atlas of CELLS drawings) for clouds3d.js: a feathered body with faint fibres along it, a
// crisp ink outline whose weight wavers a little like a pen line, and a few fine hatching
// strokes along the lower, shaded edge. Run in a worker so it never holds up the page.
//
// Each drawing is a strand along x: u runs -1..1 along it, v -1..1 across it. Premultiplied RGBA.

export const CELL_W = 768, CELL_H = 256, COLS = 2, ROWS = 4, CELLS = COLS * ROWS;

const INK = [0.42, 0.46, 0.54];          // cool grey-blue: lighter than the map's ink, never a coast
const FIBRE = [0.72, 0.78, 0.88];        // the thicker fibres, a touch blue-grey
const EDGE_AT = 0.3;                     // where the outline runs, on the body's shape
const STREAK_PX = 13;                    // spacing of the fine streaks along the strand
const HATCH_PX = 5.5;                    // spacing of the hatching strokes

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
}
function fbm(x, y) {
  let v = 0, a = 0.5;
  for (let i = 0; i < 5; i++) { v += a * noise(x, y); x = x * 2.03 + 7.7; y = y * 2.03 + 7.7; a *= 0.5; }
  return v;
}
const smooth = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };

function drawCell(seed, out, ox, oy, atlasW) {
  const W = CELL_W, H = CELL_H;
  const S = new Float32Array(W * H), fib = new Float32Array(W * H), body = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const v = (y / (H - 1)) * 2 - 1;
    for (let x = 0; x < W; x++) {
      const u = (x / (W - 1)) * 2 - 1;
      // A long, slim strand tapering to its tails, with a gently swelling edge: smooth noise
      // only (fine noise made the edge jagged, like a coastline), as an engraver would draw it.
      const swell = noise(u * 1.5 + seed, seed * 0.37) * 0.65 + noise(u * 3.3 + seed * 2.1, 5.1) * 0.35;
      // Narrowing to fine tails at both ends, like a wisp drawn with one stroke of the pen,
      // and a little off-centre so it isn't a lens.
      const taper = Math.max(0, 1 - Math.pow(Math.abs(u + 0.15 * (swell - 0.5)), 1.6));
      const halfW = (0.3 + 0.42 * swell) * taper - 0.04;        // across, in v: closes before the ends
      // Past the tips the width is negative: nothing there (left as it was, the falloff came out
      // full for the whole height, a thin column at each end, outlined).
      const across = halfW <= 0 ? 0 : 1 - smooth(0.6, 1, Math.abs(v - (swell - 0.5) * 0.25) / halfW);
      const b = (1 - smooth(0.82, 1, Math.abs(u))) * across;
      const f = fbm(u * 2.2, v * 3.2 + seed);
      const striae = fbm(u * 0.7 + seed, v * 6.5);
      const i = y * W + x;
      body[i] = b;
      fib[i] = smooth(0.22, 0.86, f * 0.7 + striae * 0.42);
      S[i] = b;
    }
  }
  for (let y = 1; y < H - 1; y++) {
    const v = (y / (H - 1)) * 2 - 1;
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, u = (x / (W - 1)) * 2 - 1;
      const s = S[i];
      // Distance to the outline in pixels, from how fast the shape changes here.
      const gx = (S[i + 1] - S[i - 1]) / 2, gy = (S[i + W] - S[i - W]) / 2;
      const g = Math.hypot(gx, gy) + 1e-5;
      const dist = Math.abs(s - EDGE_AT) / g;
      const weight = 0.9 + 0.7 * noise(u * 3.1 + seed, seed * 1.7);   // the pen line's half-width
      const line = Math.min(1, Math.max(0, weight - dist + 0.5));
      const inside = smooth(EDGE_AT - 0.015, EDGE_AT + 0.015, s);
      // Hatching: fine strokes along the strand, only just inside the lower edge, fading in.
      let hatch = 0;
      if (v > 0.05 && inside > 0) {
        const wob = (noise(u * 4 + seed, 3.3) - 0.5) * 2.2;
        const m = (((y + wob) % HATCH_PX) + HATCH_PX) % HATCH_PX;
        const stroke = 1 - smooth(0.55, 1.15, Math.abs(m - HATCH_PX / 2));
        const near = 1 - smooth(EDGE_AT + 0.02, EDGE_AT + 0.2, s);   // only near the edge
        const along = smooth(0.95, 0.55, Math.abs(u)) * noise(u * 9 + seed, v * 2);
        hatch = stroke * near * smooth(0.25, 0.6, along) * inside * 0.75;
      }
      // Streaks along the strand, as cirrus fibres are drawn: fine, broken ink lines following
      // its length, bowing a little, fading out towards the edge and the tails.
      let streak = 0;
      if (inside > 0) {
        const bow = (noise(u * 1.8 + seed, 7.7) - 0.5) * 9 + v * v * 4;
        const m = (((y + bow) % STREAK_PX) + STREAK_PX) % STREAK_PX;
        const stroke = 1 - smooth(0.45, 1.05, Math.abs(m - STREAK_PX / 2));
        const broken = smooth(0.45, 0.7, noise(u * 7 + seed + Math.floor((y + bow) / STREAK_PX) * 3.7, 1.3));
        streak = stroke * broken * smooth(EDGE_AT + 0.08, EDGE_AT + 0.35, s) * 0.45;
      }
      const ink = Math.max(line, hatch, streak);
      // The fill: lit white, the thicker fibres a touch blue-grey, a little see-through.
      const fibre = smooth(0.55, 0.95, fib[i] * body[i]) * 0.55;
      const fillA = inside * (0.58 + 0.3 * fib[i]);
      const fr = 1 + (FIBRE[0] - 1) * fibre, fg = 1 + (FIBRE[1] - 1) * fibre, fbl = 1 + (FIBRE[2] - 1) * fibre;
      const a = Math.max(fillA, ink * 0.92);
      const t = a > 0 ? (ink * 0.92) / a : 0;   // how much of what's here is ink
      const r = fr + (INK[0] - fr) * t, gg = fg + (INK[1] - fg) * t, bb = fbl + (INK[2] - fbl) * t;
      const o = ((oy + y) * atlasW + ox + x) * 4;
      out[o] = r * a * 255; out[o + 1] = gg * a * 255; out[o + 2] = bb * a * 255; out[o + 3] = a * 255;
    }
  }
}

export function drawAtlas() {
  const W = CELL_W * COLS, H = CELL_H * ROWS;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let c = 0; c < CELLS; c++) drawCell(11.3 + c * 17.9, out, (c % COLS) * CELL_W, Math.floor(c / COLS) * CELL_H, W);
  return { width: W, height: H, data: out };
}

// As a worker: draw, and send the pixels back.
if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) {
  const atlas = drawAtlas();
  self.postMessage(atlas, [atlas.data.buffer]);
}
