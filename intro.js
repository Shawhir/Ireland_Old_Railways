// Opening shot. While the map loads, a title card covers it (#intro in index.html). Then the
// card lifts on a view pulled well back from the tilted home view, with Britain still on
// the map and low-poly 3D clouds hanging over it all (clouds3d.js). As the camera zooms
// in, the clouds slide out to the sides and fade, and Britain sinks under the sea
// (onProgress, 0 to 1) by the time it lands.
// Click to skip once the flight is under way. With reduced motion it goes straight to the map.

const FLIGHT_MS = 8000;
const START_SCALE = 2.2; // start this many times further out than the home view
const WATCHDOG_MS = 30000; // if the flight hasn't started by then, give up and show the page
const TILE_WAIT_MS = 4000; // longest to wait behind the card for the start view's tiles
// The clouds are the costliest thing in the flight. If this machine can't draw them smoothly
// (a frame behind the card over PROBE_SLOW_MS, or SLOW_RUN frames in a row over SLOW_MS during
// the flight), they're dropped: a smooth flight without them beats a juddering one.
const PROBE_SLOW_MS = 50, SLOW_MS = 100, SLOW_RUN = 3;
const LAND_FADE_MS = 1800; // after landing: Britain out, the panel and the lines in

// Times up to `count` frames (or until `maxMs` has passed): their gaps in ms.
const frameGaps = (count, maxMs) => new Promise((done) => {
  const ts = [], from = performance.now();
  const tick = (now) => {
    ts.push(now);
    if (ts.length > count || now - from > maxMs) done(ts.slice(1).map((t, i) => t - ts[i]));
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // A hidden page draws no frames: report none rather than wait.
  setTimeout(() => done(ts.slice(1).map((t, i) => t - ts[i])), maxMs + 500);
});

const smooth = (a, b, t) => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k); };

// From here on the opening is ours: the page's own fail-safe (index.html) only steps in if
// the app never got this far.
const introEl = document.getElementById("intro");
const hint = document.getElementById("introHint");
introEl?.setAttribute("data-owned", "");
let flightStarted = false, gaveUp = false;
// What the opening did, and why: each step logged as a warning (shown by default in every
// browser's console, Brave's included), and with ?debug also listed in a box on the page, so
// it's plain why there was, or wasn't, a flight or clouds.
const pageStart = performance.now();
let reportBox = null;
const report = (msg) => {
  const line = `${((performance.now() - pageStart) / 1000).toFixed(1)} s: ${msg}`;
  console.warn(`[opening] ${line}`);
  if (!new URLSearchParams(location.search).has("debug")) return;
  if (!reportBox) {
    reportBox = Object.assign(document.createElement("pre"), { id: "openingReport" });
    reportBox.style.cssText = "position:fixed;left:8px;bottom:28px;z-index:99;margin:0;padding:6px 8px;max-width:60vw;white-space:pre-wrap;font:11px/1.35 monospace;background:rgba(255,255,255,.88);color:#222;border:1px solid #999;pointer-events:none";
    document.body.append(reportBox);
  }
  reportBox.textContent += (reportBox.textContent ? "\n" : "") + line;
};
const finish = () => {
  introEl?.classList.add("done");
  document.body.classList.remove("intro-on");
  setTimeout(() => introEl?.remove(), 900);
};
// (Not while holding for debugging, ?debug&hold, which waits on purpose.)
const holding = new URLSearchParams(location.search).has("debug") && new URLSearchParams(location.search).has("hold");
if (!holding) setTimeout(() => { if (!flightStarted) { gaveUp = true; report(`no flight: not ready after ${WATCHDOG_MS / 1000} s, so the map was shown without it (and without clouds)`); finish(); } }, WATCHDOG_MS);

// Summary of a profiled flight: how even the frames were, and how much of each went on our
// own JavaScript (the rest is the map drawing). Also kept as window.__introPerf.
function reportPerf(frames, mode) {
  const gaps = frames.slice(1).map(([t], i) => t - frames[i][0]).sort((a, b) => a - b);
  const js = frames.map(([, j]) => j);
  const q = (p) => gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))] || 0;
  const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const r = {
    mode: `clouds=${mode.clouds} britain=${mode.britain}`,
    frames: frames.length,
    fps: +(1000 / avg(gaps)).toFixed(1),
    medianMs: +q(0.5).toFixed(1),
    p95Ms: +q(0.95).toFixed(1),
    worstMs: +(gaps.at(-1) || 0).toFixed(1),
    over33ms: gaps.filter((g) => g > 33.4).length,
    over50ms: gaps.filter((g) => g > 50).length,
    ourJsAvgMs: +avg(js).toFixed(2),
    ourJsWorstMs: +Math.max(0, ...js).toFixed(2),
  };
  (window.__introPerf ||= []).push(r);
  console.table([r]);
  return r;
}

