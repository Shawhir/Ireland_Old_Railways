// Volumetric clouds for the opening flight, which the camera drops towards and which dissolve
// as it nears the map. A stand-in for the cirrus cards (clouds3d.js) with the same interface,
// switched on with ?vol (heaped cumulus) or ?vol=cirrus (high streaks along the jet).
//
// Ray marched, the way game engines draw clouds: for each pixel, a ray from the eye crosses a
// shell of sky (between the preset's base and top heights), sampling a tiling 3D noise volume
// (cloud-noise.js) for how dense the air is. At each dense sample a few more samples towards
// the sun say how much light gets through to it (Beer's law), so cloud tops are lit and
// undersides fall into blue-grey shade, with a bright rim looking into the sun. Under the
// clouds, a short march from the ground towards the sun darkens the map: their shadows.
//
// Scaled up like the swans, so it reads at country scale: heaps ~20 km across and 6 km tall,
// cirrus streaks a few hundred km long. Each kind is a preset (PRESETS): its density function
// and numbers. Cirrus is a sheet 2.5 km thick seen from hundreds of km up, so rather than
// marching it, it's sampled where the ray crosses three heights in it, at full resolution:
// sharper, steadier and cheaper. Every pattern is filtered to the size of the pixel it lands
// in (see fw and lodFor), so fine detail fades to its average instead of shimmering.
// Drawn into our own texture, then laid over the scene with one blend (scene * light through
// + cloud colour), in ArcGIS's render loop as a RenderNode. Only during the flight: removed
// once it lands. With ?debug, window.__volHot() reloads this file's presets and shaders
// without reloading the map, for tuning.

import { SIZE, buildNoise } from "./cloud-noise.js";

const FOCUS = [-8.0, 53.4]; // middle of the cloud field, mid-Ireland
const FIELD_KM = [650, 1000]; // the field fades out between these distances from FOCUS
const FADE = [0.7, 0.95]; // when, in the flight, it dissolves: once the camera is through it
// The jet carries everything from the west-south-west, along this bearing.
const WIND_BEARING = 67;
const MAX_PIXELS = 2.5e6; // the cloud pass's resolution cap
const STEPS = 40; // samples along each ray, for the marched presets
// The sun matches the rest of the scene: west-south-west, 35 degrees up.
const SUN_AZ = 240, SUN_EL = 35;

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  vUv = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
}`;

export const volumeShader = (P) => `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler3D uNoise;
uniform vec3 uRight, uUp, uFwd; // camera axes, render coordinates
uniform vec2 uTan;              // tan of the half field of view, x and y
uniform vec3 uEyeF;             // eye relative to the field's middle on the ground (m)
uniform float uEyeAlt;          // eye height above the sphere (m)
uniform vec3 uE, uN, uU;        // east, north, up at the field's middle
uniform float uR;               // sphere radius (m)
uniform vec3 uSun;              // towards the sun
uniform vec2 uWind;             // how far the air has moved, east and north (m)
uniform float uCoverage, uTime;
uniform float uPixel; // how wide a pixel is per metre of distance
// How wide (m) the pixel is where the sample being taken lands on the cloud. Set before each
// density() call. Texture detail is chosen from it explicitly (lodFor): the usual screen
// derivatives are undefined inside loops, and each pattern has its own scale.
float fw = 1000.0;
// The mip level for a pattern repeating every \`scale\` metres (one noise tile).
float lodFor(float scale) { return max(log2(fw * ${SIZE}.0 / scale), 0.0); }
const float BASE = ${P.base.toFixed(1)}, TOP = ${P.top.toFixed(1)};
const float TILE = ${P.tile.toFixed(1)}, DENSITY = ${P.density.toFixed(8)};
const vec2 FIELD = vec2(${FIELD_KM[0] * 1000}.0, ${FIELD_KM[1] * 1000}.0);
const int STEPS = ${STEPS};
const vec2 WIND = vec2(${Math.sin(WIND_BEARING * Math.PI / 180).toFixed(5)}, ${Math.cos(WIND_BEARING * Math.PI / 180).toFixed(5)});
// Kept below pure white: the map's paper is off-white, and white cloud over it glared.
const vec3 SUN_COLOR = vec3(0.8, 0.78, 0.74), SKY_COLOR = vec3(0.3, 0.37, 0.5);
const float WHITE = 0.93;
${P.consts || ""}
${P.funcs || ""}

