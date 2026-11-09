// A living sea around Ireland: our own water shader in the scene's render loop (a RenderNode),
// in place of ArcGIS's water symbol (which tops out at "moderate" waves and cost about a third
// of the frame rate while the camera moved).
//
// From hundreds of kilometres up, single waves are far smaller than a pixel, so this aims at
// what makes a sea look alive from altitude, as in satellite images:
//   - swell: six Gerstner-style wave trains rolling in from the Atlantic (west-south-west),
//     scaled up to read at map scale, plus fine drifting detail; they set the surface normal
//   - Fresnel reflection of a sky gradient, stronger at grazing angles (depth to the horizon)
//   - sun glint: a real specular highlight from the same low west-south-west sun as the clouds,
//     so it slides across the water as the camera moves
//   - colour by depth (pale inshore, deep Atlantic slate offshore) and surf bands rolling onto
//     the coast, both from a distance-to-coast field worked out once at start-up
// It fades out at the edges of the area it covers, into the flat sea colour beyond.

// The coast-distance field covers the waters round Ireland in detail; the moving surface is far
// bigger, so its edges are well beyond anything the map shows, and it fades into the flat sea over
// its outer 30%. Past the distance field it's simply open water (the texture clamps to its edge).
const DIST_BOX = { lon: [-14.5, -1.5], lat: [49.6, 58.2] };
const SURFACE_BOX = { lon: [-30, 12], lat: [40, 66] };
const EDGE_FADE = 0.3;
const GRID = 2560; // distance-field resolution (about 0.33 km a cell, so the sea follows the detailed coast)
const MESH = 96; // the surface is split into MESH x MESH quads, so it follows the Earth's curve
// Height of the surface above sea level: just above it near Ireland, so it meets the coast
// cleanly up close, rising further out to clear Britain's hills (Ben Nevis is 1,345 m), which
// otherwise poked through the depth test as ghost shapes.
const LIFT_M = { near: 50, far: 2600, fromKm: 15, toKm: 60 }; // far: clears Britain and the Norwegian peaks under the surface
const COAST_KM = 0.15; // the sea starts here, just off the outline (the flat sea fill in app.js meets the coast)
const FADE_IN_MS = 2500;
// Towards the sun in east-north-up (west-south-west, 35 degrees up), as clouds3d.js uses.
const SUN_DIR = (() => { const b = (240 * Math.PI) / 180, e = (35 * Math.PI) / 180; return [Math.sin(b) * Math.cos(e), Math.cos(b) * Math.cos(e), Math.sin(e)]; })();
// The swell's heading in east-north-up: from the west-south-west, rolling east-north-east.
const SWELL_BEARING = 70;

