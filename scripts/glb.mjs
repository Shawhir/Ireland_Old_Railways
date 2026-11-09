// Tiny toolkit for building low-poly models out of simple shapes and writing them as GLB.
// Used by make-landmarks.mjs.
//
// Model space: x = right, y = up, z = towards the viewer. Shapes are added per colour;
// every colour becomes one primitive with flat normals, double-sided.

export function createMesh(colors) {
  const tris = Object.fromEntries(Object.keys(colors).map((k) => [k, []]));
  const tri = (mat, a, b, c) => {
    if (!tris[mat]) throw new Error(`unknown colour "${mat}"`);
    tris[mat].push(a, b, c);
  };
  const quad = (mat, a, b, c, d) => { tri(mat, a, b, c); tri(mat, a, c, d); };

  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const scale = (a, s) => a.map((v) => v * s);
  const norm = (a) => scale(a, 1 / (Math.hypot(...a) || 1));
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // Two unit vectors perpendicular to `axis` and to each other.
  const basis = (axis) => {
    const t = norm(axis);
    const helper = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(t, helper));
    return [u, cross(t, u)];
  };

  const ellipsoid = (mat, [cx, cy, cz], [rx, ry, rz], { seg = 18, rings = 10, upper = false } = {}) => {
    const last = upper ? rings / 2 : rings;
    const p = (i, j) => {
      const th = (i / rings) * Math.PI, ph = (j / seg) * 2 * Math.PI;
      return [cx + rx * Math.sin(th) * Math.cos(ph), cy + ry * Math.cos(th), cz + rz * Math.sin(th) * Math.sin(ph)];
    };
    for (let i = 0; i < last; i++) {
      for (let j = 0; j < seg; j++) quad(mat, p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1));
    }
  };
  const dome = (mat, center, radii, opts = {}) => ellipsoid(mat, center, radii, { ...opts, upper: true });

  // A tube through a list of points with a radius per point (open ends).
  const tube = (mat, path, radii, seg = 12) => {
    const rings = path.map((c, k) => {
      const n = path[Math.min(k + 1, path.length - 1)], b = path[Math.max(k - 1, 0)];
      const [u, v] = basis(sub(n, b));
      return Array.from({ length: seg }, (_, j) => {
        const a = (j / seg) * 2 * Math.PI;
        return add(c, scale(add(scale(u, Math.cos(a)), scale(v, Math.sin(a))), radii[k]));
      });
    });
    for (let k = 0; k < path.length - 1; k++) {
      for (let j = 0; j < seg; j++) {
        const j2 = (j + 1) % seg;
        quad(mat, rings[k][j], rings[k + 1][j], rings[k + 1][j2], rings[k][j2]);
      }
    }
  };

  // A closed cylinder (or frustum) from point a to point b, at any angle.
  const cylinder = (mat, a, b, r0, r1 = r0, sides = 16, capMat = mat) => {
    const [u, v] = basis(sub(b, a));
    const ring = (c, r) => Array.from({ length: sides }, (_, j) => {
      const t = (j / sides) * 2 * Math.PI;
      return add(c, scale(add(scale(u, Math.cos(t)), scale(v, Math.sin(t))), r));
    });
    const A = ring(a, r0), B = ring(b, r1);
    for (let j = 0; j < sides; j++) {
      const j2 = (j + 1) % sides;
      quad(mat, A[j], B[j], B[j2], A[j2]);
      if (r0 > 0) tri(capMat, a, A[j2], A[j]);
      if (r1 > 0) tri(capMat, b, B[j], B[j2]);
    }
  };
  const cone = (mat, base, tip, r, sides = 16) => cylinder(mat, base, tip, r, 0, sides);

  // An upright n-sided prism standing on y = y0.
  const prism = (mat, [cx, y0, cz], r, h, sides = 6, rot = 0, topMat = mat) => {
    const p = (j, y) => {
      const t = rot + (j / sides) * 2 * Math.PI;
      return [cx + r * Math.cos(t), y, cz + r * Math.sin(t)];
    };
    for (let j = 0; j < sides; j++) {
      const j2 = (j + 1) % sides;
      quad(mat, p(j, y0), p(j2, y0), p(j2, y0 + h), p(j, y0 + h));
      tri(topMat, [cx, y0 + h, cz], p(j, y0 + h), p(j2, y0 + h));
      tri(mat, [cx, y0, cz], p(j2, y0), p(j, y0));
    }
  };

  const box = (mat, [x0, y0, z0], [x1, y1, z1], topMat = mat) => {
    const c = (x, y, z) => [x ? x1 : x0, y ? y1 : y0, z ? z1 : z0];
    quad(mat, c(0, 0, 1), c(1, 0, 1), c(1, 1, 1), c(0, 1, 1));
    quad(mat, c(1, 0, 0), c(0, 0, 0), c(0, 1, 0), c(1, 1, 0));
    quad(mat, c(0, 0, 0), c(0, 0, 1), c(0, 1, 1), c(0, 1, 0));
    quad(mat, c(1, 0, 1), c(1, 0, 0), c(1, 1, 0), c(1, 1, 1));
    quad(topMat, c(0, 1, 1), c(1, 1, 1), c(1, 1, 0), c(0, 1, 0));
    quad(mat, c(0, 0, 0), c(1, 0, 0), c(1, 0, 1), c(0, 0, 1));
  };

  // A pitched roof over a box footprint, ridge running along x, from y0 up to y1.
  const gable = (mat, [x0, y0, z0], [x1, y1, z1], endMat = mat) => {
    const zm = (z0 + z1) / 2;
    quad(mat, [x0, y0, z1], [x1, y0, z1], [x1, y1, zm], [x0, y1, zm]);
    quad(mat, [x1, y0, z0], [x0, y0, z0], [x0, y1, zm], [x1, y1, zm]);
    tri(endMat, [x0, y0, z0], [x0, y0, z1], [x0, y1, zm]);
    tri(endMat, [x1, y0, z1], [x1, y0, z0], [x1, y1, zm]);
  };

  // A building: walls with a pitched roof.
  const house = (wall, roof, [x0, z0], [x1, z1], h, roofH) => {
    box(wall, [x0, 0, z0], [x1, h, z1]);
    gable(roof, [x0, h, z0], [x1, h + roofH, z1], wall);
  };

  // A semicircular arch in the x-y plane, `thick` deep in z.
  const arch = (mat, cx, y0, r, width, z0, z1, steps = 10) => {
    const pt = (a, rr, z) => [cx + rr * Math.cos(a), y0 + rr * Math.sin(a), z];
    for (let s = 0; s < steps; s++) {
      const a0 = (s / steps) * Math.PI, a1 = ((s + 1) / steps) * Math.PI;
      const ro = r + width;
      quad(mat, pt(a0, r, z0), pt(a1, r, z0), pt(a1, r, z1), pt(a0, r, z1)); // underside
      quad(mat, pt(a0, r, z1), pt(a1, r, z1), pt(a1, ro, z1), pt(a0, ro, z1)); // front face
      quad(mat, pt(a0, r, z0), pt(a0, ro, z0), pt(a1, ro, z0), pt(a1, r, z0)); // back face
    }
  };

  return { tris, tri, quad, ellipsoid, dome, tube, cylinder, cone, prism, box, gable, house, arch };
}