float remap(float v, float a, float b, float c, float d) { return c + (v - a) * (d - c) / (b - a); }

// Height above the sphere of a point given relative to the field's middle on the ground,
// written so that float precision holds up 6,400 km from the earth's centre.
float altitude(vec3 p) {
  float s = 2.0 * uR * dot(uU, p) + dot(p, p);
  return s / (sqrt(uR * uR + s) + uR);
}

// Where a ray from the eye meets the sphere at height h: near and far distances, or none.
vec2 shell(float mu, float h) {
  float b = (uR + uEyeAlt) * mu;
  float c = (uEyeAlt - h) * (2.0 * uR + uEyeAlt + h);
  float d = b * b - c;
  if (d < 0.0) return vec2(-1.0);
  d = sqrt(d);
  return vec2(-b - d, -b + d);
}

// How dense the cloud is at p (per metre). cheap skips the fine erosion, for light samples.
float density(vec3 p, float h, bool cheap) {
  float y = (h - BASE) / (TOP - BASE);
  if (y <= 0.0 || y >= 1.0) return 0.0;
  vec2 ground = vec2(dot(p, uE), dot(p, uN));
  float field = 1.0 - smoothstep(FIELD.x, FIELD.y, length(ground));
  if (field <= 0.0) return 0.0;
  vec2 xy = ground - uWind;
${P.shape}
  return max(d, 0.0) * DENSITY;
}

float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5) * 0.0795775; }

// Light reaching p from the sun through the cloud above it (0..1).
float sunlight(vec3 p, float step0) {
  float depth = 0.0, s = step0;
  vec3 q = p;
  for (int j = 0; j < 3; j++) {
    q += uSun * s;
    depth += density(q, altitude(q), true) * s;
    s *= 2.5;
  }
  // Beer's law, plus a softer term for light scattered more than once, which keeps the
  // insides of thick cloud from going black.
  depth *= ${P.lightLoss.toFixed(2)}; // thin ice cloud loses far less light than water cloud
  return exp(-depth) + 0.45 * exp(-depth * 0.15);
}

