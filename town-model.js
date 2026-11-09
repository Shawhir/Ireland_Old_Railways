// A town's building for towns3d.js: a square tower under a hipped roof, both made of paper
// (a fibrous grain over the walls and roof, like the map's own sheet), its corners picked out
// in the roof's colour so it reads as an outlined drawing. Built here as a tiny glTF (44
// triangles: four walls, four roof faces, four corner posts) handed to ArcGIS as a blob URL.
// towns3d.js uses one, very tall, for every town (in a few variants with the grain shifted),
// so the roof keeps its pitch and the grain its size.

const STOREYS_ACROSS = 4; // heights are rounded to steps of a quarter of the width
const ROOF_RISE = 0.35; // the roof's height, as a share of the tower's width
const EAVES = 1.06; // the roof overhangs the walls by this much
const GRAIN_M = 1400; // one repeat of the paper grain, in metres on the building
const GRAIN_PX = 256; // the grain texture's size
const POST = 0.04; // the corner posts' thickness, as a share of the width (the outline)

// sRGB colour to the linear values glTF material factors expect.
const linear = (hex) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255) ** 2.2);
const shade = (hex, k) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, "0")).join("");

// Paper grain as a PNG, near white, multiplied by each material's colour: soft blotches where
// the sheet is thicker, short fibres lying every which way, and a fine tooth. Everything wraps
// at the edges, so it tiles without a seam.
const paperGrain = () => new Promise((resolve) => {
  const S = GRAIN_PX;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const wrapped = (draw) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) draw(dx, dy); };

  g.fillStyle = "#f4f4f4";
  g.fillRect(0, 0, S, S);
  // Blotches: the sheet a little thicker or thinner.
  for (let k = 0; k < 26; k++) {
    const x = rnd() * S, y = rnd() * S, r = 18 + rnd() * 46, dark = rnd() < 0.55;
    wrapped((dx, dy) => {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gr.addColorStop(0, dark ? "rgba(120,120,120,0.10)" : "rgba(255,255,255,0.22)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
    });
  }
  // Fibres: short curved strokes, mostly a shade darker, some lighter.
  g.lineCap = "round";
  for (let k = 0; k < 340; k++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI, len = 4 + rnd() * 16, bend = (rnd() - 0.5) * 6;
    const light = rnd() < 0.3;
    g.strokeStyle = light ? `rgba(255,255,255,${0.35 + rnd() * 0.3})` : `rgba(90,90,90,${0.08 + rnd() * 0.14})`;
    g.lineWidth = 0.6 + rnd() * 0.8;
    const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
    wrapped((dx, dy) => {
      g.beginPath();
      g.moveTo(x + dx, y + dy);
      g.quadraticCurveTo(x + dx + ex / 2 - Math.sin(a) * bend, y + dy + ey / 2 + Math.cos(a) * bend, x + dx + ex, y + dy + ey);
      g.stroke();
    });
  }
  // Tooth: a fine speckle over everything.
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 16;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  c.toBlob((b) => b.arrayBuffer().then((a) => resolve(new Uint8Array(a))), "image/png");
});