const VERT = `#version 300 es
in vec3 aPos;               // render coordinates relative to the mesh origin
in vec2 aUv;                // where to read the distance (0..1 across DIST_BOX; clamps beyond)
in vec2 aEdge;              // 0..1 across SURFACE_BOX, for the fade at its edges
in vec2 aPlane;             // metres east and north of the box centre, for the waves
uniform mat4 uModelView;
uniform mat4 uProj;
uniform sampler2D uDist;    // km from the coast
uniform vec3 uUpWorld;      // local up, render coordinates
uniform vec4 uLift;         // near m, far m, from km, to km
out vec2 vUv;
out vec2 vEdge;
out vec2 vPlane;
out vec3 vView;             // position in view space
void main() {
  vUv = aUv;
  vEdge = aEdge;
  vPlane = aPlane;
  float d = textureLod(uDist, aUv, 0.0).r;
  float lift = mix(uLift.x, uLift.y, smoothstep(uLift.z, uLift.w, d));
  vec4 p = uModelView * vec4(aPos + uUpWorld * lift, 1.0);
  vView = p.xyz;
  gl_Position = uProj * p;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vEdge;
in vec2 vPlane;
in vec3 vView;
uniform sampler2D uDist;    // km from the coast
uniform float uTime, uAlpha, uCoastKm, uEdgeFade;
uniform vec3 uEast, uNorth, uUp, uSun;   // in view space
uniform vec2 uSwell;        // swell direction (east, north)
uniform vec3 uShallow, uDeep, uSkyLow, uSkyHigh, uFlat;
uniform vec3 uInk;           // the map look's ink
uniform mat4 uProj;
uniform float uDepthBias;    // m: tested as if this much nearer the camera
out vec4 fragColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

// Slope of one wave train: d(height)/d(east, north). A train fades out once its wavelength is
// only a few pixels on screen, so far-off water doesn't shimmer into moire stripes.
// Real swell isn't ruled lines: crests bend (a large-scale warp of the phase) and the swell
// comes in sets, stronger in some patches than others (wave groups).
float mpp;  // metres per pixel here
float warp; // phase bend, radians
float sets; // local swell strength, 0.35..1.15
vec2 wave(vec2 p, vec2 dir, float lengthM, float steep, float speed, float phase) {
  float k = 6.2831853 / lengthM;
  float x = dot(p, dir) * k - uTime * speed + phase + warp * (8000.0 / lengthM + 0.6);
  return dir * (steep * sets * cos(x) * smoothstep(5.0, 14.0, lengthM / mpp));
}
mat2 turn(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

void main() {
  // Depth: tested as if uDepthBias nearer the camera, so the terrain at the coast (refined tile by
  // tile as it loads) never pokes through and makes the inked coastline flicker, while anything
  // well above the water (the swans fly 9 km up) still stays in front.
  vec4 biased = uProj * vec4(vView * max(0.0, 1.0 - uDepthBias / length(vView)), 1.0);
  gl_FragDepth = clamp(biased.z / biased.w * 0.5 + 0.5, 0.0, 1.0);
  float d = texture(uDist, vUv).r;          // km from the coast
  if (d < uCoastKm) discard;                // the land and its tinted margin
  float off = d - uCoastKm;                 // km out from where the sea starts
#ifdef MAP_LOOK
  // The engraved map's sea (the 1920 railway map): an ink line along the coast, a deeper green
  // close inshore that fades out to sea, a few fine water lines following the coast, and the
  // pale green beyond. Everything is measured in pixels here (fwidth), so the lines stay hair
  // thin at any zoom, and the water lines give way where they'd crowd under a few pixels apart.
  float px = max(fwidth(off), 1e-4);        // km per pixel at this point
  vec3 mc = mix(uDeep, uShallow, exp(-off / 6.0));
  float lines = 0.0;
  for (int i = 0; i < 4; i++) {
    float at = 1.6 * pow(1.9, float(i));    // 1.6, 3.0, 5.8, 11 km out
    float w = 1.0 - smoothstep(0.35 * px, 1.1 * px, abs(off - at));
    lines += w * (0.42 - 0.08 * float(i)) * smoothstep(3.0, 7.0, at / px);
  }
  mc = mix(mc, uInk, clamp(lines, 0.0, 1.0) * 0.55);
  // The coastline itself: about a pixel and a half of ink.
  mc = mix(mc, uInk, (1.0 - smoothstep(0.9 * px, 1.9 * px, off)) * 0.9);
  float edge0 = smoothstep(0.0, uEdgeFade, min(min(vEdge.x, 1.0 - vEdge.x), min(vEdge.y, 1.0 - vEdge.y)));
  mc = mix(uFlat, mc, edge0);
  fragColor = vec4(mc * uAlpha, uAlpha);
  return;
#endif

  // Swell: wave trains around the Atlantic direction, long and slow to short and quick.
  vec2 p = vPlane;
  mpp = max(length(fwidth(vPlane)), 1.0);
  warp = (noise(p / 42000.0) + 0.5 * noise(p / 17000.0 + 7.3)) * 4.2;
  sets = 0.35 + 0.8 * noise(p / 55000.0 - uSwell * uTime * 0.004 + 3.1);
  vec2 s = vec2(0.0);
  s += wave(p, uSwell,                 26000.0, 0.16, 0.80, 0.0);
  s += wave(p, turn(0.35) * uSwell,    14000.0, 0.13, 1.05, 1.7);
  s += wave(p, turn(-0.45) * uSwell,    8500.0, 0.11, 1.35, 4.1);
  s += wave(p, turn(0.8) * uSwell,      4600.0, 0.08, 1.80, 2.3);
  s += wave(p, turn(-0.9) * uSwell,     2600.0, 0.06, 2.40, 5.2);
  s += wave(p, turn(0.15) * uSwell,     1400.0, 0.05, 3.10, 0.9);
  // Fine detail drifting with the wind, so the surface never looks frozen.
  vec2 q = p / 900.0 + uSwell * uTime * 0.35;
  vec2 grain = vec2(noise(q) - noise(q + vec2(3.1, 0.0)), noise(q) - noise(q + vec2(0.0, 2.7)));
  s += grain * 0.05 * smoothstep(5.0, 14.0, 900.0 / mpp);

  // Surface normal and the vectors for lighting, all in view space.
  vec3 n = normalize(uUp - uEast * s.x - uNorth * s.y);
  vec3 v = normalize(-vView);
  vec3 r = reflect(-v, n);

  // Body colour by depth, then sky reflection by Fresnel (Schlick, water F0 = 0.02).
  float deep = smoothstep(1.0, 32.0, off); // the shallows stay close inshore
  vec3 body = mix(uShallow, uDeep, deep);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 sky = mix(uSkyLow, uSkyHigh, clamp(dot(r, uUp), 0.0, 1.0));
  vec3 col = mix(body, sky, clamp(fres * 1.6, 0.0, 0.75));

  // Sun: a tight glint and a broad sheen.
  float sunDot = max(dot(r, uSun), 0.0);
  col += vec3(1.0, 0.97, 0.9) * (pow(sunDot, 420.0) * 1.4 + pow(sunDot, 24.0) * 0.12 + pow(sunDot, 6.0) * 0.12);

  // Surf: bands rolling onto the coast, broken up so they read as foam, only in the shallows.
  float band = sin(off * 2.4 - uTime * 1.1 + noise(p / 2500.0) * 2.0);
  float foam = smoothstep(0.55, 1.0, band) * smoothstep(5.0, 0.0, off) * (0.55 + 0.45 * noise(p / 600.0 + uTime * 0.2));
  foam += smoothstep(0.9, 0.0, off) * 0.55; // a bright edge right at the coast
  col = mix(col, vec3(0.97, 0.98, 0.98), clamp(foam, 0.0, 1.0) * 0.8);

  // Fade into the flat sea at the edges of the area covered.
  float edge = smoothstep(0.0, uEdgeFade, min(min(vEdge.x, 1.0 - vEdge.x), min(vEdge.y, 1.0 - vEdge.y)));
  col = mix(uFlat, col, edge);
  float a = uAlpha;
  fragColor = vec4(col * a, a); // premultiplied
}`;

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