${P.sheet ? SHEET_MAIN(P) : MARCH_MAIN(P)}`;

const MARCH_MAIN = (P) => `
void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 ray = normalize(uFwd + uRight * ndc.x * uTan.x + uUp * ndc.y * uTan.y);
  vec3 eyeUp = normalize(uR * uU + uEyeF);
  float mu = dot(eyeUp, ray);

  vec2 top = shell(mu, TOP), bottom = shell(mu, BASE), ground = shell(mu, 0.0);
  float t0 = 0.0, t1 = 0.0;
  if (uEyeAlt > TOP) {
    if (top.x > 0.0) { t0 = top.x; t1 = bottom.x > 0.0 ? bottom.x : top.y; }
  } else {
    t1 = bottom.x > 0.0 ? bottom.x : top.y; // inside the layer (not used by the flight, but sound)
  }
  t1 = min(t1, t0 + 300000.0);

  float light = 1.0;
  vec3 color = vec3(0.0);
  if (t1 > t0) {
    float dt = (t1 - t0) / float(STEPS);
    // A fixed per-pixel jitter of where the samples fall, so steps don't show as bands.
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float cosSun = dot(ray, uSun);
    // Mostly even, multiply scattered light, with a bright lobe looking into the sun.
    float phase = ${P.phaseBase.toFixed(2)} + mix(hg(cosSun, 0.7), hg(cosSun, -0.2), 0.3) * 12.566 * ${P.phaseLobe.toFixed(2)};
    float t = t0 + dt * jitter;
    for (int i = 0; i < STEPS; i++) {
      vec3 p = uEyeF + ray * t;
      float h = altitude(p);
      fw = t * uPixel;
      float s = density(p, h, false);
      if (s > 0.0) {
        float sun = sunlight(p, ${P.lightStep.toFixed(1)});
        float y = (h - BASE) / (TOP - BASE);
        // Dense cores look darker at their edges facing the sun ("powder"), which shapes heaps.
        float powder = 1.0 - exp(-s * 2400.0);
        vec3 lit = SUN_COLOR * sun * phase * mix(0.6, 1.0, powder) + SKY_COLOR * mix(0.55, 1.0, y);
        lit = min(pow(lit, vec3(1.0 / 2.2)), vec3(WHITE)); // the scene's colours are display-encoded
        float a = 1.0 - exp(-s * dt);
        color += light * a * lit;
        light *= 1.0 - a;
        if (light < 0.02) break;
      }
      t += dt;
    }
  }

  // Shadows on the ground (or sea) the ray lands on.
  if (ground.x > 0.0 && light > 0.02) {
    vec3 g = uEyeF + ray * ground.x;
    float up = max(dot(normalize(uR * uU + g), uSun), 0.2);
    float a = BASE / up, b = TOP / up, depth = 0.0;
    for (int j = 0; j < 6; j++) {
      vec3 q = g + uSun * mix(a, b, (float(j) + 0.5) / 6.0);
      depth += density(q, altitude(q), true);
    }
    light *= mix(1.0, exp(-depth * (b - a) / 6.0), ${P.shadow.toFixed(2)});
  }
  fragColor = vec4(color, light);
}`;

// For thin sheets (cirrus): where the ray crosses the top third of the layer, standing for a third
// of its thickness. (It used to cross three heights; the two lower ones, the last clouds the
// camera met on its way down before they faded out, were removed.) No march, so no sampling noise.
const SHEET_MAIN = (P) => `
void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 ray = normalize(uFwd + uRight * ndc.x * uTan.x + uUp * ndc.y * uTan.y);
  vec3 eyeUp = normalize(uR * uU + uEyeF);
  float mu = dot(eyeUp, ray);
  float cosSun = dot(ray, uSun);
  float phase = ${P.phaseBase.toFixed(2)} + mix(hg(cosSun, 0.7), hg(cosSun, -0.2), 0.3) * 12.566 * ${P.phaseLobe.toFixed(2)};
  float light = 1.0;
  vec3 color = vec3(0.0);
  bool above = uEyeAlt > TOP;
  // The top third's height only.
  for (int i = 0; i < 1; i++) {
    float h = mix(BASE, TOP, 2.5 / 3.0);
    vec2 hit = shell(mu, h);
    float t = uEyeAlt > h ? hit.x : hit.y;
    if (t <= 0.0) continue;
    vec3 p = uEyeF + ray * t;
    float slant = max(abs(dot(normalize(uR * uU + p), ray)), 0.12);
    fw = t * uPixel / slant;
    float s = density(p, h, false);
    if (s <= 0.0) continue;
    float a = 1.0 - exp(-s * (TOP - BASE) / 3.0 / slant);
    // Thin ice: lit almost flat, a little greyer where it's thick.
    float self = exp(-s * (TOP - BASE) * ${P.lightLoss.toFixed(2)});
    vec3 lit = SUN_COLOR * phase * mix(0.75, 1.0, self) + SKY_COLOR;
    lit = min(pow(lit, vec3(1.0 / 2.2)), vec3(WHITE));
    color += light * a * lit;
    light *= 1.0 - a;
  }
  // Its shadow on the ground (or sea) the ray lands on: the sheet's middle, towards the sun,
  // blurred a little (light through ice is soft-edged).
  vec2 ground = shell(mu, 0.0);
  if (ground.x > 0.0) {
    vec3 g = uEyeF + ray * ground.x;
    vec3 n = normalize(uR * uU + g);
    float up = max(dot(n, uSun), 0.2);
    float mid = 0.5 * (BASE + TOP);
    fw = max(ground.x * uPixel / max(abs(dot(n, ray)), 0.12), ${(P.shadowBlur || 3000).toFixed(1)});
    float s = density(g + uSun * (mid / up), mid, true);
    light *= mix(1.0, exp(-s * (TOP - BASE) / up), ${P.shadow.toFixed(2)});
  }
  fragColor = vec4(color, light);
}`;

export const PRESETS = {
  // Heaped fair-weather cumulus: rounded cells with flat bases, gathered into patches.
  cumulus: {
    scale: 0.4, // resolution of the cloud pass (they're soft: it barely shows)
    base: 5000, top: 11000, tile: 150000, density: 1 / 900, coverage: 0.34, drift: 60,
    lightStep: 400, lightLoss: 1.0, phaseBase: 0.75, phaseLobe: 0.5, shadow: 0.35,
    shape: `
  // Broad weather, at two scales so it doesn't repeat: where heaps gather, where it's clear.
  float weather = textureLod(uNoise, vec3(xy / (TILE * 5.0), 0.31), 0.0).r * 0.6
    + textureLod(uNoise, vec3(xy / (TILE * 13.0), 0.71), 0.0).r * 0.4;
  float cover = uCoverage * field * smoothstep(0.25, 0.7, weather) * 1.5;
  vec3 q = vec3(xy, h * 3.0) / TILE;
  // The shape, also at two unrelated scales, so the tile's pattern doesn't show as a lattice.
  float lod = lodFor(TILE);
  float shape = textureLod(uNoise, q, lod).r * 0.65 + textureLod(uNoise, q * 0.43 + vec3(0.31, 0.17, 0.53), max(lod - 1.2, 0.0)).r * 0.35;
  // Flat bases, rounded tops that reach higher where the weather is fuller.
  float profile = smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.3 + 0.5 * weather, 1.0, y));
  float d = remap(shape * profile, 1.0 - cover, 1.0, 0.0, 1.0);
  if (d <= 0.0) return 0.0;
  if (!cheap) {
    // Erode the edges: wispy at the base, billowing towards the top.
    vec4 m = textureLod(uNoise, q * 4.7 + vec3(0.0, 0.0, uTime * 0.01), lodFor(TILE / 4.7));
    float fine = m.g * 0.625 + m.b * 0.25 + m.a * 0.125;
    fine = mix(1.0 - fine, fine, clamp(y * 3.0, 0.0, 1.0));
    // Only the thin edges go: the threshold is a fraction of the density there.
    d = remap(d, fine * 0.12, 1.0, 0.0, 1.0);
  }`,
  },
  // Cirrus on the jet, after how it looks from above (NASA's VIIRS image of jet cirrus off
  // Western Australia, June 2019): soft streaks drawn out along the flow, with clear sky
  // between, denser heads among translucent trails, and fine fibres inside them that fray
  // their edges. Densest near the jet's axis, scattered in patches away from it. Ice cloud:
  // lit almost flat, casting soft shadows. Drawn as a sheet (SHEET_MAIN). The look is set by
  // the named constants below.
  cirrus: {
    sheet: true, scale: 1.0, shadowBlur: 25000,
    // Full strength and fuller than before: as the default opening's clouds, thin pale streaks
    // that thinned away under the title card were easy to miss.
    opacity: 1,
    base: 13000, top: 15500, tile: 120000, density: 1 / 420, coverage: 1.3, drift: 150,
    lightLoss: 0.25, phaseBase: 1.0, phaseLobe: 0.35, shadow: 0.12,
    consts: `
