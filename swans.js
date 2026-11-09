// Four 3D swans flying across Ireland in a V: the Children of Lir. In the legend the four
// children of Lir were turned into swans and spent 900 years in exile on Ireland's waters.
// They cross the view from the upper left to the lower right, then come round again.
//
// Drawn with our own WebGL inside the scene (an ArcGIS RenderNode), like the clouds and the
// sea. They're folded paper: an origami swan of a few flat facets, inked along every edge so the
// outline and the folds show (buildMesh). The body is fixed; the wings are animated in the vertex shader: each
// wing vertex knows only which side it's on, how far out along the wing it sits and which edge
// it's on, and the shader bends an inner arm and an outer hand from the wingbeat's phase every
// frame. So the beat is smooth at any frame rate, and nothing is handed to ArcGIS per frame.
// (It used to be eight posed GLB models per swan, swapped and moved as graphics: ArcGIS
// reprocessed each move, ~4 ms of every frame, and the beat stepped through eight poses.)
import { paperTime, atNextStep } from "./paper.js";
import { createTicketPopup } from "./ticketpop.js";

const CROSS_MS = 45000; // the on-screen part of one crossing (the whole flight is longer, at the same speed)
const FLAP_MS = 600; // one wingbeat (~1.7 a second; real swans are a bit quicker, but at this size faster looks frantic)
const WINGSPAN_M = 14000; // giant, so they read at country scale
const ALTITUDE = 9000; // metres
// Where the crossing runs on screen: in at the left edge this far down, and out through the
// bottom edge (or the right, if the panel sits along the bottom), clear of the panel by BARRIER_PX.
const IN_Y = 0.3;
const OUT_X = 0.85; // how far across the space left of the panel they leave the bottom edge
const BARRIER_PX = 40; // the panel's no-fly margin
const EDGE_PX = 60; // start and finish this far beyond the page's edges (plus the formation)
// Fallback if the view can't be measured: Erris to Wexford.
const FALLBACK = [[-10.9, 54.6], [-5.8, 51.9]];
// The V: metres behind the leader and to its side, and each one's place in the wingbeat.
const FORMATION = [[0, 0, 0], [-13000, -12000, 0.25], [-13000, 12000, 0.5], [-26000, 24000, 0.75]];
const KM_PER_DEG = [66.2, 110.6]; // near Ireland: longitude, latitude
const CLICK_PX = 40; // how close a click has to land to a swan to open its story

// Light, as the clouds and sea have it: the sun in the west-south-west, 35 degrees up, and
// shadows thrown east-north-east (clouds3d.js).
const SUN_DIR = (() => { const b = (240 * Math.PI) / 180, e = (35 * Math.PI) / 180; return [Math.sin(b) * Math.cos(e), Math.cos(b) * Math.cos(e), Math.sin(e)]; })();
const SHADOW_DIR = [Math.sin((60 * Math.PI) / 180), Math.cos((60 * Math.PI) / 180)];
const SHADOW_REACH = ALTITUDE / Math.tan((35 * Math.PI) / 180);
const SHADOW = { color: [0.2, 0.27, 0.4], alpha: 0.2, across: 0.36, along: 0.2 }; // half-axes, as shares of the wingspan

const COLORS = {
  paper: [0.97, 0.95, 0.9], // one sheet of cream paper, folded
};
const INK = [0.15, 0.14, 0.12]; // the outline and fold lines, in the map's ink
const LINE_PX = 1.3; // their width on screen

// Model space: x = right wing, y = up, z = forward (beak); about 2.9 units from tip to tip.
// The wing's shape, shared by the mesh and the shader: an inner arm and an outer hand.
const WING = { root: 0.14, rise: 0.07, arm: 0.62, hand: 0.72 };
const MODEL_SPAN = 2 * (WING.root + WING.arm + WING.hand);

