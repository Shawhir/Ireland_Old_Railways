import { buildGeoJSON, OVERPASS_QUERY, OVERPASS_URL } from "./ohm.js";
import { fetchIrelandOutline, fetchBritainOutline } from "./outline.js";
import { setupFindings } from "./findings.js";
import { createRailLines, FIRST_RAILWAY_YEAR } from "./lines3d.js";
import { createTownColumns } from "./towns3d.js";
import { createSwans } from "./swans.js";
import { flyIn } from "./intro.js";
import { createClouds } from "./clouds3d.js";
import { createSea } from "./sea3d.js";
import { createCountyNames, createShireNames } from "./counties.js";
import { createWater } from "./water.js";
import { createRelief } from "./hachures.js";
import { createPlaces } from "./places.js";
import { createSeaNames } from "./seas.js";
import { createLostLand } from "./lostland.js";
import { createCoastInk } from "./coastink.js";
import { createFuture } from "./future.js";

// The map is drawn at most MAX_MAP_DPR device pixels per CSS pixel. At 2x every full-screen pass
// (the map itself, the scorch, sea, coast ink, hachures and lines) shades four pixels for each
// one on screen, and the GPU, not our code, was what held frames back; at 1.5x that's 44% fewer
// pixels and the map, all soft ink and paper, looks the same. ArcGIS sizes its canvas from
// window.devicePixelRatio when the view is made, so that's what's capped (before the view is
// made, below); the page's own text and panels are drawn by the browser at full sharpness.
// ?fullres draws the map at the screen's full resolution.
const MAX_MAP_DPR = 1.5;
// ?video (for screen recordings): the UI this much larger, or by ?video=<factor> (styles.css, body.video).
const VIDEO_UI_ZOOM = Math.min(3, Math.max(1, +new URLSearchParams(location.search).get("video") || 1.45));
if (!new URLSearchParams(location.search).has("fullres") && window.devicePixelRatio > MAX_MAP_DPR) {
  const real = Object.getOwnPropertyDescriptor(Window.prototype, "devicePixelRatio")
    || Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
  try {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      get: () => Math.min(MAX_MAP_DPR, real?.get ? real.get.call(window) : MAX_MAP_DPR),
    });
  } catch (err) { console.warn("Couldn't cap the map's resolution.", err); }
}

// The freight ports FINDINGS.md names.
const PORTS = [
  { name: "Dublin Port", lon: -6.205, lat: 53.348 },
  { name: "Belfast Harbour", lon: -5.905, lat: 54.62 },
  { name: "Waterford (Belview)", lon: -7.04, lat: 52.262 },
  { name: "Foynes", lon: -9.11, lat: 52.613 },
];

// The map's colours, after the 1920 Railway Clearing House map of Ireland: lines in its
// engraver's inks on cream paper, with a pale green sea. The lines are drawn as that map drew
// them (ink edges round bars of colour and paper, lines3d.js): the railway still running today in
// blue, the railway since lost in red. Checked against the land: every mark at least 3:1, and red
// and blue far apart for colour blindness. (Match --line-kept and --line-lost in styles.css.)
const COLORS = { current: "#2c4d85", open_then: "#b5332a", closed: "#86704f", unknown: "#948263", town: "#2f5e48", building: "#efe6cf", roof: "#55585e" }; // the towns' paper buildings: beige like the map, light walls lit a little darker by the sun, outlined in the slate of their roofs
const SEA_COLOR = "#cddcc8"; // the map's green sea wash (also covers Britain, so it just disappears)
// The living sea's colours (sea3d.js). The old map shades its sea deepest along the coast and
// paler out to sea, so here the inshore water is the darker green and the open sea the paler;
// the sky it reflects is a pale green-grey. It fades into the flat SEA_COLOR at its edges.
const SEA_LOOK = { shallow: "#a6c3a3", deep: "#d3e1ce", skyLow: "#e8eee2", skyHigh: "#c6d8c2", flat: SEA_COLOR, ink: "#3a3a32" };
const LAND = { color: "#f5f1e3", opacity: 1 }; // cream paper, wholly over the grey basemap's land:
// its tiles have county and town names printed in, which showed through faintly as duplicates
const ALTITUDE_MAX = 2500000;
const SHOW_COUNTIES = true; // Ireland's county names (counties.js)
const SHOW_SHIRES = false; // Britain's shire names in the opening: off for now
const SHOW_LANDMARKS = false; // the 3D landmark models are switched off for now (landmarks.js)
const TILT = 0; // the home view looks straight down, north up, the whole island beside the panel
const HEADING = 0;
// The opening starts tilted and turned (the south close, the north receding, looking
// north-northwest) and straightens into the home view as it comes down.
const START_TILT = 33, START_HEADING = 337;

// The camera `dist` metres from a point on the ground, looking at it with the given tilt and
// heading (ArcGIS's, at the camera), worked out on the globe's sphere. Moving the view to a
// camera is immediate; asked for a centre and scale instead, ArcGIS waits on the map's loading
// (measured 1-10 s a move on a slow connection), and fitting the home view takes seven moves.
const R_EARTH = 6378137, RAD = Math.PI / 180;
function cameraLooking([lon, lat], dist, tilt = TILT, heading = HEADING) {
  const t = tilt * RAD, p1 = lat * RAD, l1 = lon * RAD;
  const r = dist * Math.cos(t) + Math.sqrt(R_EARTH ** 2 - (dist * Math.sin(t)) ** 2);
  const ang = Math.asin((dist * Math.sin(t)) / R_EARTH); // round the globe, target to camera
  // Behind the target; the bearing is nudged until the camera's own heading (which differs
  // from the target's over a few hundred km) comes out right.
  let b = heading + 180, p2 = p1, l2 = l1;
  for (let i = 0; i < 4; i++) {
    p2 = Math.asin(Math.sin(p1) * Math.cos(ang) + Math.cos(p1) * Math.sin(ang) * Math.cos(b * RAD));
    l2 = l1 + Math.atan2(Math.sin(b * RAD) * Math.sin(ang) * Math.cos(p1), Math.cos(ang) - Math.sin(p1) * Math.sin(p2));
    const at = Math.atan2(Math.sin(l1 - l2) * Math.cos(p1), Math.cos(p2) * Math.sin(p1) - Math.sin(p2) * Math.cos(p1) * Math.cos(l1 - l2)) / RAD;
    b += ((heading - at + 540) % 360) - 180;
  }
  return { position: { longitude: l2 / RAD, latitude: p2 / RAD, z: r - R_EARTH }, tilt, heading };
}
const STATUS_LABEL = { current: "In use", closed: "Closed" };

