// Railway lines, each animated on its own: a line draws itself along its length when it opens
// and pulls back when it closes. (Trackbeds of closed lines, dashed or dotted, are no longer
// drawn: setState leaves ghost at 0, and the render skips that pass.)
//
// Drawn with our own WebGL (a RenderNode, like the swans and the sea), not as ArcGIS graphics:
// in this scene every change to a draped graphic, however small, made ArcGIS redraw the draped
// overlay, about 65 ms a time, so playback ran at a fraction of the frame rate. Here all the lines
// are uploaded once, split into short segments, and each segment is drawn as a screen-space
// capsule (round caps and joins for free); how much of each line shows, and whether its trackbed
// does, lives in a small texture, so animating costs a few kilobytes of upload. Lines are lifted
// LIFT_M over the terrain (sampled from the scene's ground as it loads) and depth-tested as if
// PULL_M nearer the camera, so they stay over the land while it loads but hills still hide them.
//
// Clicks still open a line's details: each line also has an invisible ArcGIS graphic that never
// changes, used only to find what was clicked.
import { PAPER_MS } from "./paper.js";
import { createTicketPopup } from "./ticketpop.js";

const GROW_MS = 450; // one new line drawing itself end to end
const SHRINK_MS = 500; // one closed line pulling back end to end, the fire close behind it (lostland.js):
// with the ground's SPREAD_S (lostfield.js) the line and its burn are both done in 0.7 s
const STAGGER_MS = 1200; // on a jump across many years, openings and closures play out in order
const FRAME_MS = PAPER_MS; // a new drawing on the paper beat (paper.js), held in between
const KM_PER_DEG = [66.2, 110.6]; // near Ireland: longitude, latitude
const SEG_KM = 1; // segments at most this long, so the lines follow the terrain
const LIFT_M = 60; // over the sampled ground
// Depth is tested as if the lines were this much nearer the camera (metres, plus a share of the
// distance): enough to clear Ireland's terrain while it streams in at coarse detail, so the land
// never draws over them, yet a hill well in front of a line in a tilted view still hides it.
const PULL_M = 1200, PULL_K = 0.02;
const STATE_W = 64; // the state texture's width (lines wrap onto rows)
// Ireland's first railway, the Dublin & Kingstown, opened in December 1834. A section with no
// recorded opening year counts as open from then, so the map before it (1833, where it opens)
// is clean paper.
export const FIRST_RAILWAY_YEAR = 1834;
const PERIOD_MS = 700; // fading between the modern colours and the 1920s symbol
const PERIOD_INK = "#25221d"; // the 1920s symbol's printer's black, a little warm
const PERIOD_PAPER = "#f6efdc"; // and the paper between its bars (lines closed since)

const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const rgb = (hex, k = 1) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255) * k);