// The building as a GLB, in metres: walls `width` wide and `wallHeight` tall, standing on its
// origin, the roof on top. glTF is y-up. The grain's coordinates are in metres / GRAIN_M, so it
// is the same size on every face.
function buildGlb({ width, wallHeight, wallColor, roofColor, png, shift = [0, 0] }) {
  const h = width / 2, e = h * EAVES, top = wallHeight, apex = top + width * ROOF_RISE;
  const G = GRAIN_M;
  const [su, sv] = shift; // where the grain starts, in repeats (a different spot per variant)

  // Walls: four quads, each with its own outward normal; the grain runs across and up.
  const wallP = [], wallN = [], wallUV = [], wallI = [];
  const corners = [[-h, -h], [h, -h], [h, h], [-h, h]]; // x, z around the tower
  for (let s = 0; s < 4; s++) {
    const [ax, az] = corners[s], [bx, bz] = corners[(s + 1) % 4];
    const n = [(bz - az) / width, 0, -(bx - ax) / width]; // outward
    const base = wallP.length / 3;
    const u0 = (s * width) / G, u1 = ((s + 1) * width) / G; // carried round the corners
    wallP.push(ax, 0, az, bx, 0, bz, bx, top, bz, ax, top, az);
    wallUV.push(su + u0, sv + top / G, su + u1, sv + top / G, su + u1, sv, su + u0, sv);
    for (let k = 0; k < 4; k++) wallN.push(n[0], 0, n[2]);
    wallI.push(base, base + 2, base + 1, base, base + 3, base + 2); // counter-clockwise from outside
  }

  // Roof: a hipped pyramid over the eaves, four flat faces; the grain laid on from above.
  const roofP = [], roofN = [], roofUV = [], roofI = [];
  const eaves = [[-e, -e], [e, -e], [e, e], [-e, e]];
  for (let s = 0; s < 4; s++) {
    const [ax, az] = eaves[s], [bx, bz] = eaves[(s + 1) % 4];
    const A = [ax, top, az], B = [bx, top, bz], C = [0, apex, 0];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[1] < 0) n = n.map((x) => -x); // facing up and out
    const len = Math.hypot(...n);
    const base = roofP.length / 3;
    roofP.push(...A, ...B, ...C);
    for (const p of [A, B, C]) roofUV.push(su + p[0] / G, sv + p[2] / G);
    for (let k = 0; k < 3; k++) roofN.push(n[0] / len, n[1] / len, n[2] / len);
    roofI.push(base, base + 2, base + 1);
  }

  // Corner posts: a thin square post up each corner, in the roof's material, standing just
  // proud of the walls, so every vertical edge is drawn as a dark line up to the roof.
  const p = (width * POST) / 2;
  for (const [cx, cz] of corners) {
    const sq = [[cx - p, cz - p], [cx + p, cz - p], [cx + p, cz + p], [cx - p, cz + p]];
    for (let s = 0; s < 4; s++) {
      const [ax, az] = sq[s], [bx, bz] = sq[(s + 1) % 4];
      const n = [Math.sign(bz - az), 0, -Math.sign(bx - ax)];
      const base = roofP.length / 3;
      roofP.push(ax, 0, az, bx, 0, bz, bx, top, bz, ax, top, az);
      roofUV.push(su + ax / G, sv + top / G, su + bx / G, sv + top / G, su + bx / G, sv, su + ax / G, sv);
      for (let k = 0; k < 4; k++) roofN.push(n[0], 0, n[2]);
      roofI.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }

  // Pack everything into one binary buffer, each piece 4-byte aligned.
  const parts = [];
  let offset = 0;
  const views = [];
  const add = (typed, target) => {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (bytes.length % 4)) % 4;
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) });
    parts.push(bytes, new Uint8Array(pad));
    offset += bytes.length + pad;
    return views.length - 1;
  };
  const bounds = (p) => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[i + k]); max[k] = Math.max(max[k], p[i + k]); }
    return { min, max };
  };
  const accessors = [];
  const acc = (view, type, count, componentType, extra = {}) => { accessors.push({ bufferView: view, componentType, count, type, ...extra }); return accessors.length - 1; };
  const F = 5126, U16 = 5123, ARRAY = 34962, INDEX = 34963;

  const wP = acc(add(new Float32Array(wallP), ARRAY), "VEC3", wallP.length / 3, F, bounds(wallP));
  const wN = acc(add(new Float32Array(wallN), ARRAY), "VEC3", wallN.length / 3, F);
  const wT = acc(add(new Float32Array(wallUV), ARRAY), "VEC2", wallUV.length / 2, F);
  const wI = acc(add(new Uint16Array(wallI), INDEX), "SCALAR", wallI.length, U16);
  const rP = acc(add(new Float32Array(roofP), ARRAY), "VEC3", roofP.length / 3, F, bounds(roofP));
  const rN = acc(add(new Float32Array(roofN), ARRAY), "VEC3", roofN.length / 3, F);
  const rT = acc(add(new Float32Array(roofUV), ARRAY), "VEC2", roofUV.length / 2, F);
  const rI = acc(add(new Uint16Array(roofI), INDEX), "SCALAR", roofI.length, U16);
  const imageView = add(png);

  const paper = (hex) => ({
    pbrMetallicRoughness: { baseColorFactor: [...linear(hex), 1], baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 },
  });
  const gltf = {
    asset: { version: "2.0", generator: "Ireland's Railways town-model.js" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [
      { attributes: { POSITION: wP, NORMAL: wN, TEXCOORD_0: wT }, indices: wI, material: 0 },
      { attributes: { POSITION: rP, NORMAL: rN, TEXCOORD_0: rT }, indices: rI, material: 1 },
    ] }],
    materials: [paper(wallColor), paper(roofColor)],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    images: [{ bufferView: imageView, mimeType: "image/png" }],
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: offset }],
  };

  // GLB: header, JSON chunk (space-padded), binary chunk.
  let json = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = (4 - (json.length % 4)) % 4;
  json = new Uint8Array([...json, ...new Array(jsonPad).fill(0x20)]);
  const total = 12 + 8 + json.length + 8 + offset;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, json.length, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(json, 20);
  let at = 20 + json.length;
  dv.setUint32(at, offset, true); dv.setUint32(at + 4, 0x004e4942, true);
  at += 8;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// Returns modelFor(height) -> a promise of { url, height }: a blob URL for a building about
// `height` metres tall from its base to the top of its roof (rounded to STOREYS_ACROSS steps),
// `width` across, and its exact height.
// `variant` picks one of a few fixed shifts of the grain, so neighbours don't match.
export function createTownModels({ width, color, roofColor = shade(color, 0.55) }) {
  const step = width / STOREYS_ACROSS;
  const grain = paperGrain();
  const cache = new Map();
  const golden = 0.618034;
  const modelFor = (height, variant = 0) => {
    const wallHeight = Math.max(step, Math.round((height - width * ROOF_RISE) / step) * step);
    const key = `${wallHeight}:${variant}`;
    if (!cache.has(key)) {
      const shift = [(variant * golden) % 1, (variant * golden * golden * 3.7) % 1];
      cache.set(key, grain.then((png) => URL.createObjectURL(new Blob([buildGlb({ width, wallHeight, wallColor: color, roofColor, png, shift })], { type: "model/gltf-binary" }))));
    }
    return cache.get(key).then((url) => ({ url, height: wallHeight + width * ROOF_RISE }));
  };
  return { modelFor };
}