const $ = (id) => document.getElementById(id);
const amd = (mods) => new Promise((resolve, reject) => window.require(mods, (...m) => resolve(m), reject));
const setStatus = (msg, isError = false) => {
  $("status").textContent = msg;
  $("status").classList.toggle("error", isError);
};

async function loadData() {
  try {
    const res = await fetch("data/rail.geojson");
    if (res.ok) return withNames(await res.json());
  } catch { /* no local file (or opened from file://) */ }
  setStatus("No local data file, asking OpenHistoricalMap's Overpass API (can take a minute)…");
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(OVERPASS_QUERY),
  });
  if (!res.ok) throw new Error(`Overpass returned ${res.status}`);
  return buildGeoJSON(await res.json());
}

// The outlines saved by scripts/fetch-data.mjs, or the live service if they're missing.
async function loadOutline(file, fetchLive) {
  try {
    const res = await fetch(file);
    if (res.ok) return await res.json();
  } catch { /* fall back to the live service */ }
  return fetchLive();
}

// A world-sized polygon with the island cut out of it. When Britain's outline is given, it's cut
// out too and returned separately, so the opening flight can show it and then cover it with sea.
//
// No margin: the outline follows the basemap's coast to about 50 m (outline.js), and buffering
// it with the geometry engine took ~28 s on the detailed coast, freezing the page. The island's
// polygons are merged (~0.3 s, under the title card): the Republic and Northern Ireland are
// simplified separately, so their shared border no longer lines up, and the slivers between
// them showed the grey basemap. Britain's rings are used as they are. Esri wants outer rings
// clockwise and holes anticlockwise (GeoJSON is the other way round), so each ring is turned.
const ringArea = (ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[i][0] - ring[j][0]) * (ring[i][1] + ring[j][1]);
  return a / 2; // positive when clockwise
};
const clockwise = (ring, cw) => ((ringArea(ring) > 0) === cw ? ring : [...ring].reverse());
function maskAround(outline, britainOutline, { Polygon, geometryEngine }) {
  const sr = { wkid: 4326 };
  const polygons = (o) => o.geometry.coordinates.map(([outer, ...lakes]) => new Polygon({
    rings: [clockwise(outer, true), ...lakes.map((r) => clockwise(r, false))],
    spatialReference: sr,
  }));
  const island = geometryEngine.union(polygons(outline));
  const britain = britainOutline ? new Polygon({ rings: polygons(britainOutline).flatMap((p) => p.rings), spatialReference: sr }) : null;
  // The sea is the world with each landmass's outer ring cut out (lakes stay land). Once the
  // opening has landed, Britain is no longer needed, and the island's sea alone takes over.
  const world = clockwise([[-179.9, -85], [-179.9, 85], [179.9, 85], [179.9, -85], [-179.9, -85]], true);
  const seaAround = (...lands) => new Polygon({
    rings: [world, ...lands.filter(Boolean).flatMap((p) => p.rings.filter((r) => ringArea(r) > 0).map((r) => clockwise(r, false)))],
    spatialReference: sr,
  });
  return { island, mask: seaAround(island, britain), islandMask: seaAround(island), britain };
}

// Which class a line falls in for a given year. Mirrors setState in lines3d.js.
function classify(p, year) {
  if (p.opened_year ? p.opened_year > year : year < FIRST_RAILWAY_YEAR) return "notyet";
  if (p.status === "current") return "current";
  if (!p.closed_year) return "unknown";
  return p.closed_year > year ? "open_then" : "closed";
}

function updateStats(features, year) {
  const km = { current: 0, open_then: 0, closed: 0, unknown: 0, notyet: 0 };
  for (const f of features) km[classify(f.properties, year)] += f.properties.km;
  const fmt = (n) => `${Math.round(n).toLocaleString()} km`;
  $("kmOpen").textContent = fmt(km.current + km.open_then);
  $("kmClosed").textContent = fmt(km.closed);
  // (Closed lines with no closure date add up to 0.2 km, so they no longer get a box of their own.)
}

// Towns and villages near a closed line and no open one (built by analysis/estimate.mjs).
async function loadTowns() {
  try {
    const [towns, impact] = await Promise.all(
      ["data/lost-towns.geojson", "data/impact.json"].map((u) => fetch(u).then((r) => (r.ok ? r.json() : null))),
    );
    return towns && impact ? { towns, impact } : null;
  } catch {
    return null;
  }
}

// A town that lost its railway, as a ticket to it that can no longer be bought: its name, a plum
// band with the year the line went, and the town now.
function townPopup({ graphic }) {
  const a = graphic.attributes;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const pop = a.pop_assumed ? `about ${a.pop.toLocaleString()}` : a.pop.toLocaleString();
  const now = a.open_line_km ? `${a.open_line_km.toFixed(0)} km to a line in use` : "Freight only";
  const serial = String(Math.round((a.lon || 0) * 1e4 + (a.lat || 0) * 1e3)).replace("-", "").slice(-5).padStart(5, "0");
  return `<div class="ticket ticket--town">
    <div class="ticket-top"><span class="ticket-co">Irish Railways</span><span class="ticket-no">${serial}</span></div>
    <div class="ticket-route"><span class="ticket-label">To</span><span class="ticket-place">${esc(a.name)}</span></div>
    <div class="ticket-band">${a.closed_year ? `No trains since ${a.closed_year}` : "No trains, date not recorded"}</div>
    <dl class="ticket-facts">
      <div><dt>People today</dt><dd>${pop}</dd></div>
      <div><dt>Now</dt><dd>${esc(now)}</dd></div>
      <div><dt>Area</dt><dd>${a.belt ? `${esc(a.belt)} belt` : "Regional"}</dd></div>
    </dl>
  </div>`;
}

