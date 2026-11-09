// The sky for the opening flight: cirrus over Ireland and the sea, which the camera drops past.
// place(t) moves it for a point in the flight (0 to 1).
//
// Modelled on how cirrus over Ireland usually looks and moves, with a few liberties for the
// camera:
//   - It rides the Atlantic jet: everything drifts together from the west-south-west towards
//     the east-north-east at a steady pace, the higher layers faster. (From this camera that
//     is a slow drift to the right.) It clears by thinning away, not by parting.
//   - One long jet band crosses Ireland south-west to north-east, with a crisper
//     north-western edge and faint ripples across it, as jet cirrus shows from above; looser
//     patches sit around it.
//   - Mares' tails in one sky hook the same way (the wind shear is the same), so all the
//     strands bend alike.
//   - Real cirrus is 6-13 km up. These are 12-36 km: still enough parallax for the layers to
//     slide past each other as the camera drops, but the shadows stay near their clouds.
// Each strand is a card stretched along its own direction in the sky, filled by the shader
// with soft fibres, tapered and feathered at the edges. Each casts a faint shadow flat on
// the ground, offset away from the low west-south-west sun; from above, that's what shows
// cirrus over the pale land. Everything sinks into the haze of the air with distance.
// Sorted back to front each frame and drawn in one instanced call.
//
// On the flight path (fitPath): once the flight's start and end are known, the patches are
// strung along the camera's own path, at its height as it passes each point, so it flies
// through them on the way down rather than looking down on them; they're smaller, and outlined
// in the map's ink like the clouds drawn on old sheets.
//
// Each strand shows one of a few cirrus drawings made once at load (cloud-drawings.js, in a
// worker): a feathered body with streaks along it and a crisp ink outline, drawn at full
// resolution, so the outline stays steady rather than being worked out per pixel each frame.
//
// It's our own WebGL in the scene's render loop (a RenderNode), not graphics in a layer:
// moving layer graphics every frame kept the layer busy in 93% of frames, so they were drawn
// late and jumped. Here a move is just new numbers, read when the frame is drawn, and
// positions are worked out relative to the eye in double precision.

// Centred a little south of Ireland's middle (53.4N): seen from the tilted camera, high cloud
// appears shifted up the screen from the ground under it, so this puts the veil over Ireland.
// It starts a little west too, since it drifts east during the flight.
const CENTER = [-8.4, 53.15];
const SPREAD_KM = 520; // half-width of the patch of sky they cover
const KM_PER_DEG_LAT = 110.6;

// Per level: how many loose patches, their height (m) and length (m), how thick their fibres
// are, how deep in the air (more haze), and how far (km) the jet carries them over the flight.
const LEVELS = [
  { count: 4, alt: [12000, 16000], length: [190000, 300000], density: 1.15, air: 0.4, drift: 110 },
  { count: 4, alt: [20000, 26000], length: [160000, 260000], density: 0.85, air: 0.25, drift: 150 },
  { count: 3, alt: [30000, 36000], length: [130000, 210000], density: 0.65, air: 0.1, drift: 200 },
];
// The jet band: one long ribbon across Ireland at the middle level. The loose patches keep at
// least BAND_CLEAR_KM (into the screen) from its line.
const BAND = { alt: 22000, length: 720000, density: 1.05, air: 0.25, drift: 150 };
const BAND_ALONG = 20;
const BAND_CLEAR_KM = 110;
// When the cirrus thins away during the flight.
const FADE = [0.42, 0.88];

const SUN = [1.0, 0.985, 0.96]; // lit white
const FIBRE_SHADE = [0.66, 0.73, 0.84]; // the thicker fibres
const SHADOW = [0.2, 0.27, 0.4];
const SHADOW_ALPHA = 0.24;
const HAZE = [0.74, 0.83, 0.9]; // the colour of the air at a distance
// The sun is in the west-south-west, 35 degrees up, so shadows fall towards the
// east-north-east, 1/tan(35) times the height away.
const SHADOW_DIR = [Math.sin((60 * Math.PI) / 180), Math.cos((60 * Math.PI) / 180)];
const SHADOW_REACH = 1 / Math.tan((35 * Math.PI) / 180);

// Per instance: view-space centre (3), half axes along and across (3 + 3), seed, density,
// curl, widen, shadow, air, ripple (0..1), sharp edge (-1/+1 the side to sharpen, 0 none).
const FLOATS = 18;