const VERT = `#version 300 es
in vec3 aA;      // segment start, render coordinates relative to the origin
in vec3 aB;      // segment end
in vec2 aFrac;   // how far along its line each end is, 0..1
in vec2 aKm;     // km along its line at each end
in float aLine;
uniform mat4 uMV, uProj;
uniform vec2 uViewport;
uniform sampler2D uState;   // per line: r = drawn share, g = trackbed style (0 none, 1 dash, 2 dot), b = colour (0 current, 1 closed since)
uniform int uPass;          // 0 trackbeds, 1 casing, 2 core
uniform float uHalf;        // half the line's width, px
uniform float uPull, uPullK; // depth pull toward the camera: metres, plus this share of the distance
out vec2 vP;
flat out vec2 vA, vB;
flat out vec2 vKm;
flat out float vKmPerPx, vStyle, vColour;

void cull() { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }
void main() {
  int li = int(aLine + 0.5);
  vec4 st = texelFetch(uState, ivec2(li % ${STATE_W}, li / ${STATE_W}), 0);
  vStyle = st.g;
  vColour = st.b;
  vec3 B = aB;
  vec2 km = aKm;
  if (uPass == 0) {
    if (st.g < 0.5) { cull(); return; }
  } else {
    float v = st.r;
    if (v <= aFrac.x + 1e-5) { cull(); return; }
    if (v < aFrac.y) {
      float t = (v - aFrac.x) / max(aFrac.y - aFrac.x, 1e-6);
      B = mix(aA, aB, t);
      km.y = mix(aKm.x, aKm.y, t);
    }
  }
  vec4 ea = uMV * vec4(aA, 1.0), eb = uMV * vec4(B, 1.0);
  vec4 ca = uProj * ea, cb = uProj * eb;
  if (ca.w <= 0.0 || cb.w <= 0.0) { cull(); return; }
  // Depth from each end pulled toward the camera along its sight line (the screen position
  // is unchanged): the lines draw over the landscape as it streams in, and over any terrain
  // finer than the heights they were lifted from, yet a hill well in front still hides them.
  float pa = min(uPull + uPullK * length(ea.xyz), 0.9 * length(ea.xyz));
  float pb = min(uPull + uPullK * length(eb.xyz), 0.9 * length(eb.xyz));
  vec4 za = uProj * vec4(ea.xyz * (1.0 - pa / length(ea.xyz)), 1.0);
  vec4 zb = uProj * vec4(eb.xyz * (1.0 - pb / length(eb.xyz)), 1.0);
  vec2 sa = (ca.xy / ca.w * 0.5 + 0.5) * uViewport, sb = (cb.xy / cb.w * 0.5 + 0.5) * uViewport;
  vec2 d = sb - sa;
  float len = length(d);
  vec2 dir = len > 1e-3 ? d / len : vec2(1.0, 0.0), nrm = vec2(-dir.y, dir.x);
  int id = gl_VertexID;
  float u = float(id & 1), s = float(id >> 1) * 2.0 - 1.0;
  float r = uHalf + 1.5;
  vec2 p = mix(sa, sb, u) + dir * (u * 2.0 - 1.0) * r + nrm * s * r;
  float z = mix(za.z / za.w, zb.z / zb.w, u);
  vP = p; vA = sa; vB = sb; vKm = km;
  vKmPerPx = (km.y - km.x) / max(len, 1e-3);
  gl_Position = vec4(p / uViewport * 2.0 - 1.0, z, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
in vec2 vP;
flat in vec2 vA, vB;
flat in vec2 vKm;
flat in float vKmPerPx, vStyle, vColour;
uniform int uPass;
uniform float uHalf, uAlpha, uDpr;
uniform float uPeriod;      // 0 the today/closed-since colours, 1 the 1920s map symbol
uniform vec3 uCurrent, uClosedSince, uCurrentDark, uClosedSinceDark, uTrackbed, uUndated, uInk, uPaper;
out vec4 fragColor;
void main() {
  vec2 pa = vP - vA, ba = vB - vA;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  float d = length(pa - ba * h);
  float cover = clamp(uHalf + 0.5 - d, 0.0, 1.0);
  if (cover <= 0.0) discard;
  vec3 col;
  if (uPass == 0) {
    // Trackbeds: short dashes for a dated closure, dots for an undated one, in screen px.
    float px = mix(vKm.x, vKm.y, h) / max(abs(vKmPerPx), 1e-9) / uDpr;
    float on = vStyle < 1.5 ? step(fract(px / 8.0), 0.62) : step(fract(px / 4.5), 0.42);
    cover *= on;
    if (cover <= 0.0) discard;
    col = vStyle < 1.5 ? uTrackbed : uUndated;
  } else if (uPass == 1) {
    col = mix(vColour < 0.5 ? uCurrentDark : uClosedSinceDark, uInk, uPeriod);
  } else {
    // The 1920s symbol: inside the ink edges, bars of ink and paper in turn (the Ordnance
    // Survey's main-line railway), counted from the line's start so they don't crawl as it grows.
    float px = mix(vKm.x, vKm.y, h) / max(abs(vKmPerPx), 1e-9) / uDpr;
    float bar = step(0.5, fract(px / 12.0));
    // The bars are the line's colour and the paper in turn: blue for a line still running,
    // red for one since lost.
    vec3 period = mix(uPaper, vColour < 0.5 ? uCurrent : uClosedSince, bar);
    col = mix(vColour < 0.5 ? uCurrent : uClosedSince, period, uPeriod);
  }
  float a = cover * uAlpha;
  fragColor = vec4(col * a, a);
}`;