// Each section's name, from data/line-names.json (scripts/name-lines.mjs): the places at its ends,
// and the line's own name where the data has one.
async function withNames(geojson) {
  try {
    const res = await fetch("data/line-names.json");
    if (res.ok) {
      const names = await res.json();
      for (const f of geojson.features) {
        const n = names[f.properties.oid];
        if (n) Object.assign(f.properties, { from: n.from, to: n.to, line_name: n.name || null });
      }
    }
  } catch { /* no names: the popups say "Railway section" */ }
  return geojson;
}

// A line's details as a railway ticket of the time (an Edmondson card): the company across the
// top, FROM and TO in heavy capitals, a band in the line's colour on the map saying how it stands,
// the dates in small type, and a serial number in red.
function popupContent({ graphic }) {
  const a = graphic.attributes;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const state = a.status === "current" ? "current" : a.closed_year ? "closed" : "unknown";
  const band = { current: "In use today", closed: `Closed ${a.closed_year}`, unknown: "Closed, date not recorded" }[state];
  const fact = (k, v) => (v ? `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>` : "");
  const serial = String(a.way_id || a.oid || 0).slice(-5).padStart(5, "0");
  return `<div class="ticket ticket--${state}">
    <div class="ticket-top"><span class="ticket-co">${esc(a.operator || "Irish Railways")}</span><span class="ticket-no">${serial}</span></div>
    ${a.line_name ? `<div class="ticket-line">${esc(a.line_name)}</div>` : ""}
    <div class="ticket-route">
      <span class="ticket-label">From</span><span class="ticket-place">${esc(a.from || "—")}</span>
      <span class="ticket-label">To</span><span class="ticket-place">${esc(a.to || "—")}</span>
    </div>
    <div class="ticket-band">${band}</div>
    <dl class="ticket-facts">
      ${fact("Opened", a.opened_year || "not recorded")}
      ${fact("Length", a.km ? `${a.km.toFixed(1)} km` : "")}
      ${fact("Gauge", a.gauge)}
    </dl>
    <div class="ticket-foot"><a class="ticket-src" href="https://www.openhistoricalmap.org/way/${esc(a.way_id)}" target="_blank" rel="noopener">OpenHistoricalMap way ${esc(a.way_id)}</a><a class="ticket-zoom" href="#" data-ticket-zoom>Zoom to</a></div>
  </div>`;
}