// The broad arcs the flow follows: amplitude (m) and wavelength (m) of its bends.
const vec3 BEND_AMP = vec3(90000.0, 25000.0, 6000.0);
const vec3 BEND_LEN = vec3(420000.0, 150000.0, 53000.0);
// Turbulence in the flow, at two scales: size along and across (m), and how far (m) it
// pushes the filaments sideways. It's what makes them wander, split and rejoin.
const vec2 WARP1 = vec2(380000.0, 160000.0);
const vec2 WARP2 = vec2(160000.0, 40000.0);
const vec2 WARP_AMP = vec2(38000.0, 5000.0);
const float WARP_LOD = 2.5; // keeps only the warp noise's broad shapes
// Filaments: length and width (m) of the coarsest octave (each finer one is about half), how
// sharp their crests are, and how many octaves.
const vec2 FILAMENT = vec2(360000.0, 9000.0);
const float SHARP = 4.0;
// The body: soft streaks of cloud, with sky between. Noise stretched with the flow at two
// sizes (along, across, m); where it's above a threshold there's cloud, fading in over a
// soft edge. The fibres only texture it.
const vec2 BODY_WIDE = vec2(1600000.0, 200000.0);
const vec2 BODY = vec2(800000.0, 90000.0);
const vec2 BODY2 = vec2(300000.0, 30000.0);
const vec2 BODY_EDGE = vec2(0.52, 0.3); // threshold in the jet's core, and how soft the edge is
// How much the fibres show in the body (0 none, 1 lines on clear sky).
const float FIBRE_CONTRAST = 0.8;
// How far the fibres eat into the body's edges, fraying them (in units of the body noise).
const float FRAY = 0.1;
const vec2 GRAIN = vec2(160000.0, 12000.0);
// The jet: its axis offset across the flow (m), and its half-widths on the poleward and
// equatorward sides (m).
const float JET_OFFSET = 60000.0, JET_POLE = 77000.0, JET_EQ = 120000.0;
// Patches of cirrus away from the jet: their size along and across the flow (m).
const vec2 PATCH_SIZE = vec2(1100000.0, 360000.0);
`,
    funcs: `
