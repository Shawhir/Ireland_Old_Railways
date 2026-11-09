// Builds a small symbolic 3D model for each landmark on the map:
//   node scripts/make-landmarks.mjs
// Writes assets/landmarks/<model>.glb. Models are about 2 units across, standing on y = 0,
// with their front facing +z (towards the viewer in the map's opening view).

import { mkdir, writeFile } from "node:fs/promises";
import { createMesh, rgba, toGlb } from "./glb.mjs";

const COLORS = {
  stone: rgba("#d8d2c4"),
  stoneDark: rgba("#a39a89"),
  roof: rgba("#5d6b80"),
  slate: rgba("#4a5260"),
  white: rgba("#f4f3ee"),
  grass: rgba("#6fa35a"),
  grassDark: rgba("#4f7d3f"),
  rock: rgba("#8d8b80"),
  basalt: rgba("#3c3e44"),
  basaltTop: rgba("#62656d"),
  water: rgba("#3f86c4"),
  cliff: rgba("#7f7a70"),
  gold: rgba("#f2c200"),
  spire: rgba("#c9ced6"),
  green: rgba("#1f5e3b"),
  red: rgba("#a32020"),
  black: rgba("#1d1d22"),
  brass: rgba("#c9a227"),
  rail: rgba("#6f6f74"),
  sleeper: rgba("#6b4f35"),
  orange: rgba("#ef7a12"),
};

// Small seeded random numbers, so each city's buildings come out the same every run.
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ground = (m, r = 1.0, mat = "grass") => m.prism(mat, [0, -0.02, 0], r, 0.02, 32);

// A town of houses and blocks, optionally split by a river running across it.
function town(m, { seed, radius = 0.85, river = false, skip = () => false, spire = true }) {
  const rnd = random(seed);
  ground(m, 1.0, "grassDark");
  if (river) m.box("water", [-1.0, -0.01, -0.07], [1.0, 0.012, 0.07]);
  const step = 0.3;
  for (let gx = -3; gx <= 3; gx++) {
    for (let gz = -3; gz <= 3; gz++) {
      const x = gx * step + (rnd() - 0.5) * 0.08, z = gz * step + (rnd() - 0.5) * 0.08;
      const d = Math.hypot(x, z);
      if (d > radius || rnd() < 0.18) continue;
      if (river && Math.abs(z) < 0.16) continue;
      if (skip(x, z)) continue;
      const w = 0.09 + rnd() * 0.06, dp = 0.09 + rnd() * 0.06;
      const h = 0.12 + (1 - d / radius) * 0.35 + rnd() * 0.15;
      if (rnd() < 0.5) {
        m.box("stone", [x - w, 0, z - dp], [x + w, h, z + dp], "roof");
      } else {
        m.box("stone", [x - w, 0, z - dp], [x + w, h * 0.7, z + dp]);
        m.gable("roof", [x - w, h * 0.7, z - dp], [x + w, h * 0.7 + 0.12, z + dp], "stone");
      }
    }
  }
  if (spire) {
    m.box("stoneDark", [-0.62, 0, -0.5], [-0.5, 0.42, -0.38]);
    m.cone("slate", [-0.56, 0.42, -0.44], [-0.56, 0.85, -0.44], 0.075, 4);
  }
}

const roundTower = (m, x, z, h, r = 0.15, y0 = 0) => {
  m.cylinder("stone", [x, y0, z], [x, y0 + h, z], r, r * 0.82, 16);
  m.cone("slate", [x, y0 + h, z], [x, y0 + h + r * 2, z], r * 0.9, 16);
};

const locomotive = (m, body) => {
  // Track
  for (const z of [-0.13, 0.13]) m.box("rail", [-1.1, 0.02, z - 0.015], [1.1, 0.05, z + 0.015]);
  for (let x = -1.05; x <= 1.05; x += 0.17) m.box("sleeper", [x - 0.035, 0, -0.22], [x + 0.035, 0.025, 0.22]);
  // Frame, wheels, boiler, cab
  m.box("black", [-0.75, 0.12, -0.17], [0.72, 0.2, 0.17]);
  for (const x of [-0.42, -0.04, 0.34]) {
    for (const s of [-1, 1]) m.cylinder("red", [x, 0.18, s * 0.17], [x, 0.18, s * 0.22], 0.15, 0.15, 20);
  }
  m.cylinder(body, [-0.3, 0.44, 0], [0.56, 0.44, 0], 0.2, 0.2, 20, "black");
  m.cylinder("black", [0.54, 0.44, 0], [0.72, 0.44, 0], 0.21, 0.21, 20);
  m.cylinder("black", [0.6, 0.6, 0], [0.6, 0.88, 0], 0.055, 0.065, 12);
  m.dome("brass", [0.12, 0.62, 0], [0.08, 0.09, 0.08]);
  m.box(body, [-0.78, 0.2, -0.24], [-0.3, 0.8, 0.24]);
  m.box("black", [-0.83, 0.8, -0.28], [-0.25, 0.85, 0.28]);
  m.box("red", [0.72, 0.13, -0.22], [0.76, 0.27, 0.22]);
  // A puff of steam
  m.ellipsoid("white", [0.62, 1.02, 0], [0.09, 0.07, 0.09], { seg: 10, rings: 6 });
  m.ellipsoid("white", [0.5, 1.15, -0.03], [0.12, 0.09, 0.11], { seg: 10, rings: 6 });
  m.ellipsoid("white", [0.32, 1.27, 0.02], [0.15, 0.1, 0.13], { seg: 10, rings: 6 });
};

