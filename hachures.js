// Hills and mountains engraved as the 1920 railway map shows them: hachures (data/hachures.json,
// from scripts/make-hachures.mjs), short strokes down the slope, heavier where it's steeper; and
// the principal peaks named in italic. Each weight is one graphic of many strokes, so the whole
// relief is one batch of strokes. Drawn with our own WebGL (a RenderNode, like the railway
// lines), so they're there from the first frame of the opening: as a draped layer they had to be
// redrawn into the ground for every tile as the camera zoomed, which made the flight stutter, so
// they used to wait until it had landed.

// Light: they shade the hills without competing with the railways.
import { nameLayer } from "./counties.js";

// Light: they shade the hills without competing with the railways (a little lighter again since
// they've been drawn on the GPU, which packs them closer when zoomed out; see uDense).
const INK = { steep: [92, 84, 72, 0.32], gentle: [110, 102, 90, 0.17] };
const WIDTH = { steep: 0.65, gentle: 0.5 };

// Named on the old map, in italic beside their hachures (lon, lat: the summit).
const PEAKS = [
  ["Carrauntoohil", -9.743, 51.999], ["Errigal", -8.113, 55.034], ["Slieve Donard", -5.921, 54.18],
  ["Lugnaquilla", -6.464, 52.967], ["Mweelrea", -9.83, 53.637], ["Galtymore", -8.177, 52.366],
  ["Nephin", -9.367, 54.013], ["Croagh Patrick", -9.659, 53.76], ["Sawel Mt.", -7.04, 54.818],
  ["Knockmealdown", -7.917, 52.229], ["Benbaun", -9.833, 53.519], ["Muckish", -7.995, 55.105],
];

const VERT = `#version 300 es
in vec3 aA;
in vec3 aB;
in float aSteep;
in float aIsle;          // 0 Ireland, 1 Britain
uniform mat4 uMV, uProj;
uniform vec2 uViewport;
uniform vec2 uHalf;      // half widths, px: gentle, steep
uniform float uAlpha;
uniform float uBritain;   // Britain's strokes fade with Britain in the opening
uniform float uDpr;
out vec2 vP;
flat out vec2 vA, vB;
flat out float vHalf, vSteep, vIsle;
void main() {
  vSteep = aSteep;
  vIsle = aIsle < 0.5 ? 1.0 : uBritain;
  vHalf = aSteep > 0.5 ? uHalf.y : uHalf.x;
  vec4 ca = uProj * (uMV * vec4(aA, 1.0)), cb = uProj * (uMV * vec4(aB, 1.0));
  if (uAlpha * vIsle <= 0.0 || ca.w <= 0.0 || cb.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 sa = (ca.xy / ca.w * 0.5 + 0.5) * uViewport, sb = (cb.xy / cb.w * 0.5 + 0.5) * uViewport;
  vec2 d = sb - sa;
  float len = length(d);
  vec2 dir = len > 1e-3 ? d / len : vec2(1.0, 0.0), nrm = vec2(-dir.y, dir.x);
  // Zoomed out, the strokes pack closer on screen and darken the hills into blots: fade them
  // as they shrink (screen pixels per km of ground), as the draped strokes used to thin away.
  float pxPerKm = len / uDpr / max(length(aB - aA) / 1000.0, 1e-3);
  vIsle *= mix(0.4, 1.0, smoothstep(1.0, 6.0, pxPerKm));
  float u = float(gl_VertexID & 1), s = float(gl_VertexID >> 1) * 2.0 - 1.0;
  float r = vHalf + 1.5;
  vec2 p = mix(sa, sb, u) + dir * (u * 2.0 - 1.0) * r + nrm * s * r;
  vP = p; vA = sa; vB = sb;
  gl_Position = vec4(p / uViewport * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vP;
flat in vec2 vA, vB;
flat in float vHalf, vSteep, vIsle;
uniform vec4 uGentle, uSteep;   // colour (rgb) and alpha
uniform float uAlpha;
out vec4 fragColor;
void main() {
  vec2 pa = vP - vA, ba = vB - vA;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  // Thinner than a pixel draws fainter rather than vanishing.
  float w = max(vHalf, 0.5);
  float cover = clamp(w + 0.5 - length(pa - ba * h), 0.0, 1.0) * min(1.0, vHalf / 0.5);
  vec4 c = vSteep > 0.5 ? uSteep : uGentle;
  float a = cover * c.a * uAlpha * vIsle;
  if (a <= 0.002) discard;
  fragColor = vec4(c.rgb * a, a);
}`;