// The broad arcs, as a sideways shift for a distance along the flow. Sums of sines, not the
// noise texture: its coarse texels put kinks in long curves.
float bend(float along) {
  return BEND_AMP.x * sin(along / BEND_LEN.x + 0.7) + BEND_AMP.y * sin(along / BEND_LEN.y + 2.1)
    + BEND_AMP.z * sin(along / BEND_LEN.z);
}
// One octave of filaments: the crests of noise stretched size.x along and size.y across,
// sharpened. Where the octave is finer than the pixel, it gives way to its average brightness
// (blurred crests would otherwise turn into an even bright haze).
float filaments(vec2 p, vec2 size, float z) {
  float lod = lodFor(size.y);
  float n = textureLod(uNoise, vec3(p / size, z), lod).r;
  float crest = pow(1.0 - abs(2.0 * n - 1.0), SHARP);
  return mix(crest, 0.8 / (SHARP + 1.0), smoothstep(0.5, 2.5, lod));
}
`,
    shape: `
  float along = dot(xy, WIND), across = dot(xy, vec2(WIND.y, -WIND.x));
  // The jet, fixed to the ground while the cloud drifts through it; it follows the arcs.
  vec2 pq = vec2(dot(ground, WIND), dot(ground, vec2(WIND.y, -WIND.x)));
  float axis = pq.y + JET_OFFSET + bend(pq.x);
  float jw = axis > 0.0 ? JET_POLE : JET_EQ;
  float band = exp(-axis * axis / (jw * jw));
  float patches = smoothstep(0.4, 0.75, textureLod(uNoise, vec3(pq / PATCH_SIZE, 0.57), lodFor(PATCH_SIZE.y)).r);
  float cover = sqrt(uCoverage) * field * max(band, patches * 0.75);
  if (cover <= 0.01) return 0.0;
  // The flow: the arcs, then turbulence at two scales pushing it sideways, so streaks wander
  // and split. Read from blurred mip levels (WARP_LOD): a warp with detail finer than its own
  // push folds the flow over itself into rings.
  vec2 f = vec2(along, across + bend(along));
  f.y += (textureLod(uNoise, vec3(f / WARP1, 0.11), max(lodFor(WARP1.y), WARP_LOD)).r - 0.5) * WARP_AMP.x;
  float w2 = textureLod(uNoise, vec3(f / WARP2, 0.43), max(lodFor(WARP2.y), WARP_LOD)).r - 0.5;
  f += vec2(0.5, 1.0) * w2 * WARP_AMP.y;
  // The body: two sizes of stretched noise; then the jet and the patches raise or lower it,
  // so near the axis streaks merge and away from it they thin to scattered wisps.
  float b = textureLod(uNoise, vec3(f / BODY_WIDE, 0.81), lodFor(BODY_WIDE.y)).r * 0.3
    + textureLod(uNoise, vec3(f / BODY, 0.23), lodFor(BODY.y)).r * 0.45
    + textureLod(uNoise, vec3(f / BODY2, 0.67), lodFor(BODY2.y)).r * 0.25;
  float lo = BODY_EDGE.x + 0.35 * (1.0 - cover);
  if (b < lo - FRAY) return 0.0;
  // Fibres: crests of noise stretched about 40 times along the flow (less, and they close
  // into rings), four octaves; they texture the body rather than standing on clear sky.
  float fil = filaments(f, FILAMENT, 0.29) * 0.5
    + filaments(f + 17000.0, FILAMENT * vec2(0.45, 0.45), 0.47) * 0.28
    + filaments(f + 41000.0, FILAMENT * vec2(0.2, 0.2), 0.71) * 0.14
    + filaments(f + 73000.0, FILAMENT * vec2(0.09, 0.09), 0.89) * 0.08;
  fil = clamp(fil * (SHARP + 1.0) / 0.8, 0.0, 2.0); // 1 on average
  // The edges fray: fibres reach out past the body, and gaps between them eat into it.
  float body = smoothstep(lo, lo + BODY_EDGE.y, b + (fil - 1.0) * FRAY);
  float grain = textureLod(uNoise, vec3(f / GRAIN, 0.53), lodFor(GRAIN.y)).g;
  float tex = mix(1.0, fil * mix(0.7, 1.2, grain), FIBRE_CONTRAST);
  // Thin and soft-edged in height.
  float profile = smoothstep(0.0, 0.4, y) * (1.0 - smoothstep(0.6, 1.0, y));
  // Thinnest at the body's edges, so they're translucent and feathered by the fibres.
  // Denser heads where the body noise is well over the threshold: bright, among translucent
  // trails.
  float heads = smoothstep(lo + 0.22, lo + 0.42, b);
  float d = (body * body + 1.5 * heads) * tex * profile;`,
  },
};

// Lays the half-resolution clouds over the scene: scene * light + colour, by blending. With
// an outline, as clouds are drawn on old maps: a fine ink line where the cloud's cover crosses
// OUTLINE_AT, its width held steady on screen. Cover is taken where the cloud adds colour, so the
// shadows (which only darken) aren't outlined.
const OUTLINE_AT = 0.32;
const COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVolume;
uniform float uAlpha, uOutline;
uniform vec3 uInk;
void main() {
  vec4 v = texture(uVolume, vUv);
  vec3 rgb = v.rgb * uAlpha;
  float light = mix(1.0, v.a, uAlpha);
  float cover = (1.0 - v.a) * smoothstep(0.01, 0.06, dot(v.rgb, vec3(0.33)));
  float w = fwidth(cover) * 1.3 + 1e-4;
  float line = (1.0 - smoothstep(0.0, w, abs(cover - ${OUTLINE_AT}))) * uOutline * uAlpha;
  fragColor = vec4(rgb * (1.0 - line) + uInk * line, light * (1.0 - line));
}`;