// An origami swan: a handful of flat facets, as if folded from one sheet, each edge inked so
// the outline and the folds show. Each vertex: position (3), wing (side, along 0..1, edge z;
// side 0 = body) (3), colour (3), and its corner of the facet (3) for the ink lines.
const FLOATS = 12;
function buildMesh() {
  const out = [];
  const CORNERS = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  // A facet. `hide` lists corners (0, 1, 2) whose opposite edge isn't a fold or an outline
  // (the diagonal splitting a flat panel in two): lifting that corner's coordinate everywhere
  // keeps it from reaching 0, so no line is drawn there.
  const facet = (color, pts, wings, hide = []) => {
    pts.forEach((p, k) => {
      const c = CORNERS[k].map((v, j) => v + (hide.includes(j) ? 1 : 0));
      out.push(...p, ...(wings ? wings[k] : [0, 0, 0]), ...COLORS[color], ...c);
    });
  };
  const tri = (a, b, c) => facet("paper", [a, b, c]);
  // A flat four-sided panel: two triangles with the diagonal between them hidden.
  const panel = (a, b, c, d) => { facet("paper", [a, b, c], null, [1]); facet("paper", [a, c, d], null, [2]); };

  // Body: a folded diamond, ridged along the back and keeled underneath, the tail turned up.
  const F = [0, 0.03, 0.42], T = [0, 0.16, -0.78], L = [-0.21, 0, -0.08], R = [0.21, 0, -0.08];
  const TOP = [0, 0.16, -0.06], KEEL = [0, -0.13, -0.06];
  tri(F, TOP, L); tri(F, R, TOP); tri(T, L, TOP); tri(T, TOP, R);
  tri(F, L, KEEL); tri(F, KEEL, R); tri(T, KEEL, L); tri(T, R, KEEL);

  // Neck: a strip folded along its top edge, reaching forward and a little up.
  const n0 = [0, 0.1, 0.38], n1 = [0, 0.2, 1.0];
  const n0l = [-0.055, -0.01, 0.4], n0r = [0.055, -0.01, 0.4], n1l = [-0.04, 0.12, 1.0], n1r = [0.04, 0.12, 1.0];
  panel(n0, n1, n1l, n0l); panel(n0r, n1r, n1, n0);
  // Head: three facets closing to the point of the beak, tipped down.
  const BEAK = [0, 0.1, 1.42];
  tri(n1, BEAK, n1l); tri(n1r, BEAK, n1); tri(n1l, BEAK, n1r);

  // Wings: each one two flat panels, the inner arm and the outer hand, creased where the shader
  // bends them, and running to a point. The shader places their corners every frame.
  const lead = (u) => 0.22 - 0.16 * u, trail = (u) => -0.42 + 0.44 * u;
  const crease = WING.arm / (WING.arm + WING.hand);
  for (const side of [-1, 1]) {
    for (const [u0, u1] of [[0, crease], [crease, 1]]) {
      const w = (u, isLead) => [side, u, isLead ? lead(u) : trail(u)];
      facet("paper", [[0, 0, 0], [0, 0, 0], [0, 0, 0]], [w(u0, true), w(u1, true), w(u1, false)], [1]);
      facet("paper", [[0, 0, 0], [0, 0, 0], [0, 0, 0]], [w(u0, true), w(u1, false), w(u0, false)], [2]);
    }
  }
  return new Float32Array(out);
}

const VERT = `#version 300 es
in vec3 aPos;
in vec3 aWing;     // side (-1, 1; 0 = body), along the wing (0..1), edge z
in vec3 aColor;
in vec3 aCorner;   // its corner of the facet, for the ink lines
in vec3 aCenter;   // per swan, in view space: where it is,
in vec3 aRight;    // and its right, up and forward, scaled to metres
in vec3 aUp;
in vec3 aFwd;
in float aBeat;    // where it is in the wingbeat, 0..1
uniform mat4 uProj;
out vec3 vView;
out vec3 vColor;
out vec3 vCorner;
const float ROOT = ${WING.root.toFixed(3)}, RISE = ${WING.rise.toFixed(3)}, ARM = ${WING.arm.toFixed(3)}, HAND = ${WING.hand.toFixed(3)};

void main() {
  vec3 p = aPos;
  if (aWing.x != 0.0) {
    // An inner arm and an outer hand that bends further and a little later, so the beat
    // reads as a real stroke rather than a flat paddle. 0 = wings at the top.
    float ph = aBeat * 6.2831853;
    float arm = 0.6 * cos(ph), hand = 0.45 * cos(ph - 0.7);
    float d = aWing.y * (ARM + HAND);
    vec2 a = vec2(cos(arm), sin(arm));
    vec2 hv = d <= ARM ? d * a : ARM * a + (d - ARM) * vec2(cos(arm + hand), sin(arm + hand));
    p = vec3(aWing.x * (ROOT + hv.x), RISE + hv.y, aWing.z);
  }
  vec3 v = aCenter + aRight * p.x + aUp * p.y + aFwd * p.z;
  vView = v;
  vColor = aColor;
  vCorner = aCorner;
  gl_Position = uProj * vec4(v, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vView;
in vec3 vColor;
in vec3 vCorner;
uniform vec3 uSun;   // towards the sun, in view space
out vec4 fragColor;
const vec3 INK = vec3(${INK.map((v) => v.toFixed(3)).join(", ")});

void main() {
  // Flat shading: each face's normal from how its position changes across the screen,
  // turned towards the camera (the wings are single sheets, seen from both sides).
  vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
  if (dot(n, vView) > 0.0) n = -n;
  float lit = max(dot(n, uSun), 0.0);
  vec3 col = min(vColor * (0.62 + 0.46 * lit), vec3(1.0));
  // Ink along each facet's edges, a constant width on screen: the outline and the folds.
  vec3 px = vCorner / max(fwidth(vCorner), vec3(1e-6));
  float edge = 1.0 - smoothstep(${(LINE_PX * 0.5).toFixed(2)}, ${(LINE_PX * 0.5 + 1).toFixed(2)}, min(min(px.x, px.y), px.z));
  fragColor = vec4(mix(col, INK, edge), 1.0);
}`;