export async function flyIn({ view, goHome, homeTarget, altitudeMax, clouds: cloudsIn, onProgress = () => {} }) {
  let clouds = cloudsIn;
  const dropClouds = (why) => {
    if (!clouds) return;
    report(`opening without clouds: ${why}`);
    clouds.destroy();
    clouds = null;
  };
  const intro = introEl?.isConnected ? introEl : null;
  const params = new URLSearchParams(location.search), debug = params.has("debug");
  // ?debug exposes the clouds for posing at any point (0–1); ?debug&hold waits for __introGo() to fly.
  if (debug) window.__introClouds = (t) => clouds?.place(t);
  // ?debug&perf times every frame of the flight and logs a summary. To find what costs what,
  // add clouds=off|still|nofade and/or britain=still to switch parts off.
  const perf = debug && params.has("perf");
  const mode = { clouds: (perf && params.get("clouds")) || "on", britain: (perf && params.get("britain")) || "on" };
  const frames = [];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (intro) document.body.classList.add("intro-on");

  // A click skips the flight once it's under way (while loading, the hint says so instead).
  let skipped = false, flying = false, raf = 0, target = null;
  intro?.addEventListener("click", () => {
    if (!flying || skipped) return;
    skipped = true;
    cancelAnimationFrame(raf);
    clouds?.place(1);
    onProgress(1);
    view.goTo(target, { animate: false }).catch(() => {});
  });

  try {
    // Work out the home view while the title card still covers the map.
    await goHome({ animate: false });
    target = view.camera.clone();
    if (reduce) report("no flight: the system asks for reduced motion (e.g. Windows 'Show animations' off)");
    if (!intro) report("no flight: no title card on the page");
    if (reduce || !intro) return;
    report(clouds ? "start view set; clouds made" : "start view set; no clouds were made");

    view.constraints.altitude.max = altitudeMax * 2;
    await view.goTo(await homeTarget(START_SCALE, true), { animate: false });
    // The clouds sit on the flight path, so the camera flies through them (clouds3d.js).
    clouds?.fitPath?.(view.camera.clone(), target);
    // Let the start view's map tiles finish loading behind the card, so fewer stream in (and
    // drop frames) mid-flight: measured 44 -> 51 fps.
    const waitFrom = performance.now();
    while (view.updating && performance.now() - waitFrom < TILE_WAIT_MS) await new Promise((r) => setTimeout(r, 100));

    if (mode.clouds === "off") dropClouds("switched off");
    // Can this machine draw the clouds smoothly? Time a few frames with them up, still behind
    // the card. (Too few frames in the time means very slow frames; none means a hidden page,
    // which says nothing, so they're kept.)
    // If they're slow, they're made lighter (a third of the pixels) and timed again; only if
    // they're still more than twice too slow are they dropped. ?clouds=always skips this.
    const always = params.get("clouds") === "always";
    const probe = async () => {
      const gaps = await frameGaps(8, 1200);
      const median = gaps.length ? [...gaps].sort((a, b) => a - b)[gaps.length >> 1] : 0;
      return { gaps, median, slow: gaps.length && (median > PROBE_SLOW_MS || gaps.length < 4) };
    };
    if (clouds && !document.hidden && !always) {
      let p = await probe();
      if (p.slow && clouds.degrade) {
        report(`clouds made lighter: frames took ${Math.round(p.median)} ms`);
        clouds.degrade();
        p = await probe();
        if (p.gaps.length && (p.median > PROBE_SLOW_MS * 2 || p.gaps.length < 3)) dropClouds(`frames still took ${Math.round(p.median)} ms when lighter`);
      } else if (p.slow) dropClouds(`frames took ${Math.round(p.median)} ms`);
    }
    if (debug && params.has("hold")) await new Promise((go) => { window.__introGo = go; });
    // Too late: the watchdog has already shown the map, so land there rather than fly in
    // with no card over the start.
    if (gaveUp) {
      await view.goTo(target, { animate: false });
      return;
    }

    flightStarted = true;
    report(clouds ? "flying, with clouds" : "flying, without clouds");
    const t0 = performance.now();
    let last = t0, slowRun = 0, degradedInFlight = false;
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / FLIGHT_MS);
      slowRun = now - last > SLOW_MS ? slowRun + 1 : 0;
      last = now;
      if (slowRun >= SLOW_RUN && !document.hidden && !always) {
        // Lighter once more first; dropped only if they're still slow after that.
        if (clouds?.degrade && !degradedInFlight) { clouds.degrade(); degradedInFlight = true; slowRun = 0; report("clouds made lighter mid-flight"); }
        else dropClouds(`${SLOW_RUN} frames in a row over ${SLOW_MS} ms`);
      }
      const js0 = performance.now();
      if (mode.clouds !== "off") clouds?.place(t, { move: mode.clouds === "on" || mode.clouds === "nofade", fade: mode.clouds !== "nofade" });
      if (perf) frames.push([now, performance.now() - js0]);
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    intro.style.setProperty("--flight", `${FLIGHT_MS}ms`);
    intro.classList.add("flying"); // lifts the card and fades the title (CSS)
    if (hint) hint.textContent = "Click to skip";
    flying = true;
    raf = requestAnimationFrame(frame);
    try {
      await view.goTo(target, { duration: FLIGHT_MS, easing: "in-out-cubic" });
    } catch {
      // Interrupted (skip or a user drag): land on the home view anyway.
      if (!skipped) await view.goTo(target, { animate: false });
    }
    if (perf) reportPerf(frames, mode);
  } catch (err) {
    console.warn("The opening flight failed; showing the map.", err);
  } finally {
    // However it ends, the clouds and card go and the map is left usable.
    flightStarted = true;
    cancelAnimationFrame(raf);
    clouds?.place(1);
    clouds?.destroy();
    clouds = null;
    view.constraints.altitude.max = altitudeMax;
    // Now nothing is moving: Britain fades out while the panel and the railway lines fade in,
    // together, over LAND_FADE_MS (the panel's CSS transition matches it).
    document.body.classList.add("landing");
    finish();
    // (A click to skip has already jumped to the end: no fade then.)
    if (skipped) onProgress(1);
    else await new Promise((done) => {
      const f0 = performance.now();
      const fade = (now) => {
        const k = Math.min(1, (now - f0) / LAND_FADE_MS);
        onProgress(k * k * (3 - 2 * k));
        if (k < 1) requestAnimationFrame(fade); else done();
      };
      requestAnimationFrame(fade);
      setTimeout(() => { onProgress(1); done(); }, LAND_FADE_MS + 1500); // a hidden page draws no frames
    });
    document.body.classList.remove("landing");
  }
}
