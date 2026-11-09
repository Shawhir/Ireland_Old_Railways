// The story, in seven short chapters, told through one town: how the railway grew, why it fell,
// the fall, what it did to travel and to the places it left, what keeping the lines would mean,
// and the plan to put some of them back. Navan, the biggest town on the island without a station,
// runs through every chapter in a line. Each chapter makes one point: a sentence or two, one big
// number rolled in like a departure board (odometer.js), and one graphic that builds itself
// (a line drawing in, a timeline ticking, a bar shrinking or growing, bars racing, names stamped
// on). Each chapter also sets the map up (year, camera, which towns).
//
// The first, longer version of the story is kept in story-classic.js (?story=classic).
//
// The story makes the case; the Findings (findings.js) hold the estimates and their sources.
// Where a chapter touches a figure the Findings cover, it links to that card ("See it in numbers").

import { smallMultiples, barChart } from "./story-charts.js";
import { showDrawer } from "./drawer.js";
import { odo } from "./odometer.js";

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Journey times, then and now: [route, by train then (minutes), year, fastest bus today (minutes),
// car today (minutes, free-flow estimate)]. Only routes with a sourced old timetable (SOURCES.times):
// the last trains on the Derry Road (1958), the Enniskillen diesel (1957), the Tralee and Dingle
// in the 1930s. Buses today from the operators' timetables (Nov 2026); cars from OpenStreetMap
// routing without traffic, so real trips take longer.
const JOURNEYS = [
  ["Derry – Dublin", 265, 1958, 230, 190],
  ["Derry – Belfast", 160, 1958, 110, 85],
  ["Enniskillen – Belfast", 125, 1957, 120, 100],
  ["Tralee – Dingle", 155, "1930s", 55, 45],
];

// Towns on the corridors the 2024 rail review would rebuild (plus Navan).
const REBUILD_TOWNS = ["Dungannon", "Omagh", "Strabane", "Letterkenny", "Armagh", "Monaghan", "Clones", "Cavan", "Tuam", "New Ross", "Navan"];

// Emissions, g CO2e per km (UK DESNZ factors, as a proxy for Ireland).
const G_CAR = 170, CAR_OCCUPANCY = 1.6, G_TRAIN = 35;
const TRIP_KM = 40, CAR_DRIVER_SHARE = (1 - 0.36) * 0.57, CAR_KM_YEAR = 15000; // Borders Railway: 36% new trips, 57% had driven
const tonnesSaved = (journeys) => (journeys * TRIP_KM * (CAR_DRIVER_SHARE * G_CAR - G_TRAIN)) / 1e6;

const SOURCES = {
  hmso: "HMSO, Report on the Banking, Railway and Shipping Statistics of Ireland for 1913 (1914)",
  cso1916: "CSO, Ireland in 1916",
  census: "CSO census (A0102); NISRA census",
  acts: "Tramways and Public Companies (Ireland) Act 1883; Light Railways (Ireland) Act 1889",
  history: "Railways Act 1924; Transport Act 1944; Transport Act (Northern Ireland) 1948; Beddy Report (1957); Benson Report (1963)",
  dail: "Dáil and Seanad debates (CIÉ losses, closures)",
  cars: "Dáil answers 1931–1990; CSO Transport Omnibus 2020 and TEA11",
  tii: "TII National Route Lengths; TII network indicators 2022",
  cso2022: "CSO Census 2022, Profile 7: commuting",
  railJ: "CSO TCA01 rail passenger journeys",
  tomtom: "TomTom Traffic Index 2025",
  epa: "EPA provisional greenhouse gas emissions 1990–2025; CSO (1990 share)",
  desnz: "UK DESNZ greenhouse gas conversion factors (car; national rail average)",
  epaAir: "EPA, Air Quality in Ireland 2024 (EEA estimate of premature deaths)",
  eurostat: "Eurostat, modal split of inland freight",
  aisrr: "All-Island Strategic Rail Review (2024); RTÉ, 31 July 2024",
  nce: "New Civil Engineer, 'New rail lines eyed in £31bn Republic and Northern Ireland vision' (12 August 2024)",
  news: "RTÉ, 'Four new stations in plans for rail line to Navan' (20 May 2026); Connacht Telegraph, 'Confirmation from Irish Rail that government derailed plans to reopen Western Rail Corridor in full' (23 October 2026); Irish News and Into the West campaign (Portadown–Derry)",
  times: "Disused Stations, 'Londonderry Foyle Road' (1958 GNR timetable); Fermanagh Herald, 'Sixty years since last train pulled out of Enniskillen' (2017); Castlegregory local history, 'Tralee-Dingle Light Railway'; Translink and Bus Éireann timetables via bustimes.org (November 2026); car times: OpenStreetMap routing (OSRM), no traffic",
  map: "This map: OpenHistoricalMap lines; OSM towns with 2021/22 census populations",
};
// The chapter's sources, folded to one line so the point stays on screen.
const sources = (...keys) => `<details class="story-srcs"><summary>Sources</summary><p class="story-src">${keys.map((k) => SOURCES[k]).filter(Boolean).join("; ")}.</p></details>`;

// One headline number, large.
const hero = (el, { value, label, sub, accent }) => {
  el.insertAdjacentHTML("beforeend", `<div class="story-big"${accent ? ` style="--stat-accent:${accent}"` : ""}><div class="story-big-value">${value}</div><div class="story-big-label">${label}</div>${sub ? `<div class="story-big-sub">${sub}</div>` : ""}</div>`);
};
// Navan's part of the chapter: the town that carries the story.
const navan = (el, html) => {
  el.insertAdjacentHTML("beforeend", `<aside class="story-thread"><p class="story-thread-name">Navan</p><p>${html}</p></aside>`);
};
// A link to the Findings card that holds this chapter's figures.
const seeFindings = (el, card, label) => {
  el.insertAdjacentHTML("beforeend", `<button type="button" class="story-see" data-open-findings data-card="${card}">${label} ›</button>`);
};
const mins = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`);

export async function setupStory({ api, towns, impact }) {
  const drawer = document.getElementById("story");
  const body = document.getElementById("storyBody");
  const count = document.getElementById("storyCount");
  const dots = document.getElementById("storyDots");
  const back = document.getElementById("storyBack");
  const next = document.getElementById("storyNext");
  const progress = document.getElementById("storyProgress");

  const railSeries = await fetch("data/rail-series.json").then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const railAt = (y) => railSeries.find((r) => r.year === y) || {};
  const RAIL_KM_ALL = railSeries.map((r) => [r.year, r.railKm]);
  const peak = railSeries.reduce((m, r) => (r.railKm > m.railKm ? r : m), { railKm: 0 });
  const last = railSeries[railSeries.length - 1] || {};

  const color = { rail: css("--viz-rail"), people: css("--viz-people"), cars: css("--viz-cars"), roads: css("--viz-roads") };
  const accent = { brand: css("--brand"), closures: css("--line-lost"), town: css("--town"), air: "#0f8f7f", bill: "#b4321f" };
  const km = (v) => `${Math.round(v).toLocaleString()} km`;
  const fmtM = (n, d = 1) => `${(n / 1e6).toFixed(d)}m`;

  const navanTown = towns.features.find((f) => f.properties.name === "Navan")?.properties;
  const navanPop = navanTown ? navanTown.pop.toLocaleString() : "about 34,000";
  const saved = { low: tonnesSaved(impact.journeys.low), central: tonnesSaved(impact.journeys.central), high: tonnesSaved(impact.journeys.high) };
  const kt = (t) => `${Math.round(t / 1000)}k`;

  // One idea a chapter: a short point, one big number rolled in, one graphic that builds itself,
  // and Navan in a line. Everything moves as the chapter comes in (styles.css, "The story as
  // motion graphics").
  const lede = (el, html) => el.insertAdjacentHTML("beforeend", `<p class="sg-lede">${html}</p>`);
  const timeline = (el, items) => el.insertAdjacentHTML("beforeend", `<ol class="sg-timeline">${items.map(([y, t], i) => `<li style="--i:${i}"><b>${y}</b><span>${t}</span></li>`).join("")}</ol>`);
  const chips = (el, items, cls = "") => el.insertAdjacentHTML("beforeend", `<ul class="sg-chips ${cls}">${items.map((t, i) => `<li style="--i:${i}">${t}</li>`).join("")}</ul>`);
  const trio = (el, items) => el.insertAdjacentHTML("beforeend", `<div class="sg-trio">${items.map(([v, l], i) => `<div style="--i:${i}"><b>${v}</b><span>${l}</span></div>`).join("")}</div>`);
  // A bar for the network's length: shrinking from `a` to `b` km, or growing (with the new part lit).
  const lengthBar = (el, a, b, { grow = false } = {}) => {
    const max = Math.max(a, b);
    el.insertAdjacentHTML("beforeend", `<div class="sg-bar ${grow ? "grow" : "shrink"}" style="--a:${(a / max) * 100}%; --b:${(b / max) * 100}%" role="img" aria-label="${Math.round(a).toLocaleString()} km to ${Math.round(b).toLocaleString()} km"><i></i></div>
      <div class="sg-bar-key"><span>${Math.round(a).toLocaleString()} km</span><span>${grow ? "almost " : ""}${Math.round(b).toLocaleString()} km</span></div>`);
  };

  const chapters = [
    {
      kicker: "Growth", accent: accent.brand,
      title: "A railway to almost every town",
      scene: () => { api.setTownsFilter(null); api.goHome(); api.play(1834, 1920, 55); },
      render: (el) => {
        lede(el, "In 1834 one line ran out of Dublin. By 1920 the railway reached every city and port, and, with state money, far into the west.");
        hero(el, { value: odo(Math.round(peak.railKm).toLocaleString(), { unit: "km" }), label: `of railway at its peak, ${peak.year}`, accent: color.rail });
        smallMultiples(el, [{ label: "Railway open", note: "whole island", color: color.rail, points: RAIL_KM_ALL.filter(([y]) => y <= 1920), format: km }], { from: 1834, to: 1920, ticks: [1840, 1860, 1880, 1900, 1920], table: false });
        navan(el, "Two lines to Dublin by 1862: one by Drogheda, one straight through Dunboyne.");
        seeFindings(el, 0, "Stations, journeys and goods in 1911");
        el.insertAdjacentHTML("beforeend", sources("map", "acts", "hmso"));
      },
    },
    {
      kicker: "Why it fell", accent: accent.closures,
      title: "Then everything turned against it",
      scene: () => { api.setTownsFilter(null); api.goHome(); api.play(1920, 1956, 200); },
      render: (el) => {
        lede(el, "The decline started decades before the big closures.");
        timeline(el, [
          ["1921", "A border cuts the network in two"],
          ["1922–23", "The Civil War wrecks lines and bridges"],
          ["1920s", "Buses and lorries go door to door"],
          ["1940s", "Coal runs short and services are cut"],
          ["1957", "The Beddy report: cut deep (Republic)"],
          ["1963", "The Benson report: cut deeper (North)"],
        ]);
        hero(el, { value: odo("1961"), label: "the Republic's population at its lowest, in the middle of the closures", accent: color.people });
        navan(el, "1947: the direct line to Dublin loses its passenger trains.");
        el.insertAdjacentHTML("beforeend", sources("history", "dail", "census"));
      },
    },
    {
      kicker: "The fall", accent: accent.closures,
      title: "The lines come up",
      scene: () => { api.setTownsFilter(null); api.goHome(); api.play(1945, 1976, 230); },
      render: (el) => {
        lede(el, "Between 1950 and 1975 most of it was closed and lifted. The railway has been the same size ever since.");
        hero(el, { value: odo(String(Math.round((1 - last.railKm / peak.railKm) * 100)), { unit: "%" }), label: `of the ${peak.year} railway is gone`, accent: accent.closures });
        lengthBar(el, peak.railKm, last.railKm);
        timeline(el, [
          ["1953", "Tralee and Dingle"],
          ["1957", "The Great Northern west of the main line"],
          ["1958", "Dublin's Harcourt Street line"],
          ["1961", "West Clare"],
          ["1965", "The Derry Road through Omagh"],
        ]);
        navan(el, "1958: the last passenger train. Tara Mines' ore trains still run straight through.");
        seeFindings(el, 1, "The closures decade by decade");
        el.insertAdjacentHTML("beforeend", sources("dail", "map"));
      },
    },
    {
      kicker: "Travel", accent: color.cars,
      title: "The road won on speed",
      scene: () => { api.setTownsFilter(null); api.setYear(2026); api.goHome(); },
      render: (el) => {
        lede(el, "Today's express bus is quicker than the last trains, and the car quicker still. For anyone who can't drive, or would rather not, there's no train left.");
        hero(el, { value: odo(`${mins(JOURNEYS[0][1])} → ${mins(JOURNEYS[0][3])}`), label: `${JOURNEYS[0][0]}: the last train (${JOURNEYS[0][2]}), then today's bus`, accent: color.cars });
        barChart(el, JOURNEYS.slice(0, 1).flatMap(([r, t, y, bus, car]) => [
          { label: r, sub: `train, ${y}`, value: t, color: color.rail },
          { label: "", sub: "bus today", value: bus, color: accent.closures },
          { label: "", sub: "car, no traffic", value: car, color: color.cars },
        ]), { title: "Derry to Dublin", note: "train time from a 1958 timetable reprint", format: mins });
        trio(el, [["26×", "more cars than in 1950 (Republic)"], ["59%", "of commuters to work drive"], ["191 h", "a year lost in Dublin's rush hour"]]);
        navan(el, "Navan to Dublin: 50 minutes by car on a clear M3, 1 h 15 by bus. Both share the road in.");
        el.insertAdjacentHTML("beforeend", sources("times", "cars", "cso2022", "tomtom"));
      },
    },
    {
      kicker: "The places hit", accent: accent.town,
      title: "Five counties with no railway at all",
      scene: () => {
        api.setYear(2026);
        api.setTownsFilter(null);
        api.flyTo({ center: [-7.5, 54.45], scale: 2200000, tilt: 35 });
      },
      render: (el) => {
        chips(el, ["Donegal", "Tyrone", "Fermanagh", "Cavan", "Monaghan"], "stamps");
        lede(el, `The buildings rising on the map are the ${last.townsCutOff} towns and villages that lost their line, taller for more people.`);
        hero(el, { value: odo((last.peopleToday || 0).toLocaleString()), label: "people live in them today", accent: accent.town });
        navan(el, `${navanPop} people: the biggest town on the island without a station.`);
        seeFindings(el, 2, "The ten biggest places that lost it");
        el.insertAdjacentHTML("beforeend", sources("map"));
      },
    },
    {
      kicker: "If they'd stayed", accent: color.rail,
      title: "What keeping them would mean now",
      scene: () => { api.setYear(2026); api.setTownsFilter(null); api.goHome(); },
      render: (el) => {
        lede(el, "Run them today, as often as the lines that survived, and they'd carry people the roads now take.");
        hero(el, { value: odo((Math.round(saved.central / 1000) * 1000).toLocaleString(), { pre: "≈", unit: "t" }), label: "of CO₂ saved a year", sub: `estimate, ${kt(saved.low)}–${kt(saved.high)} tonnes`, accent: accent.air });
        trio(el, [[`≈${fmtM(impact.journeys.central, 0)}`, "journeys a year"], [`≈${Math.round(impact.carTripsPerWeekday.central / 1000)}k`, "car trips off the road a weekday"], ["1,700", "early deaths a year from poor air (Ireland)"]]);
        el.insertAdjacentHTML("beforeend", `<p class="sg-note">Many of these lines were slow and lost money. The estimate assumes good modern services, and those cost money too.</p>`);
        navan(el, "Part is back: Clonsilla to M3 Parkway reopened in 2010. The last 25 km to the town are still missing.");
        seeFindings(el, 3, "How the estimate works");
        el.insertAdjacentHTML("beforeend", sources("desnz", "epa", "epaAir", "map"));
      },
    },
    {
      kicker: "2050", accent: "#3ce8ff",
      title: "A plan to put some of it back",
      // The map and the page change to the future: the proposed network in light, the 1920 one
      // faint beneath it (future.js).
      future: true,
      scene: () => {
        api.setYear(2026);
        api.setTownsFilter((p) => REBUILD_TOWNS.includes(p.name));
        api.goHome();
      },
      render: (el) => {
        lede(el, "The 2024 All-Island Strategic Rail Review: 32 recommendations by 2050, many rebuilding lifted lines. Where it stands, autumn 2026:");
        hero(el, { value: odo("700,000"), label: "more people within 5 km of a station", sub: "if all of it is built", accent: "#3ce8ff" });
        lengthBar(el, 2300, 3000, { grow: true });
        timeline(el, [
          ["Navan", "Four new stations; planning 2028, building from 2030"],
          ["Derry", "Portadown–Omagh–Derry: long term, 2040–2050"],
          ["Tuam", "Full reopening set aside by government, Oct 2026"],
          ["Wexford", "South Wexford: proposed"],
        ]);
        navan(el, "The furthest on: the route consultation closed in July 2026.");
        el.insertAdjacentHTML("beforeend", `<p class="sg-note">€35–37bn, 2023 prices. Each scheme still needs its own business case.</p>${sources("aisrr", "nce", "news")}`);
      },
    },
  ];

  let index = 0;
  const show = (i) => {
    index = Math.max(0, Math.min(chapters.length - 1, i));
    const c = chapters[index];
    drawer.style.setProperty("--accent", c.accent);
    count.textContent = `Chapter ${index + 1} of ${chapters.length}`;
    progress.style.width = `${((index + 1) / chapters.length) * 100}%`;
    body.innerHTML = `<div class="story-hero"><span class="story-num">${String(index + 1).padStart(2, "0")}</span><p class="story-kicker">${c.kicker}</p><h2>${c.title}</h2></div><div class="story-content"></div>`;
    const content = body.querySelector(".story-content");
    c.render(content);
    body.scrollTop = 0;
    requestAnimationFrame(() => content.classList.add("in", "odo-go"));
    dots.innerHTML = chapters.map((ch, k) => `<button type="button" class="${k === index ? "on" : ""}" data-chapter="${k}" aria-label="Chapter ${k + 1}: ${ch.kicker}" title="${ch.kicker}"></button>`).join("");
    back.disabled = index === 0;
    next.textContent = index === chapters.length - 1 ? "Explore the map" : "Next";
    api.setFuture(Boolean(c.future));
    c.scene();
  };

  const setOpen = (open) => {
    showDrawer(drawer, open);
    document.body.classList.toggle("story-open", open);
    if (open) {
      showDrawer(document.getElementById("findings"), false);
      document.body.classList.remove("findings-open");
    } else {
      api.stopPlay();
      api.setFuture(false);
      api.setTownsFilter(null);
    }
    api.onToggle();
    if (!open) api.goHome();
  };

  back.addEventListener("click", () => show(index - 1));
  next.addEventListener("click", () => (index === chapters.length - 1 ? setOpen(false) : show(index + 1)));
  dots.addEventListener("click", (e) => {
    const k = e.target.closest("[data-chapter]")?.dataset.chapter;
    if (k !== undefined) show(Number(k));
  });
  document.getElementById("closeStory").addEventListener("click", () => setOpen(false));
  document.querySelectorAll("[data-open-story]").forEach((el) => el.addEventListener("click", () => {
    setOpen(true);
    show(index);
  }));
  document.addEventListener("click", (e) => {
    if (e.target.closest?.("[data-open-findings]") && document.body.classList.contains("story-open")) setOpen(false);
  });
}