// A soft oval on the ground under each swan, thrown away from the sun.
const SHADOW_VERT = `#version 300 es
in vec2 aCorner;
in vec3 aCenter;   // per swan, in view space
in vec3 aAcross;
in vec3 aAlong;
uniform mat4 uProj;
out vec2 vUv;
void main() {
  vUv = aCorner;
  gl_Position = uProj * vec4(aCenter + aAcross * aCorner.x + aAlong * aCorner.y, 1.0);
}`;

const SHADOW_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
out vec4 fragColor;
void main() {
  float a = (1.0 - smoothstep(0.35, 1.0, length(vUv))) * uAlpha;
  if (a < 0.002) discard;
  fragColor = vec4(uColor * a, a); // premultiplied
}`;

export function createSwans({ view, RenderNode, webgl, SpatialReference, Point }) {
  const popup = {
    title: "The Children of Lir",
    content: "In the legend, Fionnuala, Aodh, Fiachra and Conn, the four children of Lir, were "
      + "turned into swans by their stepmother and spent 900 years on Lough Derravaragh, the "
      + "Sea of Moyle and the waters off Erris before the spell broke.",
  };
  const mesh = buildMesh();
  const vertexCount = mesh.length / FLOATS;
  const scale = WINGSPAN_M / MODEL_SPAN;
  const wgs84 = SpatialReference.WGS84;

  let visible = false;
  let path = FALLBACK;
  let heading = 0; // radians, clockwise from north
  const setPath = (from, to) => {
    path = [from, to];
    const dx = (to[0] - from[0]) * KM_PER_DEG[0], dy = (to[1] - from[1]) * KM_PER_DEG[1];
    heading = Math.atan2(dx, dy);
  };
  setPath(...FALLBACK);

  // Aim the crossing at the view as it is now: in from the page's left edge, out through its
  // bottom edge, never over the panel (the controller): it's a barrier they turn out before. The
  // flight runs from wholly off the page to wholly off it again, the last of the four included,
  // so none of them blinks out on screen when the next crossing begins.
  let crossMs = CROSS_MS;
  const setPathFromView = () => {
    const W = view.width, H = view.height;
    const box = view.container.getBoundingClientRect();
    const panel = document.getElementById("panel")?.getBoundingClientRect();
    // The panel's edge, as a barrier: down the right side (desktop) or across the bottom (phone).
    let right = W, bottom = H;
    if (panel?.width && panel.height) {
      const left = panel.left - box.left, top = panel.top - box.top;
      if (left > W * 0.4) right = left - BARRIER_PX;
      else if (top > H * 0.4) bottom = top - BARRIER_PX;
    }
    const out = bottom < H ? { x: right - 2, y: bottom * 0.85 } : { x: right * OUT_X, y: H - 2 };
    const inn = { x: 2, y: Math.min(H * IN_Y, bottom * IN_Y) };
    const a = view.toMap(inn), b = view.toMap(out);
    if (!a || !b) return;
    const [ax, ay, bx, by] = [a.longitude, a.latitude, b.longitude, b.latitude];
    // How far beyond the edges, as shares of the on-screen stretch: EDGE_PX on screen plus,
    // at the far end, the formation's length and a wingspan (the last swan trails the leader).
    const px = Math.hypot(out.x - inn.x, out.y - inn.y);
    const km = Math.hypot((bx - ax) * KM_PER_DEG[0], (by - ay) * KM_PER_DEG[1]);
    const trail = (Math.max(...FORMATION.map(([back, side]) => Math.hypot(back, side))) + WINGSPAN_M) / 1000;
    const before = EDGE_PX / px + WINGSPAN_M / 1000 / km, after = EDGE_PX / px + trail / km;
    setPath([ax - (bx - ax) * before, ay - (by - ay) * before], [bx + (bx - ax) * after, by + (by - ay) * after]);
    crossMs = CROSS_MS * (1 + before + after); // the same speed over the longer flight
  };

  // Where each swan is now (lon, lat), also kept for clicks.
  const start = performance.now();
  const places = FORMATION.map(() => [0, 0]);
  if (new URLSearchParams(location.search).has("debug")) window.__swans = { places, altitude: ALTITUDE, showCard: () => lirPop.show(LIR_CARD, new Point({ longitude: places[0][0], latitude: places[0][1], z: ALTITUDE })) };
  const place = (now) => {
    const t = ((now - start) / crossMs) % 1;
    const [[x0, y0], [x1, y1]] = path;
    const lon0 = x0 + (x1 - x0) * t, lat0 = y0 + (y1 - y0) * t;
    const fwd = [Math.sin(heading), Math.cos(heading)], right = [fwd[1], -fwd[0]]; // east, north
    FORMATION.forEach(([back, side], i) => {
      const e = fwd[0] * back + right[0] * side, n = fwd[1] * back + right[1] * side;
      places[i] = [lon0 + e / (KM_PER_DEG[0] * 1000), lat0 + n / (KM_PER_DEG[1] * 1000)];
    });
  };

  const SWAN_FLOATS = 13, SHADOW_FLOATS = 9;
  const swanData = new Float32Array(FORMATION.length * SWAN_FLOATS);
  const shadowData = new Float32Array(FORMATION.length * SHADOW_FLOATS);
  const enu = new Array(16);
  const rot = (V, v) => [V[0] * v[0] + V[4] * v[1] + V[8] * v[2], V[1] * v[0] + V[5] * v[1] + V[9] * v[2], V[2] * v[0] + V[6] * v[1] + V[10] * v[2]];
  let sunV = [0, 0, 1];

  // Each swan and its shadow in view space, worked out in doubles relative to the eye.
  const update = (V, now) => {
    place(now);
    const sh = Math.sin(heading), ch = Math.cos(heading);
    places.forEach(([lon, lat], i) => {
      webgl.renderCoordinateTransformAt(view, [lon, lat, ALTITUDE], wgs84, enu);
      const eV = rot(V, [enu[0], enu[1], enu[2]]), nV = rot(V, [enu[4], enu[5], enu[6]]), uV = rot(V, [enu[8], enu[9], enu[10]]);
      const oV = [0, 1, 2].map((k) => V[k] * enu[12] + V[4 + k] * enu[13] + V[8 + k] * enu[14] + V[12 + k]);
      const fwd = [0, 1, 2].map((k) => eV[k] * sh + nV[k] * ch);
      const right = [0, 1, 2].map((k) => eV[k] * ch - nV[k] * sh);
      const beat = (((now / FLAP_MS + FORMATION[i][2]) % 1) + 1) % 1;
      swanData.set([...oV, ...right.map((v) => v * scale), ...uV.map((v) => v * scale), ...fwd.map((v) => v * scale), beat], i * SWAN_FLOATS);
      // The shadow at sea level, thrown away from the sun.
      const [de, dn] = [SHADOW_DIR[0] * SHADOW_REACH, SHADOW_DIR[1] * SHADOW_REACH];
      const ground = [0, 1, 2].map((k) => oV[k] + eV[k] * de + nV[k] * dn - uV[k] * ALTITUDE);
      shadowData.set([...ground, ...right.map((v) => v * WINGSPAN_M * SHADOW.across), ...fwd.map((v) => v * WINGSPAN_M * SHADOW.along)], i * SHADOW_FLOATS);
      if (i === 0) sunV = [0, 1, 2].map((k) => eV[k] * SUN_DIR[0] + nV[k] * SUN_DIR[1] + uV[k] * SUN_DIR[2]);
    });
  };

  // The overlay: a transparent canvas over the map, the size of the scene's canvas, ignoring the
  // mouse (so clicks still reach the map), with its own WebGL context for the swans.
  let overlay = null;
  const ensureOverlay = (w, h) => {
    if (!overlay) {
      const canvas = document.createElement("canvas");
      canvas.className = "swan-overlay";
      canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1";
      const host = view.container;
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      host.appendChild(canvas);
      const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true, depth: true });
      if (!gl) return null;
      overlay = { canvas, gl };
      node.setup.call(node, gl);
    }
    if (overlay.canvas.width !== w || overlay.canvas.height !== h) { overlay.canvas.width = w; overlay.canvas.height = h; }
    return overlay;
  };
  const clearOverlay = () => {
    if (!overlay) return;
    const gl = overlay.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  };
  // Whether any swan (with a wingspan's margin) is in front of the camera and inside the view.
  const onScreen = (proj) => {
    for (let i = 0; i < FORMATION.length; i++) {
      const o = i * SWAN_FLOATS, x = swanData[o], y = swanData[o + 1], z = swanData[o + 2];
      const cx = proj[0] * x + proj[4] * y + proj[8] * z + proj[12];
      const cy = proj[1] * x + proj[5] * y + proj[9] * z + proj[13];
      const cw = proj[3] * x + proj[7] * y + proj[11] * z + proj[15];
      if (cw <= 0) continue;
      const m = 1 + (WINGSPAN_M * Math.abs(proj[0])) / cw; // a wingspan's margin, in clip units
      if (Math.abs(cx / cw) < m && Math.abs(cy / cw) < m) return true;
    }
    return false;
  };
  let overlayBlank = true;
  const drawOverlay = (size, proj) => {
    // The map canvas's own size: the scene's viewport changes from pass to pass, and resizing the
    // overlay to follow it reallocated it nearly every frame (the page fell to a few fps).
    const [w, h] = size;
    const o = ensureOverlay(w, h);
    if (!o?.prog) return;
    const gl = o.gl;
    // Off screen: clear once and leave the canvas be until they come back.
    if (!onScreen(proj)) { if (!overlayBlank) { clearOverlay(); overlayBlank = true; } return; }
    overlayBlank = false;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // Shadows first, soft, on the ground under them (not hidden by the hills they fall on).
    gl.useProgram(o.shadowProg);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(o.shadowLoc.uProj, false, proj);
    gl.uniform3fv(o.shadowLoc.uColor, SHADOW.color);
    gl.uniform1f(o.shadowLoc.uAlpha, SHADOW.alpha);
    gl.bindBuffer(gl.ARRAY_BUFFER, o.shadowBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, shadowData);
    gl.bindVertexArray(o.shadowVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, FORMATION.length);
    gl.bindVertexArray(null);
    gl.useProgram(o.prog);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.uniformMatrix4fv(o.loc.uProj, false, proj);
    gl.uniform3fv(o.loc.uSun, sunV);
    gl.bindBuffer(gl.ARRAY_BUFFER, o.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, swanData);
    gl.bindVertexArray(o.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, vertexCount, FORMATION.length);
    gl.bindVertexArray(null);
  };

  const SwanNode = RenderNode.createSubclass({
    // With the scene's solid things, depth-tested and writing depth, so the moving sea (drawn
    // later, with the transparent things) and the clouds (drawn over the finished scene, higher
    // up) sit right against them.
    // The swans and their shadows fly over the names: ArcGIS draws its text after every stage a
    // render node can use, so they go on their own canvas laid over the map (overlay above),
    // drawn with the same camera in the same frame. (Drawn in the sea's stage, they once
    // stopped the map's labels from showing.)
    consumes: { required: ["opaque-color"] },
    produces: "opaque-color",

    // GL resources are made on the first frame: the context isn't there yet when the node is built.
    setup(gl) {
      const program = (vs, fs) => {
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
      };
      const buffer = (data, usage) => {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, usage);
        return b;
      };
      const layout = (prog, buf, stride, attrs, divisor) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        let offset = 0;
        for (const [name, size] of attrs) {
          const l = gl.getAttribLocation(prog, name);
          gl.enableVertexAttribArray(l);
          gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride * 4, offset);
          gl.vertexAttribDivisor(l, divisor);
          offset += size * 4;
        }
      };

      if (gl === overlay?.gl) {
        // On the overlay's own context: the swans only.
        const prog = program(VERT, FRAG);
        overlay.prog = prog;
        overlay.loc = { uProj: gl.getUniformLocation(prog, "uProj"), uSun: gl.getUniformLocation(prog, "uSun") };
        overlay.vao = gl.createVertexArray();
        gl.bindVertexArray(overlay.vao);
        layout(prog, buffer(mesh, gl.STATIC_DRAW), FLOATS, [["aPos", 3], ["aWing", 3], ["aColor", 3], ["aCorner", 3]], 0);
        overlay.buf = buffer(swanData.byteLength, gl.DYNAMIC_DRAW);
        layout(prog, overlay.buf, SWAN_FLOATS, [["aCenter", 3], ["aRight", 3], ["aUp", 3], ["aFwd", 3], ["aBeat", 1]], 1);
        gl.bindVertexArray(null);
        // Their shadows, on the overlay too, so the map itself needn't redraw as they move.
        overlay.shadowProg = program(SHADOW_VERT, SHADOW_FRAG);
        overlay.shadowLoc = Object.fromEntries(["uProj", "uColor", "uAlpha"].map((n) => [n, gl.getUniformLocation(overlay.shadowProg, n)]));
        overlay.shadowVao = gl.createVertexArray();
        gl.bindVertexArray(overlay.shadowVao);
        layout(overlay.shadowProg, buffer(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW), 2, [["aCorner", 2]], 0);
        overlay.shadowBuf = buffer(shadowData.byteLength, gl.DYNAMIC_DRAW);
        layout(overlay.shadowProg, overlay.shadowBuf, SHADOW_FLOATS, [["aCenter", 3], ["aAcross", 3], ["aAlong", 3]], 1);
        gl.bindVertexArray(null);
      }
    },

    // Draws nothing into the map: it keeps the camera of each frame the map draws, and draws the
    // swans for that frame on the overlay, so they move with the camera. Between the map's frames
    // the overlay redraws itself on the paper beat (step, below) with the last camera: the swans
    // used to ask the whole map to redraw 12 times a second, which cost ~10 fps at rest.
    render() {
      const output = this.bindRenderTarget();
      lastView.set(this.camera.viewMatrix);
      lastProj.set(this.camera.projectionMatrix);
      lastSize = [this.gl.canvas.width, this.gl.canvas.height];
      haveCamera = true;
      if (!visible) { clearOverlay(); overlayBlank = true; return output; }
      // Posed on the paper beat (paper.js): they hold each pose between steps.
      update(lastView, paperTime(performance.now()));
      drawOverlay(lastSize, lastProj);
      nextStep();
      return output;
    },
  });
  const lastView = new Float64Array(16), lastProj = new Float32Array(16);
  let lastSize = [0, 0], haveCamera = false;
  const node = new SwanNode({ view });
  // They keep flying, a step at a time, on the overlay alone.
  const step = () => {
    if (!visible || !haveCamera) return;
    update(lastView, paperTime(performance.now()));
    drawOverlay(lastSize, lastProj);
    nextStep();
  };
  const nextStep = atNextStep(step);

  // A click on (or near) a swan tells their story.
  const lirPop = createTicketPopup(view, { className: "lir-pop" });
  view.on("click", (event) => {
    if (!visible) return;
    const hit = places.find(([lon, lat]) => {
      const p = view.toScreen(new Point({ longitude: lon, latitude: lat, z: ALTITUDE }));
      return p && Math.hypot(p.x - event.x, p.y - event.y) < CLICK_PX;
    });
    if (!hit) return;
    event.stopPropagation();
    lirPop.show(LIR_CARD, new Point({ longitude: hit[0], latitude: hit[1], z: ALTITUDE }));
  });

  const setVisible = (on) => {
    visible = on;
    if (!on) { clearOverlay(); overlayBlank = true; }
    node.requestRender();
    if (on) nextStep();
  };
  return { setVisible, setPathFromView };
}

// The swans' card: the legend as a leaf of an old Irish manuscript by night. Deep blue vellum
// with a slow silver shimmer, a gold knotwork border, the title in an uncial hand, and white
// feathers drifting down it (styles.css, .lir).
const LIR_CARD = `<div class="lir">
  <div class="lir-shimmer" aria-hidden="true"></div>
  <div class="lir-feathers" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
  <div class="lir-title">Clann Lir</div>
  <div class="lir-sub">The Children of Lir</div>
  <p>Fionnuala, Aodh, Fiachra and Conn, the four children of Lir, were turned into swans by their
  stepmother Aoife, and kept their human voices. For nine hundred years they flew and sang:</p>
  <ol class="lir-waters">
    <li><span>300 years</span> Lough Derravaragh</li>
    <li><span>300 years</span> the Sea of Moyle</li>
    <li><span>300 years</span> the waters off Erris</li>
  </ol>
  <p class="lir-end">until a bell rang out across the land, and the spell broke.</p>
</div>`;