// One mesh, one primitive per colour, flat normals, double-sided.
export function toGlb(tris, colors, { roughness = 0.85 } = {}) {
  const chunks = [], bufferViews = [], accessors = [], primitives = [], materials = [];
  let offset = 0;
  const push = (arr, extra) => {
    const bytes = Buffer.from(arr.buffer);
    chunks.push(bytes);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target: 34962 });
    offset += bytes.length;
    accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: arr.length / 3, type: "VEC3", ...extra });
    return accessors.length - 1;
  };
  for (const [name, verts] of Object.entries(tris)) {
    if (!verts.length) continue;
    const pos = new Float32Array(verts.flat());
    const nor = new Float32Array(pos.length);
    for (let i = 0; i < verts.length; i += 3) {
      const [a, b, c] = verts.slice(i, i + 3);
      const u = b.map((v, k) => v - a[k]), w = c.map((v, k) => v - a[k]);
      let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const l = Math.hypot(...n) || 1;
      n = n.map((v) => v / l);
      for (let k = 0; k < 3; k++) nor.set(n, (i + k) * 3);
    }
    const min = [0, 1, 2].map((k) => Math.min(...verts.map((v) => v[k])));
    const max = [0, 1, 2].map((k) => Math.max(...verts.map((v) => v[k])));
    const P = push(pos, { min, max });
    const N = push(nor);
    materials.push({
      name,
      pbrMetallicRoughness: { baseColorFactor: colors[name], metallicFactor: 0, roughnessFactor: roughness },
      doubleSided: true,
    });
    primitives.push({ attributes: { POSITION: P, NORMAL: N }, material: materials.length - 1 });
  }
  const bin = Buffer.concat(chunks);
  const json = {
    asset: { version: "2.0", generator: "Ireland_Old_Railways scripts/glb.mjs" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives }], materials, accessors, bufferViews,
    buffers: [{ byteLength: bin.length }],
  };
  const pad = (b, fill) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
  const jsonChunk = pad(Buffer.from(JSON.stringify(json)), 0x20);
  const binChunk = pad(bin, 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const chunkHeader = (len, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(len, 0);
    h.writeUInt32LE(type, 4);
    return h;
  };
  return Buffer.concat([header, chunkHeader(jsonChunk.length, 0x4e4f534a), jsonChunk, chunkHeader(binChunk.length, 0x004e4942), binChunk]);
}

// sRGB hex to the linear RGBA glTF expects.
export function rgba(hex, alpha = 1) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const n = parseInt(hex.slice(1), 16);
  return [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255), alpha];
}