export function createVolumeClouds({ view, RenderNode, webgl, SpatialReference, kind = "cumulus" }) {
  let P = PRESETS[kind] || PRESETS.cumulus;
  let shaderFor = volumeShader;
  // The noise volume, built off the main thread while the title card is up.
  let noise = null;
  const built = (data) => { noise = data; };
  try {
    const worker = new Worker(new URL("./cloud-noise.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => { built(e.data); worker.terminate(); };
    worker.onerror = () => { built(buildNoise()); worker.terminate(); };
  } catch {
    built(buildNoise());
  }

  // The field's frame (in doubles): its middle on the ground, east, north and up there. Worked
  // out on the first frame, since the view's render coordinates aren't set up before then.
  let E, N, U, O, R, sun;
  let focus = FOCUS;
  const frame = () => {
    const enu = new Array(16);
    webgl.renderCoordinateTransformAt(view, [...focus, 0], SpatialReference.WGS84, enu);
    [E, N, U, O] = [enu.slice(0, 3), enu.slice(4, 7), enu.slice(8, 11), enu.slice(12, 15)];
    R = Math.hypot(...O);
    const rad = Math.PI / 180;
    sun = [0, 1, 2].map((k) => E[k] * Math.sin(SUN_AZ * rad) * Math.cos(SUN_EL * rad)
      + N[k] * Math.cos(SUN_AZ * rad) * Math.cos(SUN_EL * rad) + U[k] * Math.sin(SUN_EL * rad));
  };

  let coverage = P.coverage, alpha = 1, pixelShare = 1;
  // A slightly different sky each time the map opens: the clouds start from a random point
  // near the tuned one, up to 400 km along the jet and 150 km across it. Enough to change
  // every streak and wisp, not so far that the broad masses move out of view (they're ~200 km
  // across). The jet and its patches are fixed to the ground, so they stay put.
  const seedAt = (along, across) => {
    const b = (WIND_BEARING * Math.PI) / 180;
    return [along * Math.sin(b) + across * Math.cos(b), along * Math.cos(b) - across * Math.sin(b)];
  };
  let seed = seedAt((Math.random() - 0.5) * 8e5, (Math.random() - 0.5) * 3e5);
  const wind = [...seed];
  const smooth = (a, b, t) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
  // Same interface as the cirrus (clouds3d.js): place(t) for a point in the flight, 0 to 1.
  const place = (t, { move = true, fade = true } = {}) => {
    if (move) {
      // Carried along the jet.
      const km = P.drift * 1000 * t, b = (WIND_BEARING * Math.PI) / 180;
      wind[0] = seed[0] + km * Math.sin(b);
      wind[1] = seed[1] + km * Math.cos(b);
    }
    if (fade) {
      // Dissolve by thinning: the heaps shrink and break up, rather than going transparent.
      const k = smooth(FADE[0], FADE[1], t);
      coverage = P.coverage * (1 - k);
      alpha = 1 - smooth(0.75, 1, k);
    }
  };
  const start = performance.now();

  const CloudNode = RenderNode.createSubclass({
    consumes: { required: ["final-color"] },
    produces: "final-color",

    // The cloud pass's program, from the preset; remade by __volHot.
    compile(gl) {
      if (this.volume) gl.deleteProgram(this.volume);
      this.volume = this.program(gl, VERT, shaderFor(P));
      const names = ["uNoise", "uRight", "uUp", "uFwd", "uTan", "uEyeF", "uEyeAlt", "uE", "uN", "uU", "uR", "uSun", "uWind", "uCoverage", "uTime", "uPixel"];
      this.vLoc = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(this.volume, n)]));
      this.stale = false;
      if (window.__volHot) window.__volHot.compiled = (window.__volHot.compiled || 0) + 1;
    },

    program(gl, vs, fs) {
      const shader = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    },

    setup(gl) {
      this.compile(gl);
      this.composite = this.program(gl, VERT, COMPOSITE);
      this.cLoc = { uVolume: gl.getUniformLocation(this.composite, "uVolume"), uAlpha: gl.getUniformLocation(this.composite, "uAlpha"), uOutline: gl.getUniformLocation(this.composite, "uOutline"), uInk: gl.getUniformLocation(this.composite, "uInk") };
      this.vao = gl.createVertexArray(); // the full-screen triangle comes from gl_VertexID

      this.noiseTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_3D, this.noiseTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, SIZE, SIZE, SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, noise);
      gl.generateMipmap(gl.TEXTURE_3D);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.REPEAT);
      gl.bindTexture(gl.TEXTURE_3D, null);
      noise = true; // uploaded; let the bytes go

      this.target = gl.createTexture();
      this.fbo = gl.createFramebuffer();
      this.size = [0, 0];
    },

    // The half-resolution texture the clouds are drawn into, remade when the view resizes.
    resize(gl, w, h) {
      if (this.size[0] === w && this.size[1] === h) return;
      this.size = [w, h];
      gl.bindTexture(gl.TEXTURE_2D, this.target);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.target, 0);
    },

    render() {
      const output = this.bindRenderTarget();
      if (alpha <= 0.001 || !noise) return output;
      const gl = this.gl;
      if (!this.volume) { this.setup(gl); frame(); }
      if (this.stale) this.compile(gl);
      const [, , W, H] = gl.getParameter(gl.VIEWPORT);
      // At most ~2.5 million pixels: on a big high-DPI canvas a full-resolution pass came out
      // empty, and it's soft enough that the cap barely shows.
      const k = Math.min(P.scale, Math.sqrt((MAX_PIXELS * pixelShare) / (W * H)));
      const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
      this.resize(gl, w, h);

      // The camera, in doubles: its axes from the view matrix's rows, the eye relative to the
      // field's middle, and its height above the sphere.
      const V = this.camera.viewMatrix, proj = this.camera.projectionMatrix, eye = this.camera.eye;
      const L = this.vLoc;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(this.volume);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_3D, this.noiseTex);
      gl.uniform1i(L.uNoise, 0);
      gl.uniform3f(L.uRight, V[0], V[4], V[8]);
      gl.uniform3f(L.uUp, V[1], V[5], V[9]);
      gl.uniform3f(L.uFwd, -V[2], -V[6], -V[10]);
      gl.uniform2f(L.uTan, 1 / proj[0], 1 / proj[5]);
      gl.uniform3f(L.uEyeF, eye[0] - O[0], eye[1] - O[1], eye[2] - O[2]);
      gl.uniform1f(L.uEyeAlt, Math.hypot(eye[0], eye[1], eye[2]) - R);
      gl.uniform3fv(L.uE, E);
      gl.uniform3fv(L.uN, N);
      gl.uniform3fv(L.uU, U);
      gl.uniform1f(L.uR, R);
      gl.uniform3fv(L.uSun, sun);
      gl.uniform2fv(L.uWind, wind);
      gl.uniform1f(L.uCoverage, coverage);
      gl.uniform1f(L.uPixel, 2 / (proj[5] * h));
      gl.uniform1f(L.uTime, (performance.now() - start) / 1000);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Over the scene: colour + scene * light through, keeping the scene's alpha.
      this.bindRenderTarget();
      gl.viewport(0, 0, W, H);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.SRC_ALPHA, gl.ZERO, gl.ONE);
      gl.useProgram(this.composite);
      gl.bindTexture(gl.TEXTURE_3D, null);
      gl.bindTexture(gl.TEXTURE_2D, this.target);
      gl.uniform1i(this.cLoc.uVolume, 0);
      gl.uniform1f(this.cLoc.uAlpha, alpha * (P.opacity ?? 1));
      // The outline: the map's ink, lightened and cooled so it never reads as a coast.
      gl.uniform1f(this.cLoc.uOutline, P.outline ?? 1);
      gl.uniform3f(this.cLoc.uInk, 0.42, 0.46, 0.54);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(null);
      this.resetWebGLState();
      this.requestRender(); // keep drawing every frame while the clouds are up
      return output;
    },

    dispose() {
      const gl = this.gl;
      if (!gl || !this.volume) return;
      gl.deleteProgram(this.volume);
      gl.deleteProgram(this.composite);
      gl.deleteVertexArray(this.vao);
      gl.deleteTexture(this.noiseTex);
      gl.deleteTexture(this.target);
      gl.deleteFramebuffer(this.fbo);
    },
  });

  const node = new CloudNode({ view });
  if (new URLSearchParams(location.search).has("debug")) {
    window.__volSeed = (along, across) => { seed = seedAt(along, across); place(0); node.requestRender(); };
    window.__volHot = async () => {
      const m = await import(`./volclouds.js?v=${Date.now()}`);
      P = m.PRESETS[kind] || m.PRESETS.cumulus;
      shaderFor = m.volumeShader;
      coverage = P.coverage;
      node.stale = true;
      node.requestRender();
    };
  }
  // Onto the flight path, so the camera passes through the clouds rather than looking down on
  // them: `from` and `to` are the flight's start and end cameras. The layer moves to the camera's
  // height most of the way down (a thin sheet, a couple of km thick) and its field to the ground under
  // the camera there; it casts no shadows from that height. The heights are built into the
  // shader, so its program is made again.
  const fitPath = (from, to) => {
    // Low enough on the way down that the camera reaches it about 5 s into the 8 s flight, well
    // after the title card has gone (by 2.4 s): placed halfway, it was passed at 3.4 s, behind
    // the fading card, and a thin sheet can't be seen from below, so it was all but missed.
    const a = from.position, b = to.position, f = 0.8;
    const z = a.z + (b.z - a.z) * f;
    focus = [a.longitude + (b.longitude - a.longitude) * f, a.latitude + (b.latitude - a.latitude) * f];
    P = { ...P, base: z - 1200, top: z + 1200, shadow: 0 };
    if (E) frame();
    node.stale = true;
    node.requestRender();
  };

  return {
    place,
    fitPath,
    // Lighter: a third of the pixels (the opening asks for this on a slow machine before it
    // gives up on the clouds).
    degrade: () => { pixelShare /= 3; },
    destroy: () => {
      try { node.dispose(); } catch { /* context already gone */ }
      node.destroy();
    },
  };
}