const MODELS = {
  dublin(m) {
    town(m, { seed: 1, river: true, spire: false, skip: (x, z) => Math.hypot(x - 0.05, z - 0.3) < 0.18 });
    // The Spire on O'Connell Street
    m.cone("spire", [0.05, 0, 0.3], [0.05, 2.3, 0.3], 0.04, 10);
  },
  belfast(m) {
    town(m, { seed: 2, skip: (x, z) => z > 0.3 });
    // Samson and Goliath, the Harland & Wolff gantry cranes
    for (const x0 of [-0.55, 0.05]) {
      for (const [dx, dz] of [[0, 0], [0.42, 0], [0, 0.16], [0.42, 0.16]]) {
        m.box("gold", [x0 + dx, 0, 0.5 + dz], [x0 + dx + 0.05, 0.95, 0.5 + dz + 0.05]);
      }
      m.box("gold", [x0 - 0.04, 0.95, 0.48], [x0 + 0.51, 1.07, 0.73]);
    }
  },
  cork(m) {
    town(m, { seed: 3, river: true, spire: false, skip: (x, z) => x < -0.2 && z < -0.15 });
    // St Fin Barre's: a cathedral with three spires
    m.box("stone", [-0.75, 0, -0.62], [-0.25, 0.32, -0.36]);
    m.gable("slate", [-0.75, 0.32, -0.62], [-0.25, 0.46, -0.36], "stone");
    for (const [x, z, h] of [[-0.5, -0.49, 1.0], [-0.72, -0.59, 0.72], [-0.72, -0.39, 0.72]]) {
      m.box("stone", [x - 0.06, 0, z - 0.06], [x + 0.06, h * 0.55, z + 0.06]);
      m.cone("slate", [x, h * 0.55, z], [x, h, z], 0.075, 8);
    }
  },
  limerick(m) {
    town(m, { seed: 4, river: true, skip: (x, z) => x > 0.25 && z > 0.2 });
    // King John's Castle by the Shannon
    m.box("stoneDark", [0.3, 0, 0.25], [0.75, 0.32, 0.6]);
    for (const [x, z] of [[0.3, 0.25], [0.75, 0.25], [0.3, 0.6], [0.75, 0.6]]) m.prism("stoneDark", [x, 0, z], 0.09, 0.45, 12);
  },
  galway(m) { town(m, { seed: 5, river: true }); },
  waterford(m) {
    town(m, { seed: 6, river: true, skip: (x, z) => Math.hypot(x - 0.45, z - 0.4) < 0.2 });
    // Reginald's Tower
    m.prism("stoneDark", [0.45, 0, 0.4], 0.14, 0.62, 16);
    m.cone("slate", [0.45, 0.62, 0.4], [0.45, 0.82, 0.4], 0.15, 16);
  },
  derry(m) {
    town(m, { seed: 7, radius: 0.62 });
    // The city walls
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * 2 * Math.PI, a1 = ((i + 1) / n) * 2 * Math.PI, r = 0.78, t = 0.07;
      const p = (a, rr, y) => [rr * Math.cos(a), y, rr * Math.sin(a)];
      m.quad("stoneDark", p(a0, r, 0), p(a1, r, 0), p(a1, r, 0.16), p(a0, r, 0.16));
      m.quad("stoneDark", p(a0, r + t, 0), p(a1, r + t, 0), p(a1, r + t, 0.16), p(a0, r + t, 0.16));
      m.quad("stoneDark", p(a0, r, 0.16), p(a1, r, 0.16), p(a1, r + t, 0.16), p(a0, r + t, 0.16));
    }
  },
  kilkenny(m) {
    town(m, { seed: 8, skip: (x, z) => z > 0.1 });
    // Kilkenny Castle: a long range with round corner towers
    m.box("stone", [-0.6, 0, 0.25], [0.6, 0.36, 0.6]);
    m.gable("slate", [-0.6, 0.36, 0.25], [0.6, 0.48, 0.6], "stone");
    for (const x of [-0.62, 0.62]) {
      for (const z of [0.25, 0.6]) {
        m.prism("stone", [x, 0, z], 0.12, 0.55, 14);
        m.dome("slate", [x, 0.55, z], [0.12, 0.1, 0.12], { seg: 14, rings: 8 });
      }
    }
  },
  sligo(m) {
    town(m, { seed: 9 });
    // Benbulben behind the town
    m.dome("grassDark", [0.1, 0, -0.75], [0.9, 0.55, 0.3]);
  },

  newgrange(m) {
    ground(m, 1.15);
    m.cylinder("white", [0, 0, 0], [0, 0.2, 0], 0.95, 0.95, 48, "grass");
    m.dome("grass", [0, 0.2, 0], [0.95, 0.34, 0.95], { seg: 32, rings: 12 });
    m.box("black", [-0.08, 0, 0.9], [0.08, 0.15, 0.97]);
    m.ellipsoid("rock", [0, 0.05, 1.05], [0.18, 0.07, 0.05], { seg: 10, rings: 6 });
  },
  tara(m) {
    ground(m, 1.1);
    m.dome("grassDark", [0, 0, 0], [1.0, 0.12, 1.0], { seg: 32, rings: 10 });
    m.dome("grass", [0, 0.1, 0], [0.55, 0.28, 0.55], { seg: 28, rings: 10 });
    // The Lia Fáil, the Stone of Destiny
    m.cylinder("rock", [0, 0.3, 0], [0, 0.85, 0], 0.07, 0.06, 8);
  },
  cashel(m) {
    ground(m, 1.05);
    m.dome("rock", [0, 0, 0], [1.0, 0.42, 0.75], { seg: 24, rings: 10 });
    // The roofless cathedral, its tower and the round tower, on top of the rock
    m.box("stoneDark", [-0.55, 0.3, -0.16], [0.3, 0.72, 0.16]);
    m.gable("stoneDark", [-0.55, 0.72, -0.16], [0.3, 0.86, 0.16]);
    m.box("stoneDark", [-0.13, 0.3, -0.2], [0.11, 1.0, 0.2]);
    roundTower(m, 0.52, -0.12, 0.95, 0.085, 0.25);
  },
  clonmacnoise(m) {
    ground(m, 1.0);
    m.house("stone", "slate", [-0.8, -0.2], [-0.1, 0.2], 0.3, 0.2);
    roundTower(m, 0.3, -0.05, 1.5);
    // A high cross with its ring
    m.box("stoneDark", [0.62, 0, 0.42], [0.7, 0.62, 0.48]);
    m.box("stoneDark", [0.5, 0.42, 0.42], [0.82, 0.5, 0.48]);
    m.arch("stoneDark", 0.66, 0.46, 0.09, 0.025, 0.42, 0.48, 8);
  },
  glendalough(m) {
    ground(m, 1.0);
    // The lake in its valley, with hills either side
    m.prism("water", [0, -0.01, -0.55], 0.45, 0.02, 24);
    m.dome("grassDark", [-0.85, 0, -0.5], [0.4, 0.6, 0.6]);
    m.dome("grassDark", [0.85, 0, -0.5], [0.4, 0.55, 0.6]);
    m.house("stone", "slate", [-0.45, 0.1], [0.05, 0.4], 0.25, 0.17);
    roundTower(m, 0.35, 0.25, 1.4);
  },
  causeway(m) {
    // Hexagonal basalt columns, stepping down towards the sea
    m.prism("water", [0, -0.02, 0.55], 1.0, 0.02, 32);
    const size = 0.11;
    const rnd = random(11);
    for (let q = -6; q <= 6; q++) {
      for (let r = -6; r <= 6; r++) {
        const x = size * Math.sqrt(3) * (q + r / 2), z = size * 1.5 * r;
        if (Math.hypot(x, z * 1.3) > 0.95) continue;
        const h = 0.08 + Math.max(0, 0.6 - (z + 0.6) * 0.45) + rnd() * 0.12;
        m.prism("basalt", [x, 0, z], size * 0.98, h, 6, Math.PI / 6, "basaltTop");
      }
    }
  },
  cliffs(m) {
    // A cliff face along the coast with the sea in front and O'Brien's Tower on top
    m.box("water", [-1.1, -0.02, 0.3], [1.1, 0.01, 1.0]);
    const steps = 12, rnd = random(12);
    const front = Array.from({ length: steps + 1 }, () => 0.3 + rnd() * 0.08);
    const top = Array.from({ length: steps + 1 }, () => 0.85 + rnd() * 0.12);
    for (let i = 0; i < steps; i++) {
      const x0 = -1 + (2 * i) / steps, x1 = -1 + (2 * (i + 1)) / steps;
      const [f0, f1, t0, t1] = [front[i], front[i + 1], top[i], top[i + 1]];
      m.quad("cliff", [x0, 0, f0], [x1, 0, f1], [x1, t1, f1 - 0.04], [x0, t0, f0 - 0.04]);
      m.quad("grass", [x0, t0, f0 - 0.04], [x1, t1, f1 - 0.04], [x1, 0.5, -0.8], [x0, 0.5, -0.8]);
      m.quad("grassDark", [x0, 0.5, -0.8], [x1, 0.5, -0.8], [x1, 0, -0.8], [x0, 0, -0.8]);
    }
    for (const [i, x] of [[0, -1], [steps, 1]]) {
      m.quad("cliff", [x, 0, front[i]], [x, top[i], front[i] - 0.04], [x, 0.5, -0.8], [x, 0, -0.8]);
    }
    m.cylinder("stone", [0.25, 0.8, 0.05], [0.25, 1.12, 0.05], 0.07, 0.07, 14);
  },
  lough(m) {
    m.prism("water", [0, -0.01, 0], 1.0, 0.03, 40);
    m.prism("grass", [0, -0.02, 0], 1.12, 0.02, 40);
    // The four swans
    for (const [x, z] of [[0, 0.3], [-0.28, 0.02], [0.28, 0.02], [0, -0.26]]) {
      m.ellipsoid("white", [x, 0.08, z], [0.08, 0.06, 0.14], { seg: 12, rings: 8 });
      m.tube("white", [[x, 0.1, z + 0.08], [x, 0.22, z + 0.1], [x, 0.3, z + 0.08]], [0.025, 0.022, 0.02], 8);
      m.ellipsoid("white", [x, 0.31, z + 0.11], [0.03, 0.03, 0.05], { seg: 8, rings: 6 });
      m.cone("orange", [x, 0.31, z + 0.15], [x, 0.3, z + 0.21], 0.015, 6);
    }
  },
  "locomotive-green"(m) { locomotive(m, "green"); },
  // County Donegal Railways engines were painted red.
  "locomotive-red"(m) { locomotive(m, "red"); },
  monorail(m) {
    // Lartigue monorail: A-frame trestles carrying one rail, the engine slung either side
    for (let x = -1; x <= 1.001; x += 0.25) {
      m.cylinder("rail", [x, 0, -0.32], [x, 0.62, 0], 0.025, 0.025, 6);
      m.cylinder("rail", [x, 0, 0.32], [x, 0.62, 0], 0.025, 0.025, 6);
    }
    m.cylinder("rail", [-1.1, 0.63, 0], [1.1, 0.63, 0], 0.03, 0.03, 8);
    for (const s of [-1, 1]) {
      m.cylinder("green", [-0.28, 0.42, s * 0.2], [0.35, 0.42, s * 0.2], 0.12, 0.12, 16, "black");
      m.cylinder("black", [0.25, 0.52, s * 0.2], [0.25, 0.72, s * 0.2], 0.035, 0.04, 10);
    }
    m.box("black", [-0.32, 0.6, -0.08], [0.36, 0.74, 0.08]);
    m.box("green", [-0.55, 0.22, -0.33], [-0.3, 0.8, 0.33]);
    m.box("black", [-0.58, 0.8, -0.36], [-0.27, 0.84, 0.36]);
    m.box("red", [0.48, 0.22, -0.3], [1.02, 0.72, 0.3], "black");
  },
  viaduct(m) {
    // A twelve-arch stone viaduct across a valley
    ground(m, 1.15, "grassDark");
    m.box("water", [-0.25, -0.01, -0.5], [0.25, 0.01, 0.5]);
    const arches = 12, x0 = -1.2, span = 2.4 / arches, pier = 0.05;
    const r = (span - pier) / 2, spring = 0.48;
    m.box("stoneDark", [x0 - 0.05, spring + r - 0.02, -0.08], [-x0 + 0.05, spring + r + 0.1, 0.08]);
    for (let i = 0; i <= arches; i++) {
      const x = x0 + i * span;
      m.box("stoneDark", [x - pier / 2, 0, -0.08], [x + pier / 2, spring + r, 0.08]);
    }
    for (let i = 0; i < arches; i++) m.arch("stoneDark", x0 + (i + 0.5) * span, spring, r, 0.04, -0.08, 0.08, 8);
    m.dome("grass", [-1.25, 0, 0], [0.2, 0.6, 0.35]);
    m.dome("grass", [1.25, 0, 0], [0.2, 0.6, 0.35]);
  },
};

const outDir = new URL("../assets/landmarks/", import.meta.url);
await mkdir(outDir, { recursive: true });
for (const [name, build] of Object.entries(MODELS)) {
  const m = createMesh(COLORS);
  build(m);
  const glb = toGlb(m.tris, COLORS);
  await writeFile(new URL(`${name}.glb`, outDir), glb);
  console.log(`assets/landmarks/${name}.glb  ${(glb.length / 1024).toFixed(0)} KB`);
}
