// The parts of the island that lost their railway, as a scorch on the paper: land that was once
// within reach of a line (SERVED_KM of one open at some time up to the chosen year) but has none
// open within reach that year. Its edge isn't a line but a dissolve, crumbling in by a noise
// pattern over BAND_KM, charred dark at the rim. It burns as the railways vanish, a bit at a time:
// a closing line pulls back along its length (lines3d.js), and the ground beside it catches just
// as its retreating tip passes, the fire spreading out from the old track with glowing embers that
// smoulder and cool to char. Going back in years, the ground recovers as a line regrows past it.
// When the map lands, the scorch burns in the same way, the closures in the order they happened.
//
// Two distance fields on a 1 km grid (to the lines open that year, and to every line opened by
// then), each an exact distance transform of the lines drawn into the grid, give the scorch's
// reach. Drawing it is our own WebGL pass over the finished ground (a RenderNode, like the sea's):
// for each pixel it finds the point on the ground from the depth buffer, looks up the reach there,
// and multiplies the scorch in, so the engraved ink stays dark through it as on burnt paper. The
// sea is drawn after this, so it covers anything off the coast. (A MediaLayer image would have
// been simpler, but it never drew in this scene.)
//
// Lines whose closure isn't recorded count as open until the present day: we can't say when that
// ground was lost.

import { BOX, KM, SERVED_KM, BAND_KM, NX, NY, SPREAD_S, EMBER_S, FADE_MS } from "./lostfield.js";

import { paperTime, atNextStep } from "./paper.js";

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const COMMON = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uColor, uDepth, uReach;   // the scene so far, its depth, the scorch's reach
uniform sampler2D uSmoke;   // the smoke pass's result (the scorch pass reads it)
uniform sampler2D uLand;    // 1 on the land, 0 on the sea and the loughs (a fine mask, as the grid)
uniform mat4 uInvProj, uInvView;
uniform vec4 uBox;          // lon0, lat1 (north), km per degree lon, km per degree lat
uniform vec2 uGrid;         // cells across, down
uniform float uNow, uBand, uOn, uSpread, uSpreadS, uEmberS, uTime;
uniform bool uActive;       // a fire is burning or smouldering: draw the embers and smoke
out vec4 fragColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
// The crumble: a few octaves, in km on the ground, spread to fill 0..1.
float crumble(vec2 km) {
  float n = 0.5 * noise(km / 9.0) + 0.3 * noise(km / 3.6 + 17.0) + 0.2 * noise(km / 1.3 + 41.0);
  return clamp((n - 0.5) * 1.9 + 0.5, 0.0, 1.0);
}

// The point on the ground under a pixel, in km across the grid; false for the sky.
bool groundAt(vec2 uv, out vec2 km) {
  float d = texture(uDepth, uv).r;
  if (d >= 1.0) return false;
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec3 w = (uInvView * vec4(v.xyz / v.w, 1.0)).xyz;
  float lon = degrees(atan(w.y, w.x)), lat = degrees(atan(w.z, length(w.xy)));
  km = vec2((lon - uBox.x) * uBox.z, (uBox.y - lat) * uBox.w);
  return true;
}