const smooth = (a, b, t) => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const between = (rand, [a, b]) => a + rand() * (b - a);

// One patch of cirrus in its own frame (metres): x across the screen, y into it.
function cirrus(rand, length, density) {
  const out = [];
  const n = 3 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const l = length * (0.4 + rand() * 0.55);
    out.push({
      x: (rand() - 0.5) * length * 0.5,
      y: (rand() - 0.5) * length * 0.35,
      angle: (rand() - 0.5) * 0.25, // radians off the wind
      halfLength: l / 2,
      halfWidth: l * (0.07 + rand() * 0.07),
      density: (0.5 + rand() * 0.4) * density,
      curl: 0.15 + rand() * 0.45, // how far the ends hook, in strand widths: all the same way
      seed: rand() * 100,
    });
  }
  return out;
}

// The jet band: overlapping strands end to end along the wind, a ribbon with a crisp
// north-western edge and faint ripples across it.
function jetBand(rand, length, density) {
  const out = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const l = length * (0.24 + rand() * 0.08);
    out.push({
      x: (i / (n - 1) - 0.5) * length * 0.82,
      y: (rand() - 0.5) * 18000 + Math.sin(i * 1.3) * 12000, // a gentle meander
      angle: (rand() - 0.5) * 0.08,
      halfLength: l / 2,
      halfWidth: l * (0.11 + rand() * 0.04),
      density: (0.75 + rand() * 0.2) * density,
      curl: 0.05 + rand() * 0.1,
      seed: rand() * 100,
      ripple: 1,
      sharp: 1,
    });
  }
  return out;
}

const VERT = `#version 300 es
in vec2 aCorner;            // -1..1: x along the strand, y across it
in vec3 aCenter;            // view space, metres from the eye
in vec3 aAxisA;             // half extent along (view space)
in vec3 aAxisB;             // half extent across, already widened for the curl
in float aSeed;
in float aDensity;
in float aCurl;
in float aWiden;
in float aShadow;
in float aAir;
in float aRipple;
in float aEdge;
uniform mat4 uProj;
out vec2 vUv;
out float vSeed, vDensity, vCurl, vShadow, vAir, vDist, vRipple, vEdge;
void main() {
  vUv = vec2(aCorner.x, aCorner.y * aWiden);
  vSeed = aSeed; vDensity = aDensity; vCurl = aCurl; vShadow = aShadow; vAir = aAir;
  vRipple = aRipple; vEdge = aEdge;
  vDist = length(aCenter);
  gl_Position = uProj * vec4(aCenter + aAxisA * aCorner.x + aAxisB * aCorner.y, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in float vSeed, vDensity, vCurl, vShadow, vAir, vDist, vRipple, vEdge;
uniform float uAlpha;
uniform vec3 uSun, uFibreShade, uShadowCol, uHaze;
uniform float uShadowAlpha;
uniform vec2 uHazeRange;    // view distances where the haze starts and is thickest
uniform sampler2D uDrawings; // the cirrus drawings (cloud-drawings.js)
out vec4 fragColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 7.7; a *= 0.5; }
  return v;
}

void main() {
  float along = vUv.x;
  // Hook the strand: bend it across, more towards the ends.
  float across = vUv.y - vCurl * along * along * sign(along + 0.0001);
  if (abs(across) >= 1.0) discard;
  // Which drawing (of 8, two across and four down), and where in it.
  float cell = mod(floor(vSeed * 7.31), 8.0);
  // Only well inside the drawing, so its neighbours in the atlas never bleed in (clamped to
  // its edge instead, that repeated a bled-in pixel into straight lines across the view).
  if (abs(along) > 0.97 || abs(across) > 0.94) discard;
  vec2 uv = vec2(along * 0.5 + 0.5, across * 0.5 + 0.5);
  vec4 d = texture(uDrawings, (vec2(mod(cell, 2.0), floor(cell / 2.0)) + uv) / vec2(2.0, 4.0));
  float a = d.a * clamp(vDensity * 1.25, 0.0, 1.0);
  if (a < 0.003) discard;
  // The air: further away and lower down, things go paler, bluer and fainter.
  float haze = clamp(smoothstep(uHazeRange.x, uHazeRange.y, vDist) * 0.35 + vAir * 0.14, 0.0, 0.5);
  if (vShadow > 0.5) {
    float sa = a * uShadowAlpha * (1.0 - haze * 0.6) * uAlpha;
    if (sa < 0.002) discard;
    fragColor = vec4(uShadowCol * sa, sa);
    return;
  }
  vec3 col = d.rgb / max(d.a, 1e-4);   // the drawing's own colour (white, fibres, ink)
  col = mix(col, uHaze, haze);
  a *= (1.0 - haze * 0.25) * uAlpha;
  fragColor = vec4(col * a, a); // premultiplied
}`;