export function createRailLines({ GraphicsLayer, Graphic, features, colors, popupContent, view, RenderNode, webgl, SpatialReference }) {
  // Invisible copies of the lines, never changed, only for finding what was clicked. Their
  // layer's opacity is the lines' opacity (the opening fades it in).
  const hitLayer = new GraphicsLayer({ title: "Railways" });
  const popupTemplate = {
    // The line's own name where it has one, else the places at its ends (app.js, withNames).
    title: ({ graphic }) => {
      const a = graphic.attributes;
      return a.line_name || (a.from && a.to ? `${a.from} – ${a.to}` : "Railway section");
    },
    content: popupContent,
  };
  const hitSymbol = { type: "simple-line", color: [0, 0, 0, 0.004], width: 7 };

  // Every line: its points (densified), and how far along it each is.
  const lines = features.map((f, index) => {
    const p = f.properties;
    const coords = f.geometry.coordinates;
    const pts = [coords[0]], cum = [0];
    for (let i = 1; i < coords.length; i++) {
      const [a, b] = [coords[i - 1], coords[i]];
      const segKm = Math.hypot((b[0] - a[0]) * KM_PER_DEG[0], (b[1] - a[1]) * KM_PER_DEG[1]);
      const n = Math.max(1, Math.ceil(segKm / SEG_KM));
      for (let k = 1; k <= n; k++) {
        pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
        cum.push(cum[cum.length - 1] + segKm / n);
      }
    }
    hitLayer.add(new Graphic({ geometry: { type: "polyline", paths: [coords], spatialReference: { wkid: 4326 } }, attributes: { ...p, __line: index }, symbol: hitSymbol }));
    return { p, pts, cum, total: cum[cum.length - 1] || 1, value: 0, ghost: 0, anim: null };
  });

  // ---- Per-line state: drawn share, trackbed style, colour ----
  const rows = Math.ceil(lines.length / STATE_W);
  const state = new Float32Array(STATE_W * rows * 4);
  lines.forEach((l, i) => { state[i * 4 + 2] = l.p.status === "current" ? 0 : 1; });
  let stateDirty = true;
  lines.forEach((l, i) => { l.i = i; });
  const drawFast = (l) => {
    state[l.i * 4] = l.value;
    state[l.i * 4 + 1] = l.ghost;
    stateDirty = true;
  };

  // ---- Segments, with positions from the ground under them ----
  const segCount = lines.reduce((n, l) => n + l.pts.length - 1, 0);
  const lonlat = new Float64Array(lines.reduce((n, l) => n + l.pts.length, 0) * 3);
  {
    let k = 0;
    for (const l of lines) for (const [lon, lat] of l.pts) { lonlat[k++] = lon; lonlat[k++] = lat; lonlat[k++] = LIFT_M; }
  }
  const world = new Float64Array(lonlat.length);
  const inst = new Float32Array(segCount * 11);
  let origin = null, geometryDirty = true;
  const build = () => {
    webgl.toRenderCoordinates(view, lonlat, 0, SpatialReference.WGS84, world, 0, lonlat.length / 3);
    if (!origin) { const m = Math.floor(lonlat.length / 6) * 3; origin = [world[m], world[m + 1], world[m + 2]]; }
    let v = 0, s = 0;
    for (const l of lines) {
      for (let i = 1; i < l.pts.length; i++) {
        const a = (v + i - 1) * 3, b = (v + i) * 3, o = s * 11;
        inst[o] = world[a] - origin[0]; inst[o + 1] = world[a + 1] - origin[1]; inst[o + 2] = world[a + 2] - origin[2];
        inst[o + 3] = world[b] - origin[0]; inst[o + 4] = world[b + 1] - origin[1]; inst[o + 5] = world[b + 2] - origin[2];
        inst[o + 6] = l.cum[i - 1] / l.total; inst[o + 7] = l.cum[i] / l.total;
        inst[o + 8] = l.cum[i - 1]; inst[o + 9] = l.cum[i];
        inst[o + 10] = l.i;
        s++;
      }
      v += l.pts.length;
    }
    geometryDirty = true;
  };
  // Heights from the scene's ground, once it has one, and again as finer terrain loads.
  const MERC = 20037508.342789244;
  const resample = () => {
    const sampler = view.groundView?.elevationSampler;
    if (!sampler) return false;
    const merc = sampler.spatialReference?.isWebMercator;
    for (let k = 0; k < lonlat.length; k += 3) {
      const lon = lonlat[k], lat = lonlat[k + 1];
      let z = 0;
      if (merc) {
        z = sampler.elevationAt((lon * MERC) / 180, (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * MERC) / Math.PI) ?? 0;
      } else {
        z = sampler.elevationAt(lon, lat) ?? 0;
      }
      lonlat[k + 2] = Math.max(0, z) + LIFT_M;
    }
    build();
    node.requestRender();
    return true;
  };
  let lastSample = 0, sampleTimer = null;
  const sampleSoon = () => {
    if (sampleTimer) return;
    sampleTimer = setTimeout(() => { sampleTimer = null; lastSample = performance.now(); resample(); }, Math.max(0, 2000 - (performance.now() - lastSample)));
  };
  // Only when the ground's heights change (its sampler's "changed" event), not every time the
  // scene finishes updating: during year playback that was every step, with the terrain the same.
  let watchedSampler = null;
  view.watch("updating", (busy) => {
    if (busy || !view.map.ground?.layers?.length) return;
    const sampler = view.groundView?.elevationSampler;
    if (sampler && typeof sampler.on === "function") {
      if (sampler === watchedSampler) return;
      watchedSampler = sampler;
      sampler.on("changed", sampleSoon);
    }
    sampleSoon();
  });

  const cur = rgb(colors.current), since = rgb(colors.open_then);
  const mv = new Float32Array(16);
  const LineNode = RenderNode.createSubclass({
    // With the ground and everything opaque, before the scorch (lostland.js), which browns them
    // as it did the draped lines, and before the sea and swans.
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
      this.loc = Object.fromEntries(["uMV", "uProj", "uViewport", "uState", "uPass", "uHalf", "uAlpha", "uDpr",
        "uCurrent", "uClosedSince", "uCurrentDark", "uClosedSinceDark", "uTrackbed", "uUndated", "uPeriod", "uInk", "uPaper", "uPull", "uPullK"].map((n) => [n, gl.getUniformLocation(prog, n)]));
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      this.buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferData(gl.ARRAY_BUFFER, inst.byteLength, gl.DYNAMIC_DRAW);
      const attr = (name, size, offset) => {
        const l = gl.getAttribLocation(prog, name);
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l, size, gl.FLOAT, false, 44, offset * 4);
        gl.vertexAttribDivisor(l, 1);
      };
      attr("aA", 3, 0); attr("aB", 3, 3); attr("aFrac", 2, 6); attr("aKm", 2, 8); attr("aLine", 1, 10);
      gl.bindVertexArray(null);
      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    },
    render() {
      const output = this.bindRenderTarget();
      const alpha = hitLayer.opacity * (hitLayer.visible ? 1 : 0);
      if (alpha <= 0) return output;
      const gl = this.gl;
      if (!this.prog) this.setup(gl);
      if (!origin) build();
      if (geometryDirty) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst);
        geometryDirty = false;
      }
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      if (stateDirty) {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, STATE_W, rows, 0, gl.RGBA, gl.FLOAT, state);
        stateDirty = false;
      }
      const V = this.camera.viewMatrix;
      for (let i = 0; i < 12; i++) mv[i] = V[i];
      for (let r = 0; r < 3; r++) mv[12 + r] = V[r] * origin[0] + V[4 + r] * origin[1] + V[8 + r] * origin[2] + V[12 + r];
      mv[15] = 1;
      const [, , w, h] = gl.getParameter(gl.VIEWPORT);
      const L = this.loc;
      gl.useProgram(this.prog);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix4fv(L.uMV, false, mv);
      gl.uniformMatrix4fv(L.uProj, false, this.camera.projectionMatrix);
      gl.uniform2f(L.uViewport, w, h);
      gl.uniform1f(L.uAlpha, alpha);
      const dpr = this.camera.pixelRatio || window.devicePixelRatio || 1;
      gl.uniform1f(L.uDpr, dpr);
      gl.uniform3fv(L.uCurrent, cur);
      gl.uniform3fv(L.uClosedSince, since);
      gl.uniform3fv(L.uCurrentDark, cur.map((c) => c * 0.58));
      gl.uniform3fv(L.uClosedSinceDark, since.map((c) => c * 0.58));
      gl.uniform3fv(L.uTrackbed, rgb(colors.closed));
      gl.uniform3fv(L.uUndated, rgb(colors.unknown));
      gl.uniform1f(L.uPeriod, period);
      gl.uniform3fv(L.uInk, rgb(PERIOD_INK));
      gl.uniform3fv(L.uPaper, rgb(PERIOD_PAPER));
      gl.uniform1f(L.uPull, PULL_M);
      gl.uniform1f(L.uPullK, PULL_K);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(L.uState, 0);
      gl.bindVertexArray(this.vao);
      // Widths in points: trackbeds 1.5, casing 3.1, core 1.8; in the 1920s style a finer
      // engraved line, casing 2.6 around a 1.4 core of bars.
      const pt = (x) => (x * 4) / 3 * dpr / 2;
      const lerp = (a, b) => a + (b - a) * period;
      for (const [pass, half] of [[1, pt(lerp(3.1, 2.6))], [2, pt(lerp(1.8, 1.4))]]) {
        gl.uniform1i(L.uPass, pass);
        gl.uniform1f(L.uHalf, half);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, segCount);
      }
      gl.bindVertexArray(null);
      this.resetWebGLState();
      return output;
    },
  });
  const node = new LineNode({ view });
  const ticketPop = createTicketPopup(view);
  hitLayer.watch(["opacity", "visible"], () => node.requestRender());

  // A click on a line that's showing (drawn, or its trackbed) opens its details.
  view.on("click", async (event) => {
    const hit = await view.hitTest(event, { include: [hitLayer] });
    const g = hit.results.map((r) => r.graphic).find((gr) => {
      const l = lines[gr.attributes.__line];
      return l && (l.value > 0.02 || l.ghost > 0);
    });
    if (!g) { ticketPop.hide(); return; }
    // As a ticket alone, with no ArcGIS popup frame (ticketpop.js).
    ticketPop.show(popupContent({ graphic: g }), event.mapPoint, g.geometry);
  });

  const animating = new Set();
  let year = null;

  // The 1920s style: 0..1, faded over PERIOD_MS when switched (stepped on the paper beat in tick).
  let period = 0, periodAnim = null;
  const setPeriod = (on, animate = true) => {
    const to = on ? 1 : 0;
    if (!animate) { period = to; periodAnim = null; node.requestRender(); return; }
    if ((periodAnim ? periodAnim.to : period) === to) return;
    periodAnim = { from: period, to, start: performance.now() };
  };

  const setState = ({ year: nextYear, animate = true }) => {
    const from = year ?? nextYear;
    const span = nextYear - from;
    const now = performance.now();
    year = nextYear;
    for (const l of lines) {
      const { opened_year: o, closed_year: c, status } = l.p;
      const opened = o ? o <= nextYear : nextYear >= FIRST_RAILWAY_YEAR;
      const closed = status !== "current" && c && c <= nextYear;
      const undated = status !== "current" && !c;
      // No trackbed is left behind: a closed or undated line simply isn't drawn.
      const ghost = 0;
      if (ghost !== l.ghost) { l.ghost = ghost; drawFast(l); }

      const target = opened && !closed && !undated ? 1 : 0;
      const heading = l.anim ? l.anim.to : l.value;
      if (target === heading) continue;
      if (!animate) {
        l.value = target;
        l.anim = null;
        animating.delete(l);
        drawFast(l);
        continue;
      }
      // The year this line changed in: its closure if that's what we crossed, else its opening.
      const event = c && (c - from) * (c - nextYear) <= 0 ? c : o || from;
      const order = Math.abs(span) > 2 ? Math.min(1, Math.max(0, (event - from) / span)) : 0;
      l.anim = {
        from: l.value,
        to: target,
        start: now + order * STAGGER_MS,
        dur: (target > l.value ? GROW_MS : SHRINK_MS) * Math.max(0.35, Math.abs(target - l.value)),
      };
      animating.add(l);
    }
    node.requestRender();
  };

  // One step per paper beat (paper.js): every moving line takes its new length, held between.
  let lastFrame = 0;
  const tick = (now) => {
    if ((!animating.size && !periodAnim) || now - lastFrame < FRAME_MS) return;
    lastFrame = now;
    if (periodAnim) {
      const t = Math.min(1, (now - periodAnim.start) / PERIOD_MS);
      period = periodAnim.from + (periodAnim.to - periodAnim.from) * easeInOut(t);
      if (t === 1) periodAnim = null;
    }
    for (const l of animating) {
      const a = l.anim;
      const k = (now - a.start) / a.dur;
      if (k < 0) continue;
      const t = Math.min(1, k);
      l.value = a.from + (a.to - a.from) * easeInOut(t);
      if (t === 1) {
        l.value = a.to;
        l.anim = null;
        animating.delete(l);
      }
      drawFast(l);
    }
    node.requestRender();
  };

  // Each line's animation as last set (in feature order): { from, to, start, dur } in
  // performance.now() ms, its tip moving along it with easeInOut; null if it isn't moving. The
  // lost-railway scorch (lostland.js) burns along behind a closing line's retreating tip.
  const plan = () => lines.map((l) => l.anim);
  // Still moving: any line still drawing itself in or pulling back.
  const busy = () => animating.size > 0;
  return { layers: [hitLayer], setState, setPeriod, tick, plan, easeInOut, busy };
}