// Distance (in grid cells) from every cell to the nearest land cell: Felzenszwalb's exact
// squared Euclidean distance transform, run down the columns and then along the rows.
function distanceTransform(land, n) {
  const INF = 1e20;
  const f = new Float64Array(n), out = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const dt1d = () => {
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      out[q] = (q - v[k]) ** 2 + f[v[k]];
    }
  };
  const grid = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) grid[i] = land[i] ? 0 : INF;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) f[y] = grid[y * n + x];
    dt1d();
    for (let y = 0; y < n; y++) grid[y * n + x] = out[y];
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) f[x] = grid[y * n + x];
    dt1d();
    for (let x = 0; x < n; x++) grid[y * n + x] = Math.sqrt(out[x]);
  }
  return grid;
}

// float -> IEEE half float bits (the distance texture is R16F: precise and filterable).
const toHalf = (() => {
  const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
  return (v) => {
    f32[0] = v;
    const x = u32[0], sign = (x >>> 16) & 0x8000, exp = ((x >>> 23) & 0xff) - 112, mant = x & 0x7fffff;
    if (exp <= 0) return sign;
    if (exp >= 31) return sign | 0x7bff;
    return sign | (exp << 10) | (mant >>> 13);
  };
})();

// The island drawn into the grid, then each sea cell's distance from it in km, as half floats.
function coastDistance(outline) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = GRID;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const toPx = ([lon, lat]) => [((lon - DIST_BOX.lon[0]) / (DIST_BOX.lon[1] - DIST_BOX.lon[0])) * GRID, ((DIST_BOX.lat[1] - lat) / (DIST_BOX.lat[1] - DIST_BOX.lat[0])) * GRID];
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  for (const polygon of outline.geometry.coordinates) {
    for (const ring of polygon) {
      ring.forEach((pt, i) => { const [x, y] = toPx(pt); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
    }
  }
  ctx.fill("nonzero"); // the Republic and Northern Ireland overlap a little along the border: fill both
  const pixels = ctx.getImageData(0, 0, GRID, GRID).data;
  const land = new Uint8Array(GRID * GRID);
  for (let i = 0; i < land.length; i++) land[i] = pixels[i * 4] > 127 ? 1 : 0;
  const cells = distanceTransform(land, GRID);
  // A cell is about this many km across (east-west and north-south differ a little; average).
  const midLat = ((DIST_BOX.lat[0] + DIST_BOX.lat[1]) / 2) * (Math.PI / 180);
  const kmPerCell = (((DIST_BOX.lon[1] - DIST_BOX.lon[0]) * 111.32 * Math.cos(midLat)) / GRID + ((DIST_BOX.lat[1] - DIST_BOX.lat[0]) * 110.6) / GRID) / 2;
  const halves = new Uint16Array(GRID * GRID);
  for (let i = 0; i < halves.length; i++) halves[i] = toHalf(cells[i] * kmPerCell);
  return halves;
}

// look: "living" (moving water, as from the air) or "map" (the engraved map's sea, still).
export function createSea({ view, RenderNode, webgl, SpatialReference, outline, colors, look = "living" }) {
  let dist = coastDistance(outline); // released once it's on the GPU (13 MB)
  const rgb = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, hexToRgb(v)]));
  const center = [(DIST_BOX.lon[0] + DIST_BOX.lon[1]) / 2, (DIST_BOX.lat[0] + DIST_BOX.lat[1]) / 2];
  const rad = Math.PI / 180;

  // The mesh: (MESH+1)^2 points on the sea surface, in render coordinates relative to its
  // first point (so float32 keeps them precise), with their place in the box and in metres.
  const n = MESH + 1;
  const lonlat = new Float64Array(n * n * 3), world = new Float64Array(n * n * 3);
  const uv = new Float32Array(n * n * 2), edgeUv = new Float32Array(n * n * 2), plane = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i, u = i / MESH, v = j / MESH;
      const lon = SURFACE_BOX.lon[0] + u * (SURFACE_BOX.lon[1] - SURFACE_BOX.lon[0]), lat = SURFACE_BOX.lat[1] - v * (SURFACE_BOX.lat[1] - SURFACE_BOX.lat[0]);
      lonlat.set([lon, lat, 0], k * 3);
      uv.set([(lon - DIST_BOX.lon[0]) / (DIST_BOX.lon[1] - DIST_BOX.lon[0]), (DIST_BOX.lat[1] - lat) / (DIST_BOX.lat[1] - DIST_BOX.lat[0])], k * 2);
      edgeUv.set([u, v], k * 2);
      plane.set([(lon - center[0]) * 111320 * Math.cos(lat * rad), (lat - center[1]) * 110600], k * 2);
    }
  }
  const indices = new Uint32Array(MESH * MESH * 6);
  let t = 0;
  for (let j = 0; j < MESH; j++) {
    for (let i = 0; i < MESH; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      indices.set([a, c, b, b, c, d], t);
      t += 6;
    }
  }
  const swell = [Math.sin(SWELL_BEARING * rad), Math.cos(SWELL_BEARING * rad)];
  let origin = null;
  let fadeStart = null;
  // ?debug: window.__seaFrame() resolves with a PNG of the frame as drawn so far (terrain, draped
  // layers and this sea), read straight back from the scene's buffer. view.takeScreenshot draws
  // render nodes with a different camera, so it shows this sea offset from the coast.
  let pendingCapture = null;
  if (new URLSearchParams(location.search).has("debug")) {
    window.__seaFrame = () => new Promise((resolve) => { pendingCapture = resolve; node.requestRender(); });
  }
  const mv = new Float32Array(16), enu = new Array(16);
  const rot = (V, x) => [V[0] * x[0] + V[4] * x[1] + V[8] * x[2], V[1] * x[0] + V[5] * x[1] + V[9] * x[2], V[2] * x[0] + V[6] * x[1] + V[10] * x[2]];

  const SeaNode = RenderNode.createSubclass({
    // With the scene's transparent things, depth-tested so the swans and anything standing
    // above the water stays in front of it.
    consumes: { required: ["transparent-color"] },
    produces: "transparent-color",

    setup(gl) {
      webgl.toRenderCoordinates(view, lonlat, 0, SpatialReference.WGS84, world, 0, n * n);
      const mid = ((MESH / 2) * n + MESH / 2) * 3; // the middle point, so float32 offsets stay small
      origin = [world[mid], world[mid + 1], world[mid + 2]];
      const positions = new Float32Array(n * n * 3);
      for (let k = 0; k < n * n; k++) for (let c = 0; c < 3; c++) positions[k * 3 + c] = world[k * 3 + c] - origin[c];
      webgl.renderCoordinateTransformAt(view, [center[0], center[1], 0], SpatialReference.WGS84, enu);

      const shader = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
        return sh;
      };
      const prog = gl.createProgram();
      gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, look === "map" ? FRAG.replace("precision highp float;", "precision highp float;\n#define MAP_LOOK") : FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      this.prog = prog;
      this.loc = Object.fromEntries(["uModelView", "uProj", "uDist", "uUpWorld", "uLift", "uTime", "uAlpha", "uCoastKm", "uEdgeFade", "uEast", "uNorth", "uUp", "uSun", "uSwell",
        "uShallow", "uDeep", "uSkyLow", "uSkyHigh", "uFlat", "uInk", "uDepthBias"].map((name) => [name, gl.getUniformLocation(prog, name)]));

      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      const attrib = (name, data, size) => {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        const l = gl.getAttribLocation(prog, name);
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0);
      };
      attrib("aPos", positions, 3);
      attrib("aUv", uv, 2);
      attrib("aEdge", edgeUv, 2);
      attrib("aPlane", plane, 2);
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      gl.bindVertexArray(null);

      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      // The scene leaves its own upload settings on (flipping rows, for one, which mirrored the
      // coast north to south), so set every one this upload depends on.
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, GRID, GRID, 0, gl.RED, gl.HALF_FLOAT, dist);
      dist = null;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
    },

    render() {
      const output = this.bindRenderTarget();
      if (fadeStart === null) return output;
      const gl = this.gl;
      if (!this.prog) this.setup(gl);
      const now = performance.now();
      const alpha = Math.min(1, (now - fadeStart) / FADE_IN_MS);

      // Model-view in doubles: the view matrix with the mesh origin folded into its translation.
      const V = this.camera.viewMatrix;
      for (let i = 0; i < 12; i++) mv[i] = V[i];
      for (let r = 0; r < 3; r++) mv[12 + r] = V[r] * origin[0] + V[4 + r] * origin[1] + V[8 + r] * origin[2] + V[12 + r];
      mv[15] = 1;
      // The local east, north and up (and the sun) in view space, from the middle of the area.
      const east = rot(V, [enu[0], enu[1], enu[2]]), north = rot(V, [enu[4], enu[5], enu[6]]), up = rot(V, [enu[8], enu[9], enu[10]]);
      const sun = [0, 1, 2].map((i) => east[i] * SUN_DIR[0] + north[i] * SUN_DIR[1] + up[i] * SUN_DIR[2]);

      const L = this.loc;
      gl.useProgram(this.prog);
      // Depth-tested, with a bias (uDepthBias, in the shader): plainly tested against the terrain,
      // coastal hills poked through as finer terrain loaded tile by tile, and the coast blinked;
      // with no test at all, the sea covered the swans.
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix4fv(L.uModelView, false, mv);
      gl.uniformMatrix4fv(L.uProj, false, this.camera.projectionMatrix);
      gl.uniform1f(L.uTime, (now / 1000) % 3600);
      gl.uniform1f(L.uAlpha, alpha);
      gl.uniform3fv(L.uUpWorld, [enu[8], enu[9], enu[10]]);
      gl.uniform4fv(L.uLift, [LIFT_M.near, LIFT_M.far, LIFT_M.fromKm, LIFT_M.toKm]);
      gl.uniform1f(L.uCoastKm, COAST_KM);
      gl.uniform1f(L.uEdgeFade, EDGE_FADE);
      gl.uniform3fv(L.uEast, east);
      gl.uniform3fv(L.uNorth, north);
      gl.uniform3fv(L.uUp, up);
      gl.uniform3fv(L.uSun, sun);
      gl.uniform2fv(L.uSwell, swell);
      gl.uniform3fv(L.uShallow, rgb.shallow);
      gl.uniform3fv(L.uDeep, rgb.deep);
      gl.uniform3fv(L.uSkyLow, rgb.skyLow);
      gl.uniform3fv(L.uSkyHigh, rgb.skyHigh);
      gl.uniform3fv(L.uFlat, rgb.flat);
      gl.uniform3fv(L.uInk, rgb.ink || [0.12, 0.115, 0.1]);
      gl.uniform1f(L.uDepthBias, 3000);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(L.uDist, 0);
      gl.bindVertexArray(this.vao);
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
      if (pendingCapture) {
        const [, , w, h] = gl.getParameter(gl.VIEWPORT);
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        const img = ctx.createImageData(w, h);
        for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
        for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
        ctx.putImageData(img, 0, 0);
        const resolve = pendingCapture;
        pendingCapture = null;
        resolve(canvas.toDataURL("image/png"));
      }
      this.resetWebGLState();
      // The living sea keeps moving; the map's sea is still, so it only redraws while fading in.
      if (look !== "map" || alpha < 1) this.requestRender();
      return output;
    },
  });

  const node = new SeaNode({ view });
  return {
    // Fade the living sea in (after the opening lands, when Britain is under the sea).
    start: () => {
      if (fadeStart === null) fadeStart = performance.now();
      node.requestRender();
    },
  };
}