// The cards are drawn into their own texture (once at reduced resolution, now at full), then laid over the scene
// in one pass: the fibre shader is costly and the cards overlap a lot, and on an integrated
// GPU at full resolution (a 2688x1932 canvas) a frame took ~2 s. They're soft, so half
// resolution barely shows; and never more than MAX_PIXELS, however big the canvas.
const SCALE = 1; // the drawings are cheap to show, and their lines need the resolution
const MAX_PIXELS = 2.6e6;
const QUAD = `#version 300 es
out vec2 vUv;
void main() {
  vUv = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
}`;
const COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uClouds;
out vec4 fragColor;
void main() { fragColor = texture(uClouds, vUv); } // premultiplied, laid "over" by the blend`;

export function createClouds({ view, RenderNode, webgl, SpatialReference, heading }) {
  // The drawings, made in a worker while the title card is up.
  let drawings = null;
  const worker = new Worker(new URL("./cloud-drawings.js", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }) => { drawings = data; worker.terminate(); node?.requestRender(); };
  const rand = seeded(4242);
  const rad = (d) => (d * Math.PI) / 180;
  // Screen axes on the ground for the camera heading: "right" across the view, "ahead" into it.
  const right = [Math.sin(rad(heading + 90)), Math.cos(rad(heading + 90))]; // [east, north]
  const ahead = [Math.sin(rad(heading)), Math.cos(rad(heading))];
  const kmToLonLat = (eastKm, northKm) => [eastKm / (111.32 * Math.cos(rad(CENTER[1]))), northKm / KM_PER_DEG_LAT];
  // The jet runs along the screen's "right" axis here (bearing heading + 90, about 67 degrees:
  // west-south-west to east-north-east), so streaks lie along it and drift with it.
  const wind = heading;

  const patches = [{
    strands: jetBand(rand, BAND.length, BAND.density),
    air: BAND.air, across: -60, along: BAND_ALONG, alt: BAND.alt, heading: wind, drift: BAND.drift, lonLat: [0, 0],
  }];
  for (const level of LEVELS) {
    for (let i = 0; i < level.count; i++) {
      // Spread across the sky (the band already gives the middle its weight), two in three
      // within 70% of the patch, and kept off the band so they sit above and below it rather
      // than stacking on it.
      const reach = i % 3 < 2 ? SPREAD_KM * 0.7 : SPREAD_KM;
      let along = (rand() - 0.5) * 2 * reach;
      if (Math.abs(along - BAND_ALONG) < BAND_CLEAR_KM) along = BAND_ALONG + Math.sign(along - BAND_ALONG || 1) * (BAND_CLEAR_KM + rand() * 60);
      patches.push({
        strands: cirrus(rand, between(rand, level.length), level.density),
        air: level.air,
        across: (rand() - 0.5) * 2 * reach - 80, // a little upwind, since it drifts downwind
        along,
        alt: between(rand, level.alt),
        heading: wind + (rand() - 0.5) * 16,
        drift: level.drift * (0.85 + rand() * 0.3),
        lonLat: [0, 0],
      });
    }
  }
  const total = patches.reduce((s, p) => s + p.strands.length, 0) * 2; // each strand and its shadow
  let alpha = 1, pixelShare = 1;
  let onPath = false, fade = FADE;

  // String the patches along the flight: `from` and `to` are the start and end cameras. Each
  // patch takes a point part-way along (between PATH[0] and PATH[1]), at the camera's height
  // there less a little, pushed a little ahead into the view and to one side or the other, so
  // the camera flies through some and past others.
  const PATH = [0.12, 0.7];
  const fitPath = (from, to) => {
    const a = from.position, b = to.position;
    const n = patches.length;
    patches.forEach((c, i) => {
      const f = PATH[0] + ((PATH[1] - PATH[0]) * (i + rand() * 0.6)) / n;
      const lon = a.longitude + (b.longitude - a.longitude) * f, lat = a.latitude + (b.latitude - a.latitude) * f;
      const z = a.z + (b.z - a.z) * f;
      const side = i % 3 === 0 ? 0 : (i % 2 ? 1 : -1) * (25 + rand() * 70); // km; one in three dead ahead
      const fwd = 20 + rand() * 60; // km into the view
      const [dLon, dLat] = kmToLonLat(right[0] * side + ahead[0] * fwd, right[1] * side + ahead[1] * fwd);
      c.base = [lon + dLon, lat + dLat];
      c.alt = z * (0.82 + rand() * 0.12);
      // Smaller than the high cirrus: seen from a few tens of km, these fill the view.
      const k = 0.35 + rand() * 0.15;
      for (const st of c.strands) { st.x *= k; st.y *= k; st.halfLength *= k; st.halfWidth *= k * 1.6; }
    });
    // No jet band on the path: from inside the cloud layer it's a ruled line across the view.
    for (const st of patches[0].strands) st.density = 0;
    onPath = true;
    fade = [0.82, 1.0]; // passed, not thinned away: they go once they're behind the camera
    place(0);
  };

  // move / fade can be switched off for profiling (intro.js, ?debug&perf).
  const place = (t, { move = true, fade = true } = {}) => {
    if (move) for (const c of patches) {
      if (onPath) {
        // On the flight path: only a gentle drift with the wind.
        const [dLon, dLat] = kmToLonLat(right[0] * c.drift * 0.15 * t, right[1] * c.drift * 0.15 * t);
        c.lonLat = [c.base[0] + dLon, c.base[1] + dLat];
        continue;
      }
      // Carried by the jet at a steady pace, higher layers faster.
      const x = c.across + c.drift * t;
      const [dLon, dLat] = kmToLonLat(right[0] * x + ahead[0] * c.along, right[1] * x + ahead[1] * c.along);
      c.lonLat = [CENTER[0] + dLon, CENTER[1] + dLat];
    }
    if (fade) alpha = 1 - smooth(fadeAt()[0], fadeAt()[1], t);
  };
  const fadeAt = () => fade;
  place(0);

  const wgs84 = SpatialReference.WGS84;
  const enu = new Array(16);
  const data = new Float32Array(total * FLOATS), sorted = new Float32Array(total * FLOATS);
  const order = new Uint32Array(total), depth = new Float64Array(total);
  const hazeRange = new Float32Array(2);
  const rot = (V, v) => [V[0] * v[0] + V[4] * v[1] + V[8] * v[2], V[1] * v[0] + V[5] * v[1] + V[9] * v[2], V[2] * v[0] + V[6] * v[1] + V[10] * v[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (a) => { const m = Math.hypot(...a) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };

  // Fill `data` with every strand and its shadow in view space (in doubles, relative to the
  // eye), then copy it into `sorted`, farthest first, for back-to-front blending.
  const update = (V) => {
    let k = 0;
    const put = (center, axisA, axisB, s, widen, shadow, air, edge) => {
      const o = k * FLOATS;
      data.set(center, o);
      data.set(axisA, o + 3);
      data.set(axisB, o + 6);
      data[o + 9] = s.seed;
      data[o + 10] = s.density;
      data[o + 11] = s.curl;
      data[o + 12] = widen;
      data[o + 13] = shadow;
      data[o + 14] = air;
      data[o + 15] = s.ripple || 0;
      data[o + 16] = edge;
      depth[k] = center[2] - shadow * 1e9; // shadows lie on the ground, under everything: first
      order[k] = k;
      k++;
    };
    for (const c of patches) {
      webgl.renderCoordinateTransformAt(view, [c.lonLat[0], c.lonLat[1], c.alt], wgs84, enu);
      // The patch's east, north and up directions and its origin, in view space.
      const eV = rot(V, [enu[0], enu[1], enu[2]]), nV = rot(V, [enu[4], enu[5], enu[6]]), uV = rot(V, [enu[8], enu[9], enu[10]]);
      const oV = [0, 1, 2].map((i) => V[i] * enu[12] + V[4 + i] * enu[13] + V[8 + i] * enu[14] + V[12 + i]);
      const at = (e, n, u) => [0, 1, 2].map((i) => oV[i] + eV[i] * e + nV[i] * n + uV[i] * u);
      const h = rad(c.heading), cos = Math.cos(h), sin = Math.sin(h);
      // Shadows fall as from cirrus height at most: from the flight path, hundreds of km up,
      // they'd land far off the island.
      const reach = Math.min(c.alt, 36000) * SHADOW_REACH;
      const northWest = unit([0, 1, 2].map((i) => nV[i] - eV[i])); // in view space
      // Which way across a strand faces north-west: that's the side a jet band keeps crisp.
      const edgeSide = (s, across) => (s.sharp ? (across.reduce((m, v, i) => m + v * northWest[i], 0) > 0 ? 1 : -1) : 0);
      for (const s of c.strands) {
        const east = s.x * cos + s.y * sin, north = -s.x * sin + s.y * cos;
        // The strand's own direction: across the screen, turned a little off the wind.
        const hs = h + s.angle, de = Math.cos(hs), dn = -Math.sin(hs);
        const dir = [0, 1, 2].map((i) => eV[i] * de + nV[i] * dn);
        const widen = 1 + Math.abs(s.curl);
        const along = dir.map((v) => v * s.halfLength);
        const centre = at(east, north, 0);
        const ground = at(east + SHADOW_DIR[0] * reach, north + SHADOW_DIR[1] * reach, -c.alt);
        // Across the strand: in the sky, square to the line of sight so it never goes
        // edge-on; on the ground, flat.
        const groundAcross = unit(cross(uV, dir)).map((v) => v * s.halfWidth * widen);
        const skyAcross = unit(cross(dir, unit(centre))).map((v) => v * s.halfWidth * widen);
        // No shadows on the flight path: the clouds are hundreds of km up, and a shadow card that
        // far below, seen from beside the cloud, drew as a line hanging from it.
        put(ground, along, groundAcross, onPath ? { ...s, density: 0 } : s, widen, 1, c.air, edgeSide(s, groundAcross));
        // Seen end-on (pointing along the line of sight), a strand collapses to a sliver, a
        // line across the view: fade it out as it turns that way.
        const toEye = unit(centre), dirU = unit(dir);
        const side = Math.hypot(...cross(dirU, toEye));   // 1 broadside, 0 end-on
        // Flying into it: thinned away as the camera closes, so the drawing (and its outline,
        // magnified ever thicker) dissolves around the camera rather than smearing over the view.
        const near = smooth(0.45, 1.4, Math.hypot(...centre) / s.halfLength);
        const facing = smooth(0.35, 0.65, side) * near;
        put(centre, along, skyAcross, facing < 1 ? { ...s, density: s.density * facing } : s, widen, 0, c.air, edgeSide(s, skyAcross));
      }
    }
    order.sort((a, b) => depth[a] - depth[b]); // most negative z (farthest) first
    for (let i = 0; i < total; i++) sorted.set(data.subarray(order[i] * FLOATS, order[i] * FLOATS + FLOATS), i * FLOATS);

    // How far the haze reaches, from the middle of the patch of sky.
    webgl.renderCoordinateTransformAt(view, [CENTER[0], CENTER[1], 0], wgs84, enu);
    const mid = [0, 1, 2].map((i) => V[i] * enu[12] + V[4 + i] * enu[13] + V[8 + i] * enu[14] + V[12 + i]);
    const d = Math.hypot(...mid);
    hazeRange.set([d * 0.7, d * 1.6]);
  };

  const CloudNode = RenderNode.createSubclass({
    // Drawn over the finished scene, with no depth test: the cirrus hangs 40-112 km up, above
    // everything else in it (the swans fly at 9 km), so whatever is drawn it's in front.
    // The shadows go first, under the cloud, so they still darken what's on the ground.
    consumes: { required: ["final-color"] },
    produces: "final-color",

    // GL resources are made on the first frame: the context isn't there yet when the node is built.
    setup(gl) {
      const shader = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const link = (vs, fs) => {
        const p = gl.createProgram();
        gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
        gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        return p;
      };
      const prog = link(VERT, FRAG);
      this.prog = prog;
      this.composite = link(QUAD, COMPOSITE);
      this.uClouds = gl.getUniformLocation(this.composite, "uClouds");
      this.quadVao = gl.createVertexArray(); // the full-screen triangle comes from gl_VertexID
      this.target = gl.createTexture();
      this.fbo = gl.createFramebuffer();
      this.size = [0, 0];
      this.loc = Object.fromEntries(["uProj", "uAlpha", "uSun", "uFibreShade", "uShadowCol", "uShadowAlpha", "uHaze", "uHazeRange", "uDrawings"]
        .map((n) => [n, gl.getUniformLocation(prog, n)]));
      const attr = (n) => gl.getAttribLocation(prog, n);

      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      this.cornerBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(attr("aCorner"));
      gl.vertexAttribPointer(attr("aCorner"), 2, gl.FLOAT, false, 0, 0);

      this.instanceBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
      gl.bufferData(gl.ARRAY_BUFFER, sorted.byteLength, gl.DYNAMIC_DRAW);
      const stride = FLOATS * 4;
      let offset = 0;
      for (const [name, size] of [["aCenter", 3], ["aAxisA", 3], ["aAxisB", 3], ["aSeed", 1], ["aDensity", 1], ["aCurl", 1], ["aWiden", 1], ["aShadow", 1], ["aAir", 1], ["aRipple", 1], ["aEdge", 1]]) {
        const l = attr(name);
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride, offset);
        gl.vertexAttribDivisor(l, 1);
        offset += size * 4;
      }
      gl.bindVertexArray(null);
    },

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
      gl.bindTexture(gl.TEXTURE_2D, null);
    },

    render() {
      const output = this.bindRenderTarget();
      if (alpha <= 0.001 || (!drawings && !this.drawingsTex)) return output;
      const gl = this.gl;
      if (!this.prog) this.setup(gl);
      update(this.camera.viewMatrix);
      const [, , W, H] = gl.getParameter(gl.VIEWPORT);
      const k = Math.min(SCALE, Math.sqrt((MAX_PIXELS * pixelShare) / (W * H)));
      const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
      this.resize(gl, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(this.prog);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const L = this.loc;
      gl.uniformMatrix4fv(L.uProj, false, this.camera.projectionMatrix);
      gl.uniform1f(L.uAlpha, alpha);
      gl.uniform3fv(L.uSun, SUN);
      gl.uniform3fv(L.uFibreShade, FIBRE_SHADE);
      gl.uniform3fv(L.uShadowCol, SHADOW);
      gl.uniform1f(L.uShadowAlpha, SHADOW_ALPHA);
      gl.uniform3fv(L.uHaze, HAZE);
      gl.uniform2fv(L.uHazeRange, hazeRange);
      if (drawings && !this.drawingsTex) {
        this.drawingsTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.drawingsTex);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, drawings.width, drawings.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, drawings.data);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 3); // smaller levels blur the drawings into each other
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        drawings = null;
      }
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.drawingsTex);
      gl.uniform1i(L.uDrawings, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, sorted);
      gl.bindVertexArray(this.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, total);

      // Over the scene, keeping the scene's own alpha.
      this.bindRenderTarget();
      gl.viewport(0, 0, W, H);
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
      gl.useProgram(this.composite);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.target);
      gl.uniform1i(this.uClouds, 0);
      gl.bindVertexArray(this.quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(null);
      this.resetWebGLState();
      this.requestRender(); // keep drawing every frame while the clouds are up
      return output;
    },

    dispose() {
      const gl = this.gl;
      if (!gl) return;
      if (this.vao) gl.deleteVertexArray(this.vao);
      [this.cornerBuf, this.instanceBuf].forEach((b) => b && gl.deleteBuffer(b));
      if (this.prog) gl.deleteProgram(this.prog);
      if (this.composite) gl.deleteProgram(this.composite);
      if (this.quadVao) gl.deleteVertexArray(this.quadVao);
      if (this.target) gl.deleteTexture(this.target);
      if (this.fbo) gl.deleteFramebuffer(this.fbo);
    },
  });

  const node = new CloudNode({ view });
  return {
    place,
    fitPath,
    degrade: () => { pixelShare /= 3; },
    destroy: () => {
      try { node.dispose(); } catch { /* context already gone */ }
      node.destroy();
    },
  };
}