// The burn at a point: t > 0 inside the scorch (as a share of the dissolve), and its heat.
void burnAt(vec2 km, out float t, out float heat) {
  vec4 r = texture(uReach, km / uGrid);
  vec2 rg = r.rg;
  // This cell's own clock: r.b is when the rail beside it vanished (or came back), in seconds.
  // From then the scorch spreads out from the track over uSpreadS, uSpread km behind until it's
  // done, then the embers cool over uEmberS. New scorch starts where it runs deepest (along the
  // old line); scorch that's going draws in the same way.
  float lp = clamp((uNow - r.b) / uSpreadS, 0.0, 1.0);
  lp = lp * lp * (3.0 - 2.0 * lp);
  float s = rg.g > rg.r ? max(rg.r, rg.g - (1.0 - lp) * uSpread) : max(rg.g, rg.r - lp * uSpread);
  t = s / uBand - crumble(km);
  float cool = clamp((uNow - r.b - uSpreadS) / uEmberS, 0.0, 1.0);
  float lit = step(r.b, uNow);                       // the fire has reached here
  // Hot while the fire runs, then smouldering as it cools; only where the scorch is changing.
  heat = lit * smoothstep(1.0, 4.0, abs(rg.g - rg.r)) * (1.0 - 0.45 * lp * lp) * (1.0 - cool);
  // Only on the land: the scorch, its rim and embers stop at the water's edge.
  float land = smoothstep(0.35, 0.65, texture(uLand, km / uGrid).r);
  t = mix(-1.0, t, land);
  heat *= land;
}