export async function createRelief({ GraphicsLayer, FeatureLayer, Graphic, view, RenderNode, webgl, SpatialReference }) {
  // The pass is made at once, so it draws before (under) the railway lines and the rest made
  // later; its strokes arrive when the data has loaded.
  let britainAlpha = 1;
  let paths = null, segCount = 0, lonlat = null, world = null, inst = null, origin = null, dirty = true;
  // The layer is empty: its opacity and visibility are the strokes' (as with the railway lines).
  const strokes = new GraphicsLayer({ title: "Hachures", listMode: "hide" });
  const rgba = (c) => [c[0] / 255, c[1] / 255, c[2] / 255, c[3]];
  const mv = new Float32Array(16);
  const HachureNode = RenderNode.createSubclass({
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
      const prog = gl.createProgram();
      gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      this.prog = prog;
      this.loc = Object.fromEntries(["uMV", "uProj", "uViewport", "uHalf", "uAlpha", "uGentle", "uSteep", "uBritain", "uDpr"].map((n) => [n, gl.getUniformLocation(prog, n)]));
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      this.buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferData(gl.ARRAY_BUFFER, inst.byteLength, gl.DYNAMIC_DRAW);
      const attr = (name, size, offset) => {
        const l = gl.getAttribLocation(prog, name);
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l, size, gl.FLOAT, false, 32, offset * 4);
        gl.vertexAttribDivisor(l, 1);
      };
      attr("aA", 3, 0); attr("aB", 3, 3); attr("aSteep", 1, 6); attr("aIsle", 1, 7);
      gl.bindVertexArray(null);
    },
    render() {
      const output = this.bindRenderTarget();
      const alpha = strokes.visible ? strokes.opacity : 0;
      if (alpha <= 0 || !inst) return output;
      const gl = this.gl;
      if (!this.prog) this.setup(gl);
      if (!origin) build();
      if (dirty) { gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst); dirty = false; }
      const V = this.camera.viewMatrix;
      for (let i = 0; i < 12; i++) mv[i] = V[i];
      for (let r = 0; r < 3; r++) mv[12 + r] = V[r] * origin[0] + V[4 + r] * origin[1] + V[8 + r] * origin[2] + V[12 + r];
      mv[15] = 1;
      const [, , w, h] = gl.getParameter(gl.VIEWPORT);
      const dpr = this.camera.pixelRatio || window.devicePixelRatio || 1;
      const pt = (x) => ((x * 4) / 3) * dpr / 2;   // a width in points, as half a width in pixels
      const L = this.loc;
      gl.useProgram(this.prog);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix4fv(L.uMV, false, mv);
      gl.uniformMatrix4fv(L.uProj, false, this.camera.projectionMatrix);
      gl.uniform2f(L.uViewport, w, h);
      gl.uniform2f(L.uHalf, pt(WIDTH.gentle), pt(WIDTH.steep));
      gl.uniform1f(L.uAlpha, alpha);
      gl.uniform1f(L.uBritain, britainAlpha);
      gl.uniform1f(L.uDpr, dpr);
      gl.uniform4fv(L.uGentle, rgba(INK.gentle));
      gl.uniform4fv(L.uSteep, rgba(INK.steep));
      gl.bindVertexArray(this.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, segCount);
      gl.bindVertexArray(null);
      this.resetWebGLState();
      return output;
    },
  });
  const node = new HachureNode({ view });
  strokes.watch(["opacity", "visible"], () => node.requestRender());


  // Ireland's, and Britain's for the opening (scripts/make-hachures.mjs britain); Britain's are
  // optional.
  const load = async (file) => { const r = await fetch(file); if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`); return r.json(); };
  const [data, britainData] = await Promise.all([
    load("data/hachures.json"),
    load("data/hachures-britain.json").catch((err) => { console.warn("No hachures for Britain.", err); return null; }),
  ]);
  // Each stroke is its first point, then steps from the last, in 1/10,000 degree.
  const decode = (stroke) => {
    const path = [];
    let x = 0, y = 0;
    for (let i = 0; i < stroke.length; i += 2) { x += stroke[i]; y += stroke[i + 1]; path.push([x / 1e4, y / 1e4]); }
    return path;
  };
  const strokesOf = (d, isle) => (d ? [...d.gentle.map((st) => [decode(st), 0, isle]), ...d.steep.map((st) => [decode(st), 1, isle])] : []);
  paths = [...strokesOf(data, 0), ...strokesOf(britainData, 1)];
  segCount = paths.reduce((n, [pts]) => n + pts.length - 1, 0);
  lonlat = new Float64Array(paths.reduce((n, [pts]) => n + pts.length, 0) * 3);
  // Which island each point is on (1 = Britain), so Britain's can be skipped once it's gone.
  const pointIsle = new Uint8Array(lonlat.length / 3);
  { let k = 0, q = 0; for (const [pts, , isle] of paths) for (const [lon, lat] of pts) { lonlat[k++] = lon; lonlat[k++] = lat; lonlat[k++] = 0; pointIsle[q++] = isle; } }
  world = new Float64Array(lonlat.length);
  inst = new Float32Array(segCount * 8);
  const build = () => {
    webgl.toRenderCoordinates(view, lonlat, 0, SpatialReference.WGS84, world, 0, lonlat.length / 3);
    if (!origin) origin = [world[0], world[1], world[2]];
    let v = 0, s = 0;
    for (const [pts, steep, isle] of paths) {
      for (let i = 1; i < pts.length; i++) {
        const a = (v + i - 1) * 3, b = (v + i) * 3, o = s * 8;
        for (let c = 0; c < 3; c++) { inst[o + c] = world[a + c] - origin[c]; inst[o + 3 + c] = world[b + c] - origin[c]; }
        inst[o + 6] = steep;
        inst[o + 7] = isle;
        s++;
      }
      v += pts.length;
    }
    dirty = true;
  };
  node.requestRender();
  // On the terrain once the scene has one (the opening flies without it), from its ground as
  // it loads, as the railway lines are (lines3d.js).
  const MERC = 20037508.342789244;
  let lastSample = 0, timer = null;
  const resample = () => {
    const sampler = view.groundView?.elevationSampler;
    if (!sampler) return;
    const merc = sampler.spatialReference?.isWebMercator;
    const skipBritain = britainAlpha <= 0; // gone under the sea: its strokes aren't drawn
    for (let k = 0; k < lonlat.length; k += 3) {
      if (skipBritain && pointIsle[k / 3]) continue;
      const lon = lonlat[k], lat = lonlat[k + 1];
      const z = merc
        ? sampler.elevationAt((lon * MERC) / 180, (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * MERC) / Math.PI)
        : sampler.elevationAt(lon, lat);
      lonlat[k + 2] = Math.max(0, z ?? 0) + 20;
    }
    build();
    node.requestRender();
  };
  // Re-sampled only when the ground's heights change (finer terrain loading in), at most every
  // 3 s: re-sampling every stroke costs ~260 ms, and it used to run whenever the scene finished
  // updating, which during year playback was every step's graphics, with the terrain unchanged.
  const sampleSoon = () => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; lastSample = performance.now(); resample(); }, Math.max(0, 3000 - (performance.now() - lastSample)));
  };
  let watchedSampler = null;
  view.watch("updating", (busy) => {
    if (busy || !view.map.ground?.layers?.length) return;
    const sampler = view.groundView?.elevationSampler;
    if (sampler && typeof sampler.on === "function") {
      if (sampler === watchedSampler) return; // its "changed" event brings any new heights
      watchedSampler = sampler;
      sampler.on("changed", sampleSoon);
    }
    sampleSoon(); // first time with this ground (or no change event to listen to)
  });

  // Labels, like the county names, so a peak's name gives way to a town's rather than covering it.
  const names = nameLayer({ FeatureLayer, Graphic }, "Peaks", PEAKS, {
    type: "text", size: 9,
    material: { color: [44, 40, 34, 0.95] },
    font: { family: "Libre Caslon Text", style: "italic", weight: "normal" },
    // A solid paper halo clears the hachures under the name, as the engraver left a gap.
    halo: { color: [245, 241, 227, 1], size: 2 },
  // Named only closer in: at the home view they'd compete with the towns, as the old sheet's small
  // hill names never do.
  }, { labelPlacement: "below-center", minScale: 1000000 });
  // How much of Britain's hachures show (the opening fades them out with Britain).
  const setBritain = (a) => { britainAlpha = a; node.requestRender(); };
  return { strokes, names, setBritain };
}