async function main() {
  const [esriConfig, Map, SceneView, Basemap, TileLayer, GraphicsLayer, FeatureLayer, Graphic, Point, Polygon, geometryEngine,
    SpatialReference, RenderNode, webgl] =
    await amd([
      "esri/config", "esri/Map", "esri/views/SceneView", "esri/Basemap",
      "esri/layers/TileLayer", "esri/layers/GraphicsLayer", "esri/layers/FeatureLayer",
      "esri/Graphic", "esri/geometry/Point", "esri/geometry/Polygon", "esri/geometry/geometryEngine",
      "esri/geometry/SpatialReference", "esri/views/3d/webgl/RenderNode", "esri/views/3d/webgl",
    ]);

  const apiKey = window.APP_CONFIG?.apiKey;
  let basemap;
  if (apiKey) {
    esriConfig.apiKey = apiKey;
    basemap = "gray-vector";
  } else {
    basemap = new Basemap({
      baseLayers: [new TileLayer({
        url: "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer",
      })],
    });
  }

  // No terrain until the opening lands: with it, every instant camera move asks the elevation
  // service for the ground height first (over a second each on a slow connection), and fitting
  // the home view makes seven. At the opening's country scale the relief doesn't show anyway.
  const map = new Map({ basemap });
  const view = new SceneView({
    container: "viewDiv",
    map,
    // "high": on the default "medium" profile the scene switched between full and half
    // resolution from frame to frame, so the inked coast, the lines and the text halos swelled
    // and thinned. "high" keeps it at full resolution.
    qualityProfile: "high",
    camera: { position: { longitude: -7.9, latitude: 49.6, z: 420000 }, tilt: START_TILT, heading: START_HEADING },
    constraints: { altitude: { min: 2000, max: ALTITUDE_MAX } },
    environment: {
      background: { type: "color", color: SEA_COLOR },
      starsEnabled: false,
      atmosphereEnabled: false,
      lighting: { type: "virtual" },
    },
    popup: { dockEnabled: false },
  });
  // The tilted overview, with Kerry bottom-left and Antrim top-right. In a tilted 3D view,
  // scale doesn't map neatly onto screen size, so measure instead: project the island's
  // outline onto the screen and adjust distance and centre until it fills HOME_FILL of the
  // map area beside the panel.
  //
  // Measuring moves the camera (several instant jumps), so it's done once, at load, under the
  // opening's title card. After that, when the map area changes (a drawer opens or closes, the
  // window is resized), the framing is worked out from that fit without touching the camera, and
  // the camera glides there in one move: the island's size on screen scales with the window's
  // height (the camera's field of view is vertical), and the fit says how big it was.
  const HOME_FILL = 0.93;
  let outlinePoints = []; // sampled from the island outline once the mask is built
  let homeFit = null; // { height, center, dist, box: [w, h] of the island on screen at that distance }
  const mapArea = () => {
    const pad = view.padding;
    return [view.width - (pad.left || 0) - (pad.right || 0), view.height - (pad.top || 0) - (pad.bottom || 0)];
  };
  const islandBox = () => {
    const pts = outlinePoints.map((p) => view.toScreen(p)).filter(Boolean);
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return pts.length ? [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)] : null;
  };
  const fitHome = async () => {
    let center = [-7.95, 53.2], dist = 700000;
    for (let i = 0; i < 6; i++) {
      await view.goTo(cameraLooking(center, dist), { animate: false });
      const pts = outlinePoints.map((p) => view.toScreen(p)).filter(Boolean);
      if (!pts.length) break;
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const [w, h] = mapArea();
      // Each step is bounded, so a first guess that puts part of the island past the horizon
      // (a short map area above the phone panel) can't send the fit off round the globe.
      const ratio = Math.max((x1 - x0) / w, (y1 - y0) / h) / HOME_FILL;
      dist *= Math.min(2.5, Math.max(0.4, ratio || 1));
      // Look at whatever is under the middle of the island's on-screen box, if that's still
      // near Ireland.
      const mid = view.toMap({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 });
      if (mid && Math.abs(mid.longitude + 7.9) < 6 && Math.abs(mid.latitude - 53.4) < 5) center = [mid.longitude, mid.latitude];
    }
    await view.goTo(cameraLooking(center, dist), { animate: false });
    homeFit = { height: view.height, center, dist, box: islandBox() || mapArea() };
  };
  // Home for the map area as it is now: scaled so the island's on-screen box fills HOME_FILL of
  // whatever area the window, panel and drawers leave. `far` pulls it back and `start` tilts and
  // turns it, for the opening's start.
  const homeTarget = async (far = 1, start = false) => {
    if (!homeFit) await fitHome();
    const [w, h] = mapArea();
    const grow = view.height / homeFit.height;
    const [bw, bh] = homeFit.box.map((b) => b * grow);
    const k = Math.max(bw / (w * HOME_FILL), bh / (h * HOME_FILL));
    return cameraLooking(homeFit.center, homeFit.dist * k * far, start ? START_TILT : TILT, start ? START_HEADING : HEADING);
  };
  const goHome = async (options) => view.goTo(await homeTarget(), options);
  // The map's only button, top left: back to the whole island as it opens. ArcGIS's own (zoom,
  // pan/rotate, compass) are gone: the mouse, touch and keys still do all of that.
  view.ui.components = ["attribution"];
  {
    const home = document.createElement("button");
    home.type = "button";
    home.className = "home-btn";
    home.title = "Back to the whole island";
    home.setAttribute("aria-label", "Back to the whole island");
    home.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M3.5 11.2 12 4l8.5 7.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6 10v9.5h4.6v-5.2h2.8v5.2H18V10" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>`;
    home.addEventListener("click", () => { goHome({ duration: 1600, easing: "in-out-cubic" }).catch(() => {}); });
    view.ui.add(home, "top-left");
  }
  // Keep the island clear of the panel (beside it on wide screens, above it on phones)
  // and of the story or findings drawer when it's open. Below PANEL_ASIDE_W, a drawer and the
  // panel together would leave the map a sliver (179 px at 941 px wide), so the panel steps
  // aside while a drawer is open (styles.css does the same) and the map gets its space.
  const PANEL_ASIDE_W = 1280;
  // ?video draws the panel, drawers and tickets larger (styles.css, body.video), by this much.
  const UI_ZOOM = new URLSearchParams(location.search).has("video") ? VIDEO_UI_ZOOM : 1;
  const padForPanel = () => {
    const wide = view.width > 600;
    const drawerOpen = ["findings-open", "story-open"].some((c) => document.body.classList.contains(c));
    // Room for the open drawer: the story's 360 px window, or the findings' 330 px one (+ margins).
    const drawer = !wide || !drawerOpen ? 0 : (document.body.classList.contains("story-open") ? 392 : 362) * UI_ZOOM;
    const panel = drawerOpen && view.width < PANEL_ASIDE_W * UI_ZOOM ? 0 : 330 * UI_ZOOM;
    // On a phone the panel, or the story or findings sheet when one is open, sits along the bottom.
    const sheet = !drawerOpen ? $("panel") : document.getElementById(document.body.classList.contains("story-open") ? "story" : "findings");
    view.padding = wide ? { right: panel, left: drawer } : { bottom: (sheet?.offsetHeight || 0) + 16 };
    // (The map's own padding already moves its buttons clear of a drawer; adding the drawer here
    // too pushed the home button twice as far, out into the middle of the map.)
    view.ui.padding = { top: 15, right: 15, bottom: 15, left: 15 };
  };
  padForPanel();
  view.watch("width", padForPanel);

  let islandExtent = null;
  let homeReady = Promise.resolve();
  let relabel = () => {}; // set once the map is built: lays out newly added labels
  // Layers that fade in as the opening lands, in step with Britain fading out (the railways:
  // they're made once the data loads, which can be mid-flight, so they join this list then).
  let landed = 0;
  const landWith = [];
  try {
    const [outline, britainOutline] = await Promise.all([
      loadOutline("data/ireland.geojson", fetchIrelandOutline),
      loadOutline("data/britain.geojson", fetchBritainOutline).catch((err) => { console.warn("No Britain outline, so the opening starts with it under sea.", err); return null; }),
    ]);
    const { island, mask, islandMask, britain } = maskAround(outline, britainOutline, { Polygon, geometryEngine });
    // While the camera flies in, the sea is a flat fill (moving water over most of the screen
    // slowed the flight). Once it lands, the living sea (sea3d.js) fades in over it.
    const flatSea = { type: "simple-fill", color: SEA_COLOR, outline: { width: 0 } };
    // Once landed, an outline in the same colour runs a pixel under the land's edge so the grey
    // basemap can't show through the anti-aliased seam between the two. Not during the flight:
    // outlines on draped fills are redrawn for every tile as the camera zooms, and it hitched.
    const seamedSea = { ...flatSea, outline: { color: SEA_COLOR, width: 1.5 } };
    const seaFill = new Graphic({ geometry: mask, symbol: flatSea });
    map.add(new GraphicsLayer({ title: "Mask", listMode: "hide", graphics: [seaFill] }));
    // Warm the grey basemap's land to limestone, Britain included for the opening. Partly see-
    // through, so the basemap's own coastline and county lines still show.
    const landFill = { type: "simple-fill", color: LAND.color, outline: { width: 0 } };
    const britainLand = britain && new Graphic({ geometry: britain, symbol: landFill });
    const landLayer = new GraphicsLayer({
      title: "Land", listMode: "hide", opacity: LAND.opacity,
      graphics: [new Graphic({ geometry: island, symbol: landFill }), britainLand].filter(Boolean),
    });
    map.add(landLayer);
    // The hills' hachures from the start of the opening (hachures.js draws them with our own
    // WebGL, so they cost the flight nothing), just over the land.
    let reliefNow = null;
    const reliefReady = createRelief({ GraphicsLayer, FeatureLayer, Graphic, view, RenderNode, webgl, SpatialReference })
      .then((relief) => { map.add(relief.strokes, map.layers.indexOf(landLayer) + 1); reliefNow = relief; relief.setBritain(1 - landed); return relief; })
      .catch((err) => { console.warn("No hachures.", err); return null; });
    // Both coasts inked from the start of the opening (coastink.js): Britain's goes as Britain
    // does, Ireland's hands over to the sea's own inked coast once that has faded in.
    const coastInk = createCoastInk({ view, RenderNode, webgl, SpatialReference, islands: [island, britain] });
    // County names, spaced out in pale roman capitals as on the 1920 map, shown once landed (text
    // can't fade: ArcGIS doesn't apply layer opacity to 3D text). They keep their size on screen,
    // so on a narrow map (a phone) they'd crowd the island out, and stay hidden there.
    // Labels only lay out when the camera moves, so a name layer added to a still map shows
    // nothing: its layer view stays "updating" until the camera moves. So once a layer's view is
    // made, the camera is nudged by a hair each second while any of those views is still updating,
    // and twice more once they've settled (a layer's features can land well after its view). Never
    // while someone is moving the map, so a nudge can't cut their gesture short.
    // Every name layer (counties, peaks, towns) goes through this, as they arrive at different times.
    let sign = 1;
    const nudge = () => {
      if (view.interacting || view.animation) return;
      const c = view.camera.clone();
      c.heading += 0.001 * (sign = -sign); // back and forth, so the view never drifts
      view.goTo(c, { animate: false }).catch(() => {});
    };
    // A page loaded in a background tab doesn't draw, so its labels wait for the tab to be shown:
    // then all the name layers are laid out again.
    const named = new Set();
    document.addEventListener("visibilitychange", () => { if (!document.hidden && named.size) relabel([...named]); });
    relabel = async (layers) => {
      for (const layer of layers) named.add(layer);
      const views = await Promise.all(layers.map((layer) => view.whenLayerView(layer)));
      for (let tries = 0, calm = 0; tries < 60 && calm < 3; tries++) {
        nudge();
        await new Promise((r) => setTimeout(r, 1000));
        calm = views.some((lv) => lv.updating) ? 0 : calm + 1;
      }
    };
    const counties = createCountyNames({ GraphicsLayer, Graphic });
    // In with the panel and the railway lines, once the opening has landed (text can't fade, so
    // they appear a little way into that fade).
    let countiesLanded = false;
    const countiesFit = () => { for (const layer of counties) layer.visible = countiesLanded && view.width >= 700; };
    countiesFit();
    if (SHOW_COUNTIES) map.addMany(counties);
    const shires = SHOW_SHIRES && britain ? createShireNames({ GraphicsLayer, Graphic }) : null;
    if (shires) { shires.visible = view.width >= 700; map.add(shires); }
    view.watch("width", countiesFit);
    // Britain gets its own sea, which the opening fades in (intro.js) so Britain disappears.
    const britainSea = britain && new GraphicsLayer({ title: "Britain mask", listMode: "hide", opacity: 0, graphics: [new Graphic({ geometry: britain, symbol: flatSea })] });
    if (britainSea) map.add(britainSea);
    // The sea as the 1920 map draws it (ink coast, green shading, water lines). ?sea=living for
    // the moving sea instead, ?sea=flat for the flat fill alone.
    const seaParam = new URLSearchParams(location.search).get("sea");
    const livingSea = seaParam === "flat" ? null
      : createSea({ view, RenderNode, webgl, SpatialReference, outline, colors: SEA_LOOK, look: seaParam === "living" ? "living" : "map" });
    // Clouds the opening flight drops through, drawn with our own WebGL; removed once it lands.
    // By default the volumetric cirrus (volclouds.js), outlined as on old maps. ?clouds=drawn
    // for the drawn cirrus cards on the flight path (clouds3d.js), ?vol for volumetric cumulus.
    const params = new URLSearchParams(location.search);
    const vol = params.get("clouds") === "drawn" ? null : params.has("vol") ? params.get("vol") || "cumulus" : "cirrus";
    const clouds = vol !== null
      ? (await import("./volclouds.js")).createVolumeClouds({ view, RenderNode, webgl, SpatialReference, kind: vol })
      : createClouds({ view, RenderNode, webgl, SpatialReference, heading: START_HEADING });
    islandExtent = island.extent.clone().expand(1.05);
    island.rings.forEach((ring, r) => {
      for (let i = 0; i < ring.length; i += 4) outlinePoints.push(island.getPoint(r, i));
    });
    homeReady = view.when(() => flyIn({
      view, goHome, homeTarget, altitudeMax: ALTITUDE_MAX,
      clouds,
      // Once the flight has stopped, one fade (intro.js): Britain sinks under the sea, its ink with
      // it, while the railway lines and the panel come in.
      onProgress: (k) => {
        landed = k;
        if (britainSea) britainSea.opacity = k;
        for (const layer of landWith) layer.opacity = k;
        coastInk.set(1, 1 - k);
        if (k > 0.3 && !countiesLanded) { countiesLanded = true; countiesFit(); }
        // Text can't fade in 3D: Britain's shire names go part-way through its fade.
        if (shires && k > 0.35 && shires.visible) { shires.visible = false; map.remove(shires); }
        reliefNow?.setBritain(1 - k);
      },
    }));
    homeReady.then(() => livingSea?.start()).catch((err) => console.warn("Couldn't start the sea.", err));
    // Ireland's ink hands over to the sea's, which fades in over 2.5 s from landing (sea3d.js).
    homeReady.then(() => {
      if (!livingSea) return;
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 2500);
        coastInk.set(1 - k, landed >= 1 ? 0 : 1 - landed);
        if (k < 1) requestAnimationFrame(step);
        else if (landed >= 1) coastInk.destroy();
        else setTimeout(() => coastInk.destroy(), 2500);
      };
      requestAnimationFrame(step);
    });
    // Landed: Britain is under the sea, so drop it (11,000 points, draped twice). The island's
    // own sea goes in first, and Britain's cover only once that's drawn, so nothing flashes.
    homeReady.then(() => { countiesLanded = true; countiesFit(); });
    // The loughs and rivers, once landed, just above the land (under the railways), fading in.
    homeReady.then(async () => {
      // Hachured hills first (on the land), then the loughs and rivers over them.
      const [relief, water] = await Promise.all([
        reliefReady,
        createWater({ GraphicsLayer, Graphic }),
      ]);
      const above = map.layers.indexOf(landLayer) + 1;
      const fading = [water]; // the hachures are already there
      for (const layer of fading) layer.opacity = 0;
      map.add(water, above);
      if (relief) {
        // Peak names are text, which can't fade (like the counties); shown with them.
        relief.names.visible = countiesLanded && view.width >= 700;
        view.watch("width", () => { relief.names.visible = view.width >= 700; });
        map.add(relief.names);
        relabel([relief.names]);
      }
      const t0 = performance.now();
      const fade = (now) => {
        const k = Math.min(1, (now - t0) / 900);
        for (const layer of fading) layer.opacity = k;
        if (k < 1) requestAnimationFrame(fade);
      };
      requestAnimationFrame(fade);
    }).catch((err) => console.warn("No loughs and rivers.", err));
    homeReady.then(async () => {
      seaFill.symbol = seamedSea;
      if (!britainSea) return;
      seaFill.geometry = islandMask;
      await new Promise((r) => setTimeout(r, 1500));
      landLayer.remove(britainLand);
      map.remove(britainSea);
      britainSea.destroy();
    });
  } catch (err) {
    console.warn("Couldn't build the Ireland mask, showing the full basemap.", err);
    homeReady = Promise.resolve();
    landed = 1;
    document.getElementById("intro")?.remove();
    document.body.classList.remove("intro-on");
  }

  // Terrain, once the opening has landed (or straight away if there's no opening).
  homeReady.catch(() => {}).then(() => { map.ground = "world-elevation"; });

  let data;
  try {
    data = await loadData();
  } catch (err) {
    setStatus(`Couldn't load railway data: ${err.message}`, true);
    return;
  }

  const slider = $("year");

  // Lines and towns are individual graphics animated by one shared loop, so a change only
  // redraws what's moving (see lines3d.js and towns3d.js).
  const rail = createRailLines({ GraphicsLayer, Graphic, features: data.features, colors: COLORS, popupContent, view, RenderNode, webgl, SpatialReference });
  map.addMany(rail.layers);
  for (const layer of rail.layers) {
    layer.opacity = landed;
    landWith.push(layer);
  }
  // Place names and station circles, ranked as on the 1920 map. Built once the opening has
  // landed: building 1,800 labelled places during the flight dropped it to a frame every two
  // seconds. Labels switched on with the camera at rest aren't laid out until it moves, so the
  // camera is nudged by a hair once they're in.
  let places = null;
  homeReady.then(() => createPlaces({ FeatureLayer, Graphic, rail: data })).then(async (p) => {
    map.addMany(p.layers);
    p.setYear(+slider.value);
    places = p;
    p.showSmaller($("showSmaller").checked);
    $("showSmaller").addEventListener("change", (e) => { p.showSmaller(e.target.checked); relabel([p.layers[2]]); });
    relabel(p.layers);
  }).catch((err) => console.warn("No place names.", err));
  // The seas, bays and loughs, named once landed.
  homeReady.then(() => {
    const seaNames = createSeaNames({ FeatureLayer, Graphic });
    map.addMany(seaNames);
    relabel(seaNames);
  }).catch((err) => console.warn("No sea names.", err));

  const portsLayer = new GraphicsLayer({
    title: "Freight ports",
    listMode: "hide",
    visible: false,
    graphics: PORTS.map((p) => new Graphic({
      geometry: { type: "point", longitude: p.lon, latitude: p.lat },
      attributes: p,
      symbol: {
        type: "point-3d",
        symbolLayers: [{
          type: "icon", resource: { primitive: "square" }, size: 11,
          material: { color: "#1c3d5a" }, outline: { color: "white", size: 1.25 },
        }],
      },
    })),
  });
  // GraphicsLayer has no labelling, so draw the names as text graphics lifted above the squares.
  portsLayer.addMany(PORTS.map((p) => new Graphic({
    geometry: { type: "point", longitude: p.lon, latitude: p.lat },
    symbol: {
      type: "point-3d",
      verticalOffset: { screenLength: 10 },
      symbolLayers: [{
        type: "text", text: p.name, size: 10, verticalAlignment: "bottom",
        material: { color: "#1c3d5a" }, font: { weight: "bold" }, halo: { color: "white", size: 1.5 },
      }],
    },
  })));
  map.add(portsLayer);

  const townsData = await loadTowns();
  let towns = null;
  if (townsData) {
    towns = createTownColumns({
      GraphicsLayer, Graphic, view, towns: townsData.towns, color: COLORS.building, roofColor: COLORS.roof, popupContent: townPopup,
    });
    map.add(towns.layer);
    // (What the closed lines would carry today is told in the Findings, findings.js.)
  } else {
    $("showTowns").closest("label").hidden = true;
    document.querySelector(".towns-stat").hidden = true;
  }

  // Loaded only when they're switched on.
  const landmarks = SHOW_LANDMARKS
    ? (await import("./landmarks.js")).createLandmarks({ FeatureLayer, Graphic, heading: HEADING })
    : null;
  if (landmarks) {
    map.add(landmarks);
    $("showLandmarks").addEventListener("change", (e) => { landmarks.visible = e.target.checked; });
  } else {
    $("showLandmarks").closest("label").hidden = true;
    document.querySelector(".landmark-keys").hidden = true;
  }

  // Drawn with our own WebGL, wings flapping in the shader (swans.js).
  const swans = createSwans({ view, RenderNode, webgl, SpatialReference, Point });
  // The story's last chapter: the 2050 network, and the whole page in a future look (future.js).
  const future = createFuture({ view, Point });
  // During the opening flight the swans and landmark labels sit out: the moving swans keep the
  // scene busy, so it never settles to finish loading tiles before take-off, and labels are
  // re-placed every frame while the camera moves (together about 51 -> 55 fps, half the slow
  // frames, measured with ?debug&perf). They come back when it lands.
  swans.setVisible(false);
  if (landmarks) landmarks.labelsVisible = false;
  homeReady.then(() => {
    // The 2050 chapter's faces, fetched now so its text doesn't flash a fallback font and then
    // swap (it flickered the first time the chapter opened).
    if (document.fonts?.load) {
      for (const f of ["800 20px Orbitron", "700 20px Orbitron", "400 14px 'Space Grotesk'", "600 14px 'Space Grotesk'"]) document.fonts.load(f).catch(() => {});
    }
    if (landmarks) landmarks.labelsVisible = true;
    // Aim their crossing across the opening view: in from the left edge, out through the bottom, clear of the panel.
    swans.setPathFromView();
    swans.setVisible(true);
  });

  // The lines are always drawn as the 1920s map drew them (lines3d.js).
  rail.setPeriod(true, false);

  const loop = (now) => {
    rail.tick(now);
    towns?.tick(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // ?debug, or ?video (for scripted screen recordings, without the debug box), exposes the map's parts.
  if (new URLSearchParams(location.search).has("video")) { document.body.classList.add("video"); document.body.style.setProperty("--vz", VIDEO_UI_ZOOM); }
  // ?video: window.__caption(html) puts one large line over the map, centred in the space the
  // panel and any drawer leave, for scripted recordings that will play muted in a feed.
  if (new URLSearchParams(location.search).has("video")) {
    const cap = Object.assign(document.createElement("div"), { id: "vcap" });
    document.body.appendChild(cap);
    window.__caption = (html = "") => {
      const p = view.padding || {};
      cap.style.left = `${(p.left || 0) + 84}px`;
      cap.style.right = `${(p.right || 0) + 24}px`;
      cap.classList.remove("in");
      void cap.offsetWidth;
      cap.innerHTML = html;
      if (html) cap.classList.add("in");
    };
  }
  if (["debug", "video"].some((k) => new URLSearchParams(location.search).has(k))) window.__anim = { rail, towns, swans, view, get lost() { return lost; }, get places() { return places; } };

  const total = data.features.reduce((s, f) => s + f.properties.km, 0);
  setStatus(`${data.features.length.toLocaleString()} line sections, ${Math.round(total).toLocaleString()} km in total.`);

  const ALL_TOWNS = () => true; // the default towns filter
  let townsFilter = ALL_TOWNS; // extra towns filter set by a findings section
  let firstDraw = true;
  let jumpNext = false; // the next refresh goes straight to its year, without animating (applyScene's instant)
  let pending = false;
  const refresh = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const year = +slider.value;
      slider.style.setProperty("--fill", `${((year - slider.min) / (slider.max - slider.min)) * 100}%`);
      const animate = !firstDraw && !jumpNext;
      firstDraw = false;
      jumpNext = false;
      $("yearLabel").textContent = year;
      rail.setState({ year, animate });
      places?.setYear(year);
      lost?.setYear(year, animate, rail.plan());
      updateStats(data.features, year);
      if (towns) {
        towns.setState({ year, filter: townsFilter, animate });
        towns.layer.visible = $("showTowns").checked;
        let n = 0, people = 0;
        for (const f of townsData.towns.features) {
          if (f.properties.closed_year <= year) { n++; people += f.properties.pop; }
        }
        $("townsLost").textContent = n.toLocaleString();
        $("townsPop").textContent = people.toLocaleString();
      }
    });
  };
  // The slider's track is inked red up to the year shown (styles.css, --fill).
  const fill = () => slider.style.setProperty("--fill", `${((slider.value - slider.min) / (slider.max - slider.min)) * 100}%`);
  fill();
  slider.addEventListener("input", fill);
  slider.addEventListener("input", refresh);
  // The ground that lost its railway, scorched (lostland.js): once landed, drawn over the
  // ground and under the sea.
  let lost = null;
  homeReady.then(() => createLostLand({ view, RenderNode, features: data.features, presentYear: +slider.max })).then((l) => {
    lost = l;
    l.setVisible($("showLost").checked);
    $("showLost").addEventListener("change", (e) => l.setVisible(e.target.checked));
    l.setYear(+slider.value, true); // burns in, with embers
  }).catch((err) => console.warn("No lost-railway shading.", err));
  $("showTowns").addEventListener("change", refresh);
  refresh();

  // Play moves a year at a time; each line and town animates over several of these steps,
  // so the changes overlap and read as one continuous motion.
  const PLAY_MS = 160;
  // Pressed at the end (2026), play goes back to the start first, and waits there until the
  // map has caught up (lines pulled back, buildings sunk, the ground recovered) before the years
  // move again, so the rewind isn't still playing out under the new run. At most SETTLE_MAX_MS.
  const SETTLE_MAX_MS = 5000, SETTLE_POLL_MS = 100;
  let timer = null, settling = null;
  const settled = () => !rail.busy() && !(towns?.busy()) && !(lost?.busy()) && !pending;
  const stop = () => {
    clearTimeout(timer);
    timer = null;
    clearTimeout(settling);
    settling = null;
    $("play").textContent = "▶";
  };
  // Each year waits for the map to catch up before the next: at least PLAY_MS, and longer while
  // that year's lines are still drawing in or pulling back, buildings rising or sinking and the
  // ground burning, up to YEAR_MAX_MS. Quiet years pass quickly; busy ones (the 1840s-60s
  // building, the 1950s-60s closures) slow the clock so the animation keeps up with the year shown.
  const YEAR_MAX_MS = 1100, PACE_POLL_MS = 40;
  const run = () => {
    settling = null;
    const nextYear = () => {
      if (+slider.value >= +slider.max) return stop();
      slider.value = +slider.value + 1;
      fill();
      refresh();
      const since = performance.now();
      const ready = () => {
        const t = performance.now() - since;
        if (t >= PLAY_MS && (settled() || t >= YEAR_MAX_MS)) return nextYear();
        timer = setTimeout(ready, PACE_POLL_MS);
      };
      timer = setTimeout(ready, PLAY_MS);
    };
    nextYear();
  };
  $("play").addEventListener("click", () => {
    if (timer || settling) return stop();
    $("play").textContent = "❚❚";
    if (+slider.value < +slider.max) return run();
    slider.value = slider.min;
    fill();
    refresh();
    const since = performance.now();
    const wait = () => {
      // A beat before the first check, so the rewind has been handed out and started.
      if (performance.now() - since > SETTLE_POLL_MS * 2 && (settled() || performance.now() - since > SETTLE_MAX_MS)) return run();
      settling = setTimeout(wait, SETTLE_POLL_MS);
    };
    settling = setTimeout(wait, SETTLE_POLL_MS);
  });

  if (towns) {
    setupFindings({
      view,
      findTown: towns.findTown,
      towns: townsData.towns,
      rail: data.features,
      impact: townsData.impact,
      onToggle: padForPanel,
      // `instant` puts the map at the year at once (a starting point the next scene animates from).
      applyScene: ({ year, townsFilter: filter = ALL_TOWNS, ports = false, keepView = false, instant = false }) => {
        stop();
        if (instant) jumpNext = true;
        slider.value = year;
        townsFilter = filter;
        $("showTowns").checked = true;
        portsLayer.visible = ports;
        view.closePopup();
        refresh();
        // (A newer move, the next card, cuts this one short: not an error.)
        if (!keepView && islandExtent) goHome({ duration: 1400, easing: "in-out-cubic" }).catch(() => {});
      },
    });

    // While a chapter flies the camera, the map's names are hidden: ArcGIS re-decides every frame
    // which ones fit, and with towers rising under them they flickered on and off (chapters 5
    // and 7). They come back once the camera has settled. (The opening does the same.) A newer
    // flight takes over from an older one; only the last to finish brings the names back.
    let quietRun = 0;
    const labelLayers = () => view.map.allLayers.filter((l) => l.labelingInfo?.length && l.labelsVisible !== undefined).toArray();
    let hiddenLabels = [];
    const quietLabels = (flight) => {
      const run = ++quietRun;
      if (!hiddenLabels.length) {
        hiddenLabels = labelLayers().filter((l) => l.labelsVisible);
        for (const l of hiddenLabels) l.labelsVisible = false;
      }
      return Promise.resolve(flight).catch(() => {}).then(() => new Promise((r) => setTimeout(r, 250))).then(() => {
        if (run !== quietRun) return; // a newer flight is still going
        for (const l of hiddenLabels) l.labelsVisible = true;
        hiddenLabels = [];
      });
    };

    // The story drives the map through this small API.
    // Two versions of the story: the current one (story.js), told through one town, and the
    // first, longer one with more numbers (story-classic.js), kept as ?story=classic.
    const storyFile = new URLSearchParams(location.search).get("story") === "classic" ? "./story-classic.js" : "./story.js";
    const { setupStory } = await import(storyFile);
    setupStory({
      towns: townsData.towns,
      impact: townsData.impact,
      api: {
        onToggle: padForPanel,
        setFuture: (on) => future.set(on),
        stopPlay: stop,
        goHome: () => islandExtent && quietLabels(goHome({ duration: 1400, easing: "in-out-cubic" })),
        // A newer move (the next chapter) interrupts the last one: not an error.
        flyTo: ({ center, scale, tilt }) => quietLabels(view.goTo({ center, scale, tilt, heading: HEADING }, { duration: 2200 })),
        setTownsFilter: (filter) => {
          townsFilter = filter || ALL_TOWNS;
          $("showTowns").checked = true;
          refresh();
        },
        // Forward, the map plays the change out (lines closing, the ground burning); back to an
        // earlier year it's simply there, so a chapter never un-burns in front of the reader.
        setYear: (year) => {
          stop();
          view.closePopup();
          if (+year < +slider.value) jumpNext = true;
          slider.value = year;
          refresh();
        },
        // Run the slider from one year to another, a year every `ms`.
        // The map goes straight to `from` (no rewind playing out under the run), then plays on.
        play: (from, to, ms) => {
          stop();
          view.closePopup();
          if (+from !== +slider.value) jumpNext = true;
          slider.value = from;
          refresh();
          $("play").textContent = "❚❚";
          timer = setInterval(() => {
            if (+slider.value >= to) return stop();
            slider.value = +slider.value + 1;
            refresh();
          }, ms);
        },
      },
    });
  } else {
    document.querySelectorAll("[data-open-findings], [data-open-story]").forEach((el) => { el.hidden = true; });
  }
}

main();