`;
const FRAG = COMMON + `void main() {
  vec4 base = texture(uColor, vUv);
  fragColor = base;
  vec2 km;
  if (uOn <= 0.0 || !groundAt(vUv, km)) return;
  float t, heat;
  burnAt(km, t, heat);
  vec3 col = base.rgb;
  const float RIM = 0.16;
  if (t > RIM) {
    // The scorch: the paper browned, a little deeper further in.
    vec3 wash = mix(vec3(0.94, 0.87, 0.77), vec3(0.87, 0.76, 0.63), clamp((t - RIM) * 1.2, 0.0, 1.0));
    col *= mix(vec3(1.0), wash, uOn);
  } else if (t > 0.0) {
    // The rim: charred.
    float edge = 1.0 - t / RIM;
    col *= mix(vec3(1.0), mix(vec3(0.62, 0.5, 0.4), vec3(0.28, 0.2, 0.15), edge), uOn);
  } else if (t > -0.12) {
    // Just outside: the paper only toasted.
    float near = 1.0 + t / 0.12;
    col *= mix(vec3(1.0), vec3(0.95, 0.9, 0.84), near * near * uOn);
  }
  // Embers, emitting light (added, not multiplied, so they glow over the ink): a glowing band
  // along the rim, flickering sparks in and just behind it, and a warm halo spilling past the
  // front. Strong while the fire runs, then dying to a few smouldering sparks before they go out.
  if (uActive && heat > 0.0) {
    float rim = smoothstep(-0.06, 0.02, t) * (1.0 - smoothstep(0.1, 0.3, t));
    float flicker = 0.65 + 0.35 * noise(km * 0.9 + vec2(uTime * 2.3, -uTime * 1.7));
    float sparkField = noise(km * 2.2 + vec2(uTime * 0.6, uTime * 0.9)) * noise(km * 5.3 - uTime * 1.3);
    float sparks = pow(clamp(sparkField * 1.6, 0.0, 1.0), 6.0) * smoothstep(-0.1, 0.05, t) * (1.0 - smoothstep(0.25, 0.6, t));
    float halo = smoothstep(-0.35, 0.0, t) * (1.0 - smoothstep(0.0, 0.12, t));
    float hot = heat * (rim * flicker + sparks * 2.5) ;
    vec3 emberCol = mix(vec3(0.9, 0.28, 0.04), vec3(1.0, 0.82, 0.45), clamp(hot * hot, 0.0, 1.0));
    col += emberCol * hot * 1.05 * uOn;
    col += vec3(0.55, 0.2, 0.03) * halo * heat * heat * 0.45 * flicker * uOn;
  }
  // Smoke: faint wisps rising off the burning ground and drifting downwind. Each pixel looks a
  // few steps down the screen for burning ground below it, so the smoke stands above the fire,
  // thinning and breaking up as it climbs; it goes as the embers cool.
  if (!uActive) { fragColor = vec4(col, base.a); return; }
  // From the smoke pass (below), drawn at a quarter of the pixels: it's soft anyway.
  float smoke = texture(uSmoke, vUv).r;
  float wisp = noise(vec2(vUv.x * 55.0 + sin(uTime * 0.7) * 1.5, vUv.y * 38.0 - uTime * 1.6))
             * noise(vec2(vUv.x * 21.0 - uTime * 0.4, vUv.y * 14.0 - uTime * 0.9));
  smoke *= smoothstep(0.05, 0.55, wisp * 1.6);
  // A dark, sooty brown (it was a pale grey at 0.47, 0.44, 0.41 and at most 34%, lost on the paper).
  col = mix(col, vec3(0.28, 0.25, 0.22), clamp(smoke * 1.5, 0.0, 1.0) * 0.48 * uOn);
  fragColor = vec4(col, base.a);
}`;
const SMOKE_FRAG = COMMON + `void main() {
  // Smoke: how much burning ground lies a few steps down the screen from this pixel (so the
  // smoke stands above the fire, thinning as it climbs). Five looks, dithered, at a quarter of
  // the pixels; the scorch pass adds the wisps' fine shape at full resolution.
  float smoke = 0.0, total = 0.0;
  float jitter = hash(vUv * 731.0 + fract(uTime));
  for (int i = 0; i < 5; i++) {
    float fi = (float(i) + jitter) * 2.0;
    float sway = (noise(vec2(vUv.y * 7.0 - uTime * 0.3, fi * 0.7)) - 0.5) * 0.004 * fi;
    vec2 drift = vec2(0.0018 * fi + sway, -0.0085 * fi);
    vec2 kmi;
    float w = 1.0 - fi * 0.08;
    total += w;
    if (!groundAt(vUv + drift, kmi)) continue;
    float ti, hi;
    burnAt(kmi, ti, hi);
    smoke += w * hi * smoothstep(-0.15, 0.1, ti);
  }
  fragColor = vec4(smoke / total, 0.0, 0.0, 1.0);
}`;

// The land, as a mask over the scorch's grid at 0.2 km a pixel: the island's outline filled, the
// loughs cut out again (data/ireland.geojson, data/water.geojson).
async function drawLandMask() {
  const [island, water] = await Promise.all(["data/ireland.geojson", "data/water.geojson"].map((f) => fetch(f).then((r) => r.json())));
  const S = 5; // pixels per grid cell
  const canvas = document.createElement("canvas");
  canvas.width = NX * S; canvas.height = NY * S;
  const ctx = canvas.getContext("2d");
  const fill = (geom, colour) => {
    const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    ctx.beginPath();
    for (const poly of polys) for (const ring of poly) {
      ring.forEach(([lon, lat], i) => ctx[i ? "lineTo" : "moveTo"]((lon - BOX.lon[0]) * KM[0] * S, (BOX.lat[1] - lat) * KM[1] * S));
      ctx.closePath();
    }
    ctx.fillStyle = colour;
    ctx.fill("evenodd");
  };
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  fill(island.geometry || island.features[0].geometry, "#fff");
  for (const f of water.features) if (f.properties.kind === "lake") fill(f.geometry, "#000");
  return canvas;
}

export async function createLostLand({ view, RenderNode, features, presentYear }) {
  let landMask = null;
  drawLandMask().then((c) => { landMask = c; }).catch((err) => console.warn("No land mask for the scorch.", err));
  // The burn: from the reach shown (`from`) to the new one (`to`), each cell on its own clock
  // (`when`, seconds after `base`, a performance.now() time).
  let from = null, to = null, when = null, base = 0, endS = 0, dirty = true;
  // The furthest each cell has ever been shown burnt, this visit (by a burn, or by a jump straight
  // to a year). Ground that has burnt once isn't set alight again when the years come round to it
  // again (a story chapter, a Findings card or play going back over years already seen): it's
  // simply burnt. Only ground burning for the first time, or further than before, gets the fire.
  let seen = null;
  let burning = 0; // cells set burning (or recovering) by the latest change: for checking
  const remember = (reach) => {
    if (!seen || seen.length !== reach.length) seen = new Float32Array(reach.length).fill(-1e9);
    for (let i = 0; i < reach.length; i++) if (reach[i] > seen[i]) seen[i] = reach[i];
  };
  let on = 1, onFrom = 1, onTo = 1, onT0 = 0;
  // window.__burnAt = ms (from the console) holds the burn at that many ms in, to look at it.
  const nowS = () => (typeof window.__burnAt === "number" ? window.__burnAt : performance.now() - base) / 1000;
  const C = 2 * SERVED_KM + BAND_KM;   // as the shader's uSpread
  const KEEP_KM = 0.5;                 // a change of year moving a cell's target less than this doesn't relight it
  // What's shown at `t` seconds: as the shader works it out.
  const shownAt = (t) => {
    if (!from) return to;
    const out = new Float32Array(to.length);
    for (let i = 0; i < out.length; i++) {
      let lp = Math.min(1, Math.max(0, (t - when[i]) / SPREAD_S));
      lp = lp * lp * (3 - 2 * lp);
      out[i] = to[i] > from[i] ? Math.max(from[i], to[i] - (1 - lp) * C) : Math.max(to[i], from[i] - lp * C);
    }
    return out;
  };
  const invView = new Float32Array(16), invProj = new Float32Array(16);

  const invert = (m, out) => {
    // General 4x4 inverse (column-major), in doubles.
    const a = Array.from(m), inv = new Array(16);
    inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
    inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
    inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
    inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
    inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
    inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
    inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
    inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
    inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
    inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
    inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
    inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
    inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
    inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
    inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
    inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
    const det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
    for (let i = 0; i < 16; i++) out[i] = inv[i] / det;
  };

  const worker = new Worker(new URL("./lostland-worker.js", import.meta.url), { type: "module" });
  worker.postMessage({ type: "init", features: features.map((f) => ({ properties: f.properties, geometry: f.geometry })), presentYear });
  let pending = null, inFlight = false, nextId = 0;
  const sendNext = () => {
    if (!pending) return;
    const m = { ...pending, id: ++nextId, now: performance.now() };
    // Plans carry the page's clock times; the worker only reads them.
    if (m.plan) m.plan = m.plan.map((a) => (a ? { from: a.from, to: a.to, start: a.start, dur: a.dur } : null));
    pending = null;
    inFlight = m;
    worker.postMessage(m);
  };
  worker.onmessage = ({ data }) => {
    const sent = inFlight;
    inFlight = false;
    const now = performance.now();
    if (sent.mode === "none" || !data.clock) {
      from = null; to = data.reach; when = null;
      burning = 0;
      remember(to);
    } else {
      // Carry on from wherever the edge has got to (or from nothing, the first time). A cell
      // whose target hardly moved keeps its own burn running (its start, target and clock), so
      // while the years play on, ground that's burning or cooling isn't lit again every year.
      // Only cells whose target really moved start a new burn, from where their edge is now;
      // one already alight carries straight on rather than waiting for a distant line's tip.
      const first = sent.mode === "first";
      const prevFrom = from, prevTo = to, prevWhen = when, shift = (base - now) / 1000;
      const tNow = from ? nowS() : 0, shown = from ? shownAt(tNow) : null;
      const n = data.reach.length;
      from = new Float32Array(n);
      to = data.reach;
      when = new Float32Array(n);
      let last = 0;
      burning = 0;
      for (let i = 0; i < n; i++) {
        const fresh = (data.clock[i] - now) / 1000;
        if (first || !prevTo) { from[i] = first ? -50 : to[i]; when[i] = fresh; }
        else if (prevFrom && Math.abs(to[i] - prevTo[i]) < KEEP_KM) {
          from[i] = prevFrom[i]; when[i] = prevWhen[i] + shift;
        } else {
          from[i] = shown ? shown[i] : prevTo[i];
          const alight = prevFrom && prevWhen[i] <= tNow && tNow < prevWhen[i] + SPREAD_S && prevTo[i] !== prevFrom[i];
          when[i] = alight ? Math.min(fresh, 0) : fresh;
          // Only a first burn gets the fire (more scorch = higher reach). Ground burning no
          // further than it has before, or recovering as the years go back, changes at once,
          // without fire; ground burning further than ever burns from its old limit.
          if (seen) {
            if (to[i] <= seen[i] + KEEP_KM) from[i] = to[i];
            else if (seen[i] > from[i]) from[i] = seen[i];
          }
        }
        if (to[i] !== from[i]) {
          if (when[i] > -SPREAD_S) burning++; // its fire is still to come, or burning now
          if (when[i] > last) last = when[i];
        }
      }
      remember(to);
      base = now;
      endS = last + SPREAD_S + EMBER_S;
    }
    dirty = true;
    node.requestRender();
    sendNext();
  };

  const ScorchNode = RenderNode.createSubclass({
    // Over the ground and everything opaque on it, before the sea and the scene's transparent
    // things, so the sea covers it offshore and the swans fly over it.
    consumes: { required: ["opaque-color"] },
    produces: "opaque-color",

    setup(gl) {
      const shader = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
        return sh;
      };
      const link = (fs) => {
        const pr = gl.createProgram();
        gl.attachShader(pr, shader(gl.VERTEX_SHADER, VERT));
        gl.attachShader(pr, shader(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
        return pr;
      };
      const prog = link(FRAG);
      this.prog = prog;
      this.smokeProg = link(SMOKE_FRAG);
      this.smokeTex = gl.createTexture();
      this.smokeFbo = gl.createFramebuffer();
      this.smokeSize = [0, 0];
      this.loc = Object.fromEntries(["uColor", "uDepth", "uReach", "uInvProj", "uInvView", "uBox", "uGrid", "uNow", "uBand", "uOn", "uSpread", "uSpreadS", "uEmberS", "uTime", "uActive", "uLand", "uSmoke"]
        .map((name) => [name, gl.getUniformLocation(prog, name)]));
      this.smokeLoc = Object.fromEntries(Object.keys(this.loc).map((name) => [name, gl.getUniformLocation(this.smokeProg, name)]));
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const l = gl.getAttribLocation(prog, "aPos");
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      this.tex = gl.createTexture();
      this.floatLinear = !!gl.getExtension("OES_texture_float_linear");
    },

    upload(gl) {
      // The reach before (red) and after (green) the burn, in km, and each cell's clock (blue, s).
      const data = new Float32Array(NX * NY * 4);
      const a = from || to;
      for (let i = 0; i < NX * NY; i++) {
        data[i * 4] = a[i]; data[i * 4 + 1] = to[i]; data[i * 4 + 2] = from ? when[i] : -1000;
      }
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, NX, NY, 0, gl.RGBA, gl.FLOAT, data);
      // 32-bit floats (the clocks need the precision), so smoothed only if the GPU can.
      const filter = this.floatLinear ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      dirty = false;
    },

    render(inputs) {
      const input = inputs.find(({ name }) => name === "opaque-color") || inputs[0];
      const gl = this.gl;
      const now = performance.now();
      on = onFrom + (onTo - onFrom) * Math.min(1, (now - onT0) / FADE_MS);
      if (!to || on <= 0) return input;
      if (!this.prog) this.setup(gl);
      if (dirty) this.upload(gl);
      // The burn, embers and smoke step on the paper beat (paper.js).
      const t = paperTime(nowS() * 1000) / 1000;

      const active = !!from && t < endS;
      const [, , W, H] = gl.getParameter(gl.VIEWPORT);
      invert(this.camera.projectionMatrix, invProj);
      invert(this.camera.viewMatrix, invView);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      if (landMask && !this.landTex) {
        this.landTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.landTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, landMask);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      // The textures both passes read: the scene, its depth, the reach, the land, the smoke.
      const color = input.getTexture(), depth = input.getTexture(gl.DEPTH_STENCIL_ATTACHMENT);
      const bindAll = () => {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, color.glName ?? color._glName);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, depth.glName ?? depth._glName);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.landTex || null);
      };
      const setUniforms = (L) => {
        gl.uniformMatrix4fv(L.uInvProj, false, invProj);
        gl.uniformMatrix4fv(L.uInvView, false, invView);
        gl.uniform4f(L.uBox, BOX.lon[0], BOX.lat[1], KM[0], KM[1]);
        gl.uniform2f(L.uGrid, NX, NY);
        gl.uniform1f(L.uNow, t);
        gl.uniform1i(L.uActive, active ? 1 : 0);
        gl.uniform1f(L.uSpreadS, SPREAD_S);
        gl.uniform1f(L.uEmberS, EMBER_S);
        gl.uniform1f(L.uTime, (paperTime(now) / 1000) % 1000);
        gl.uniform1f(L.uBand, BAND_KM);
        gl.uniform1f(L.uSpread, 2 * SERVED_KM + BAND_KM);
        gl.uniform1f(L.uOn, on);
        gl.uniform1i(L.uColor, 0); gl.uniform1i(L.uDepth, 1); gl.uniform1i(L.uReach, 2); gl.uniform1i(L.uLand, 3); gl.uniform1i(L.uSmoke, 4);
      };
      gl.bindVertexArray(this.vao);

      // While a fire burns or smoulders: the smoke first, into its own image at half the width
      // and height (a quarter of the pixels).
      if (active) {
        const w = Math.max(1, Math.ceil(W / 2)), h = Math.max(1, Math.ceil(H / 2));
        if (this.smokeSize[0] !== w || this.smokeSize[1] !== h) {
          this.smokeSize = [w, h];
          gl.bindTexture(gl.TEXTURE_2D, this.smokeTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.smokeFbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.smokeTex, 0);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.smokeFbo);
        gl.viewport(0, 0, w, h);
        gl.useProgram(this.smokeProg);
        bindAll();
        gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, null);
        setUniforms(this.smokeLoc);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      // Then the scorch over the scene, reading the smoke.
      const output = this.acquireOutputFramebuffer();
      gl.viewport(0, 0, W, H);
      gl.useProgram(this.prog);
      bindAll();
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, active ? this.smokeTex : null);
      setUniforms(this.loc);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      output.attachDepth(input.getAttachment(gl.DEPTH_STENCIL_ATTACHMENT));
      this.resetWebGLState();
      // Keep drawing while it burns, smoulders or fades; then drop the old reach.
      if ((from && t < endS) || (now - onT0) < FADE_MS) nextStep();
      else if (from) { from = null; dirty = true; nextStep(); }
      return output;
    },
  });
  const node = new ScorchNode({ view });
  const nextStep = atNextStep(() => node.requestRender());

  return {
    // Show the year. With `animate`, the ground burns (or recovers) as the lines move: `plan` is
    // lines3d's plan() (each line's animation, just after its setState). The work is done in a
    // worker; if years come faster than it can answer, only the latest is worked out next.
    setYear(year, animate = true, plan = null) {
      const mode = !animate ? "none" : !to && !pending && !inFlight ? "first" : "plan";
      pending = { type: "year", year, mode, plan: mode === "plan" ? plan : null };
      if (!inFlight) sendNext();
    },
    setVisible(visible) {
      onFrom = on; onTo = visible ? 1 : 0; onT0 = performance.now();
      node.requestRender();
    },
    // Still catching up: a year being worked out, or the ground still burning or recovering
    // (the embers' slow cooling afterwards doesn't count).
    // How many cells the latest change set burning or recovering (0 when it was all seen before).
    burning: () => burning,
    busy() {
      return !!pending || !!inFlight || (!!from && nowS() < endS - EMBER_S);
    },
  };
}
