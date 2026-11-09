// A tiling 3D noise volume for the volumetric clouds (volclouds.js), 64 texels a side, RGBA8.
// It takes a few hundred milliseconds, so it's built in a worker while the title card is up;
// volclouds.js falls back to building it on the main thread if workers aren't available.
//   R: billowy cloud shape. Smooth value noise, its low parts carved by Worley cells, so it
//      breaks into rounded heaps rather than blobs.
//   G, B, A: Worley cells (inverted: 1 at a cell's heart) at 4, 8 and 16 cells a side, for
//      the shader to erode cloud edges with, coarse to fine.
// Everything wraps at the edges, so the volume tiles seamlessly through the sky.

export const SIZE = 64;

const hash = (x, y, z, seed) => {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1) ^ Math.imul(seed, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
const wrap = (a, p) => ((a % p) + p) % p;

// 1 at a feature point, falling to 0 a cell away. Positions are 0..1 across the tile.
const worley = (x, y, z, cells, seed) => {
  const px = x * cells, py = y * cells, pz = z * cells;
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  let best = 9;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = ix + dx, cy = iy + dy, cz = iz + dz;
    const wx = wrap(cx, cells), wy = wrap(cy, cells), wz = wrap(cz, cells);
    const fx = cx + hash(wx, wy, wz, seed) - px;
    const fy = cy + hash(wx, wy, wz, seed + 1) - py;
    const fz = cz + hash(wx, wy, wz, seed + 2) - pz;
    best = Math.min(best, fx * fx + fy * fy + fz * fz);
  }
  return 1 - Math.min(1, Math.sqrt(best));
};

const smooth = (t) => t * t * (3 - 2 * t);
const valueNoise = (x, y, z, cells, seed) => {
  const px = x * cells, py = y * cells, pz = z * cells;
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  const u = smooth(px - ix), v = smooth(py - iy), w = smooth(pz - iz);
  let sum = 0;
  for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const n = hash(wrap(ix + i, cells), wrap(iy + j, cells), wrap(iz + k, cells), seed);
    sum += n * (i ? u : 1 - u) * (j ? v : 1 - v) * (k ? w : 1 - w);
  }
  return sum;
};

export function buildNoise() {
  const data = new Uint8Array(SIZE ** 3 * 4);
  let o = 0;
  for (let k = 0; k < SIZE; k++) for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    const x = i / SIZE, y = j / SIZE, z = k / SIZE;
    const w4 = worley(x, y, z, 4, 11), w8 = worley(x, y, z, 8, 23), w16 = worley(x, y, z, 16, 37);
    const value = valueNoise(x, y, z, 4, 3) * 0.55 + valueNoise(x, y, z, 8, 5) * 0.3 + valueNoise(x, y, z, 16, 7) * 0.15;
    const cells = w4 * 0.625 + w8 * 0.25 + w16 * 0.125;
    // Value noise remapped so its lows are carved by the cells' gaps (Perlin-Worley).
    // That lands between about 0.35 and 0.85; stretched to fill the byte.
    const shape = Math.min(1, Math.max(0, ((value - (cells - 1)) / (2 - cells) - 0.35) / 0.5));
    data[o++] = 255 * shape;
    data[o++] = 255 * w4;
    data[o++] = 255 * w8;
    data[o++] = 255 * w16;
  }
  return data;
}

// Run as a worker: build it and hand the bytes back.
if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) {
  const data = buildNoise();
  self.postMessage(data, [data.buffer]);
}
