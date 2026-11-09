// The findings as a short motion piece in a drawer beside the map: six cards, each one idea, a big
// number that rolls up like a station's departure board, and a small chart that builds itself,
// while the map acts it out: the network draws itself in as its length counts up, the lines burn
// out as the closures count, the towns rise as their number climbs. The cards play in turn (a
// segmented progress bar, pause, back and forward); Sources lists where every figure comes from,
// with the full method a link further. With reduced motion nothing moves on its own.
//
// Figures: analysis/FINDINGS.md, consolidated; what the closed lines would carry today from
// data/impact.json (as the story uses); the closures by decade from the map's own lines.

import { showDrawer } from "./drawer.js";
import { odo } from "./odometer.js";

const CARD_MS = 9500; // how long each card plays
const LINK_MIN_POP = 5000; // town names linked in the full write-up

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (n, dp = 0) => n.toLocaleString("en-IE", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const mil = (n, dp = 1) => `${fmt(n / 1e6, dp)}m`;

// The ten largest towns that lost rail (FINDINGS.md; 2021/22 populations).
const BIG_TOWNS = [
  ["Navan", 33886, 1958], ["Letterkenny", 22549, 1947], ["Omagh", 21297, 1965], ["Carrigaline", 18239, 1932],
  ["Strabane", 16670, 1965], ["Banbridge", 16653, 1955], ["Dundonald", 16098, 1950], ["Dungannon", 15889, 1965],
  ["Armagh", 14590, 1957], ["Enniskillen", 13757, 1957],
];

// Where each figure comes from. `check` is how it stood when the figures were checked against the
// sources: "ok" confirmed, "fixed" corrected to the source, "est" our own estimate or computation.
export const SOURCES = [
  { what: "1911: 5,475 km of line, 30.8m journeys, 6.7m tons of goods", title: "HMSO, Report on the Banking, Railway and Shipping Statistics of Ireland for 1913 (1914)", url: "https://archive.org/details/op1256502-1001", check: "ok" },
  { what: "964 stations in 1916", title: "CSO, Ireland in 1916: transport", url: "https://www.cso.ie/en/releasesandpublications/ep/p-1916/1916irl/economy/tp/", check: "ok" },
  { what: "1911 population, 4.39m", title: "Census of Ireland, 1911", url: "https://en.wikipedia.org/wiki/1911_census_of_Ireland", check: "ok" },
  { what: "Every line, its opening and closing year, and all km on the map", title: "OpenHistoricalMap contributors (CC0)", url: "https://www.openhistoricalmap.org", check: "est" },
  { what: "469 places near only a closed line, and their 845,556 people", title: "OpenStreetMap places with 2021/22 census populations (CSO, NISRA)", url: "https://www.openstreetmap.org", check: "est" },
  { what: "Boardings per resident, behind the journeys estimate (a one-day count, × 300)", title: "NTA, National Rail Census 2024", url: "https://www.nationaltransport.ie/publications/nta-national-rail-census-report-2024/", check: "ok", note: "station counts from the report itself, not re-read" },
  { what: "Today: 55.0m journeys on Iarnród Éireann (2025)", title: "NTA, TFI journeys 2025", url: "https://www.nationaltransport.ie/news/passenger-journeys-up-6-across-the-tfi-network-in-2025/", check: "ok" },
  { what: "Today: 15.1m on NI Railways (2019-20)", title: "DfI, Public transport statistics Northern Ireland", url: "https://www.infrastructure-ni.gov.uk/news/public-transport-statistics-northern-ireland-2021-22-statistical-report", check: "ok" },
  { what: "A frequent service: 98% of forecast, 36% new trips, 57% had driven", title: "Transport Scotland, Borders Railway evaluation", url: "https://www.transport.gov.scot/publication/borders-railway-year-1-evaluation/transport-research-summary", check: "fixed", note: "36% new trips, not 35%" },
  { what: "A slow service: Ennis–Athenry well short of hopes", title: "Western Rail Trail campaign; Irish Examiner (2010)", url: "https://www.irishexaminer.com/news/arid-20147672.html", check: "fixed", note: "the 52% is a campaign's 2017 figure, and the forecast itself is disputed" },
  { what: "Time lost in traffic: Dublin 191 h, Cork 107 h, Belfast 102 h", title: "TomTom Traffic Index (2025)", url: "https://www.tomtom.com/traffic-index/ireland-country-traffic", check: "ok" },
  { what: "63% of people commuting to work go by car", title: "CSO, Census 2022 Profile 7", url: "https://www.cso.ie/en/releasesandpublications/ep/p-cpp7/censusofpopulation2022profile7-employmentoccupationsandcommuting/keyfindings", check: "fixed", note: "to work, driving or as passengers" },
  { what: "Congestion: €336m (2022) to €1.5bn+ (2040)", title: "Dept of Transport, Economic cost of congestion in the Greater Dublin Area", url: "https://www.gov.ie/en/publication/3fef5-the-economic-cost-of-congestion-in-the-greater-dublin-area-2022-2040/", check: "fixed", note: "the Greater Dublin Area, not the city" },
  { what: "Road freight, 165m tonnes and 13,575m tonne-km (2024)", title: "CSO, Road Freight Transport Survey 2024", url: "https://www.cso.ie/en/releasesandpublications/ep/p-rfts/roadfreighttransportsurveyquarter4andyear2024", check: "fixed", note: "road is 2024, rail 2023" },
  { what: "Rail freight, 76m tonne-km (2023): 0.6% of the total", title: "EPA, State of the Environment 2024 (Eurostat)", url: "https://epawebapp.epa.ie/ebooks/soe2024/291/", check: "ok" },
  { what: "Northern Ireland: 49.3m tonnes by road (2016), none by rail", title: "DfI, Northern Ireland Transport Statistics 2016-17", url: "https://www.infrastructure-ni.gov.uk/news/publication-northern-ireland-transport-statistics-2016-17", check: "ok" },
  { what: "76% less CO₂ per tonne by rail", title: "GB Railfreight (a UK industry figure)", url: "https://www.gbrailfreight.com/?p=4186", check: "fixed", note: "GB diesel rail, not Irish; first cited as DB Cargo" },
  { what: "Reopenings would bring 700,000 more people within 5 km of a station", title: "All-Island Strategic Rail Review, by Arup for the Department of Transport and the Department for Infrastructure (2024), via the Irish Times", url: "https://www.irishtimes.com/transport/2024/07/31/faster-more-frequent-trains-and-new-services-in-northwest-among-proposals-in-rail-review", check: "ok", note: "if all its recommendations are delivered" },
];

// The cards. `scene` is what the map shows (app.js applyScene); `from` is the year the map is put
// at first, without animating, so that it then acts the card out on the way to `scene`.
function cards({ closedByDecade, totalKm, lostKm, impact }) {
  const maxDecade = Math.max(...closedByDecade.map(([, km]) => km));
  const keptKm = totalKm - lostKm;
  const j = impact?.journeys || { low: 7.9e6, central: 16.9e6, high: 33.7e6 };
  const cars = impact?.carTripsPerWeekday?.central || 20836;
  const people = impact?.people || 845556;
  const places = impact?.places || 469;
  const SCALE = 70e6; // the journeys axis, to today's network
  return [
    {
      kicker: "1911", title: "The network at its height",
      from: 1833, scene: { year: 1911 },
      body: () => `
        <div class="mg-hero">${odo(fmt(5480), { unit: "km" })}</div>
        <p class="mg-lede">of railway, with a station in almost every town of any size.</p>
        <div class="mg-track" aria-hidden="true"><i></i></div>
        <div class="mg-trio">
          <div><b>${odo("964")}</b><span>stations</span></div>
          <div><b>${odo("30.8", { unit: "m" })}</b><span>journeys a year</span></div>
          <div><b>${odo("7")}</b><span>trips per person</span></div>
        </div>`,
    },
    {
      kicker: "1930s–2000s", title: "Two-thirds of it closed",
      from: 1920, scene: { year: 2026 },
      body: () => `
        <div class="mg-hero lost">${odo(fmt(lostKm), { unit: "km" })}</div>
        <p class="mg-lede">of the ${fmt(totalKm)} km ever built, lifted or left to freight. Most went in two decades.</p>
        <div class="mg-split" aria-label="${fmt(keptKm)} km still in use, ${fmt(lostKm)} km closed">
          <i class="kept" style="--w:${(keptKm / totalKm) * 100}%"></i><i class="lost" style="--w:${(lostKm / totalKm) * 100}%"></i>
        </div>
        <div class="mg-split-key"><span class="kept">${fmt(keptKm)} km still in use</span><span class="lost">${fmt(lostKm)} km closed</span></div>
        <div class="mg-decades" aria-label="Kilometres closed in each decade">
          ${closedByDecade.map(([d, km], i) => `<div class="${km > maxDecade * 0.6 ? "peak" : ""}" style="--h:${(km / maxDecade) * 100}%; --i:${i}"><i></i><b>${km >= 100 ? fmt(km) : ""}</b><span>${String(d).slice(2)}s</span></div>`).join("")}
        </div>`,
    },
    {
      kicker: "Today", title: "Who lost the railway",
      from: 1930, scene: { year: 2026 },
      body: () => `
        <div class="mg-hero">${odo(fmt(places))}</div>
        <p class="mg-lede tight">towns and villages are near a closed line and no open one, rising on the map as they lose it. Home today to</p>
        <div class="mg-hero second">${odo(fmt(people))}</div>
        <p class="mg-lede">people. The largest:</p>
        <ol class="mg-towns">
          ${BIG_TOWNS.map(([name, pop, yr], i) => `<li style="--w:${(pop / BIG_TOWNS[0][1]) * 100}%; --i:${i}"><button type="button" class="town-link" data-town="${esc(name)}">${esc(name)}</button><i></i><b>${fmt(pop)}</b><span>${yr}</span></li>`).join("")}
        </ol>`,
    },
    {
      kicker: "What if", title: "If the lines still ran",
      scene: { year: 2026 },
      body: () => `
        <div class="mg-hero">${odo(fmt(j.central / 1e6, 1), { pre: "≈", unit: "m" })}</div>
        <p class="mg-lede">journeys a year with a regular service, about a quarter more than the whole network carries today.</p>
        <div class="mg-range" aria-label="Low ${mil(j.low)}, central ${mil(j.central)}, high ${mil(j.high)} journeys a year; today about 67m">
          <div class="mg-range-bar"><i style="--a:${(j.low / SCALE) * 100}%; --b:${(j.high / SCALE) * 100}%"></i><em style="--x:${(j.central / SCALE) * 100}%"></em><u style="--x:${(67.5e6 / SCALE) * 100}%"></u></div>
          <div class="mg-range-key"><span style="--x:${(j.low / SCALE) * 100}%">${mil(j.low)}</span><span style="--x:${(j.central / SCALE) * 100}%">${mil(j.central)}</span><span style="--x:${(j.high / SCALE) * 100}%">${mil(j.high)}</span><span class="today" style="--x:${(67.5e6 / SCALE) * 100}%">today ≈ 67m</span></div>
        </div>
        <p class="mg-note">A token service lands at the low end, as Ennis–Athenry did; a frequent one near the middle, as Scotland's Borders Railway did.</p>`,
    },
    {
      kicker: "Roads", title: "Off the roads",
      scene: { year: 2026, townsFilter: (p) => Boolean(p.belt) },
      body: () => `
        <div class="mg-hero">${odo(fmt(cars), { pre: "≈" })}</div>
        <p class="mg-lede">car trips a weekday replaced, most of them in the commuter belts: the towns still standing on the map.</p>
        <ul class="mg-chips">
          ${["N3 Navan–Dublin", "East Belfast", "A1 Banbridge", "N28 Carrigaline–Cork", "Derry–Strabane–Letterkenny"].map((c, i) => `<li style="--i:${i}">${esc(c)}</li>`).join("")}
        </ul>
        <p class="mg-note">That would ease these corridors. City congestion is mostly trips within the city, so it would barely change.</p>`,
    },
    {
      kicker: "Freight", title: "Almost all of it goes by road",
      scene: { year: 2026, ports: true },
      body: () => `
        <div class="mg-hero lost">${odo("0.6", { unit: "%" })}</div>
        <p class="mg-lede">of freight goes by rail in the Republic (tonne-km). Northern Ireland has none.</p>
        <div class="mg-share" aria-label="Rail 0.6 percent, road 99.4 percent"><i class="rail"></i><i class="road"></i></div>
        <div class="mg-split-key"><span class="kept">rail 0.6%</span><span class="road">road 99.4%</span></div>
        <div class="mg-trio">
          <div><b>${odo("3–8", { unit: "Mt" })}</b><span>a year won back: 1912 levels</span></div>
          <div><b>${odo("500–1,300")}</b><span>fewer lorries a weekday</span></div>
          <div><b>${odo("76", { pre: "−", unit: "%" })}</b><span>CO₂ per tonne</span></div>
        </div>
        <p class="mg-note">An illustration only. Freight follows ports, terminals and track charges, so reopening branch lines wouldn't bring it back by itself.</p>`,
    },
  ];
}

// The full method: FINDINGS.md rendered, town names linked.
function linkTownNames(root, names) {
  if (!names.length) return;
  const re = new RegExp(`\\b(${names.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "g");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement.closest("td, li, p") && !n.parentElement.closest("a, button, th, code")
      ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.nodeValue;
    re.lastIndex = 0;
    if (!re.test(text)) continue;
    const frag = document.createDocumentFragment();
    let last = 0;
    text.replace(re, (name, _g, at) => {
      frag.append(text.slice(last, at));
      const b = Object.assign(document.createElement("button"), { type: "button", className: "town-link", textContent: name });
      b.dataset.town = name;
      frag.append(b);
      last = at + name.length;
    });
    frag.append(text.slice(last));
    node.replaceWith(frag);
  }
}

const CHECK_MARK = { ok: ["✓", "Checked against the source"], fixed: ["✓", "Corrected to the source"], est: ["≈", "Our own computation or estimate"], "": ["", ""] };

export async function setupFindings({ view, findTown, towns, rail = [], impact = null, applyScene, onToggle }) {
  const drawer = document.getElementById("findings");
  const body = document.getElementById("findingsBody");
  const title = document.getElementById("findingsTitle");
  const narrow = () => window.innerWidth <= 600;

  // Closures by decade from the map's own lines, and every km ever built (in use + closed).
  const byDecade = new Map();
  let totalKm = 0, lostKm = 0;
  for (const f of rail) {
    const p = f.properties;
    if (p.status === "current" || p.closed_year) totalKm += p.km || 0;
    if (p.status !== "current" && p.closed_year) {
      lostKm += p.km || 0;
      const d = Math.floor(p.closed_year / 10) * 10;
      byDecade.set(d, (byDecade.get(d) || 0) + (p.km || 0));
    }
  }
  const closedByDecade = [];
  for (let d = 1930; d <= 2000; d += 10) closedByDecade.push([d, Math.round(byDecade.get(d) || 0)]);
  const CARDS = cards({ closedByDecade, totalKm: Math.round(totalKm) || 5727, lostKm: Math.round(lostKm) || 3676, impact });

  const byName = new Map();
  for (const f of towns.features) {
    const p = f.properties;
    if (p.pop >= LINK_MIN_POP && !p.pop_assumed && !byName.has(p.name)) byName.set(p.name, f);
  }

  // ---- The motion piece ----
  body.className = "mg";
  body.innerHTML = `
    <div class="mg-progress" role="tablist" aria-label="Findings">${CARDS.map((c, i) => `<button type="button" role="tab" data-go="${i}" aria-label="${esc(c.title)}"><i></i></button>`).join("")}</div>
    <div class="mg-stage" aria-live="polite"></div>
    <div class="mg-controls">
      <button type="button" class="mg-prev" aria-label="Previous">‹</button>
      <button type="button" class="mg-play" aria-label="Pause">❚❚</button>
      <button type="button" class="mg-next" aria-label="Next">›</button>
      <span class="mg-step"></span>
      <button type="button" class="mg-sources">Sources</button>
    </div>
    <div class="mg-pane mg-sources-pane" hidden></div>
    <div class="mg-pane md mg-fullmd" hidden></div>`;
  const stage = body.querySelector(".mg-stage");
  const bars = [...body.querySelectorAll(".mg-progress button")];
  const playBtn = body.querySelector(".mg-play");
  const sourcesPane = body.querySelector(".mg-sources-pane");
  const fullPane = body.querySelector(".mg-fullmd");
  let index = 0, playing = !reduceMotion(), timer = null, sceneTimer = null, shownAt = 0, elapsed = 0;

  const setProgress = () => {
    bars.forEach((b, i) => {
      b.classList.toggle("done", i < index);
      b.classList.toggle("now", i === index);
      b.setAttribute("aria-selected", String(i === index));
    });
    body.style.setProperty("--card-ms", `${CARD_MS}ms`);
    body.classList.toggle("paused", !playing);
    playBtn.textContent = playing ? "❚❚" : "▶";
    playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    body.querySelector(".mg-step").textContent = `${index + 1} / ${CARDS.length}`;
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!playing) return;
    timer = setTimeout(() => show(index + 1), Math.max(0, CARD_MS - elapsed));
  };
  // The map: straight to the card's starting year, then on to its scene, so the change plays out
  // while the numbers roll.
  // (The map applies a year on its next animation frame, so the scene waits two frames, until
  // the starting year has really been drawn, and a beat more.)
  let sceneRaf = 0;
  const moveMap = (c) => {
    clearTimeout(sceneTimer);
    cancelAnimationFrame(sceneRaf);
    if (c.from && !reduceMotion()) {
      applyScene({ ...c.scene, year: c.from, instant: true, keepView: true });
      sceneRaf = requestAnimationFrame(() => {
        sceneRaf = requestAnimationFrame(() => { sceneTimer = setTimeout(() => applyScene(c.scene), 60); });
      });
    } else applyScene(c.scene);
  };
  const show = (i, { map = true } = {}) => {
    index = (i + CARDS.length) % CARDS.length;
    const c = CARDS[index];
    const card = document.createElement("article");
    card.className = "mg-card";
    card.innerHTML = `<p class="mg-kicker">${esc(c.kicker)}</p><h3 class="mg-title">${esc(c.title)}</h3>${c.body()}`;
    stage.replaceChildren(card);
    stage.scrollTop = 0;
    void card.offsetWidth; // start its entrance afresh
    card.classList.add("in", "odo-go");
    const now = bars[index].querySelector("i");
    now.style.animation = "none"; void now.offsetWidth; now.style.animation = "";
    elapsed = 0; shownAt = performance.now();
    setProgress();
    schedule();
    if (map) moveMap(c);
  };
  const pause = () => { if (!playing) return; playing = false; elapsed += performance.now() - shownAt; clearTimeout(timer); setProgress(); };
  const play = () => { if (playing) return; playing = true; shownAt = performance.now(); setProgress(); schedule(); };

  body.querySelector(".mg-prev").addEventListener("click", () => show(index - 1));
  body.querySelector(".mg-next").addEventListener("click", () => show(index + 1));
  playBtn.addEventListener("click", () => (playing ? pause() : play()));
  bars.forEach((b, i) => b.addEventListener("click", () => show(i)));

  // ---- Sources, and the full method behind them ----
  const openPane = (pane) => {
    pause();
    body.classList.add("aside");
    sourcesPane.hidden = pane !== sourcesPane;
    fullPane.hidden = pane !== fullPane;
    pane.scrollTop = 0;
  };
  const closePanes = () => {
    body.classList.remove("aside");
    sourcesPane.hidden = fullPane.hidden = true;
    show(index, { map: false });
  };
  const renderSources = () => {
    sourcesPane.innerHTML = `
      <button type="button" class="mg-back">‹ Back to the findings</button>
      <h3 class="mg-title">Sources</h3>
      <p class="mg-note">Rough, order-of-magnitude estimates. <b class="mg-mark">✓</b> checked against the source (a red one was corrected to it); <b class="mg-mark est">≈</b> worked out here from the map and census data.</p>
      <ol class="mg-srclist">${SOURCES.map((s) => {
        const [mark, tip] = CHECK_MARK[s.check] || CHECK_MARK[""];
        const name = s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title);
        return `<li>${mark ? `<span class="mg-mark ${esc(s.check)}" title="${esc(tip)}">${mark}</span>` : "<span class=\"mg-mark\"></span>"}<div>${name}<small>${esc(s.what)}${s.note ? ` · <em>${esc(s.note)}</em>` : ""}</small></div></li>`;
      }).join("")}</ol>
      <button type="button" class="mg-method">Read the full method ›</button>`;
    sourcesPane.querySelector(".mg-back").addEventListener("click", closePanes);
    sourcesPane.querySelector(".mg-method").addEventListener("click", showMethod);
  };
  let methodLoaded = false;
  const showMethod = async () => {
    openPane(fullPane);
    if (methodLoaded) return;
    methodLoaded = true;
    try {
      const res = await fetch("analysis/FINDINGS.md");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fullPane.innerHTML = window.marked.parse(await res.text());
      fullPane.querySelector("h1")?.remove();
      linkTownNames(fullPane, [...byName.keys()].sort((a, b) => b.length - a.length));
    } catch (err) {
      fullPane.textContent = `Couldn't load the method (${err.message}).`;
    }
    const back = Object.assign(document.createElement("button"), { type: "button", className: "mg-back", textContent: "‹ Back to the sources" });
    back.addEventListener("click", () => openPane(sourcesPane));
    fullPane.prepend(back);
  };
  body.querySelector(".mg-sources").addEventListener("click", () => { renderSources(); openPane(sourcesPane); });

  // Town names (on the cards or in the method) fly to the town.
  body.addEventListener("click", async (e) => {
    const name = e.target.closest(".town-link")?.dataset.town;
    if (!name || !byName.has(name)) return;
    pause();
    applyScene({ year: 2026, keepView: true });
    if (narrow()) setOpen(false);
    const [lon, lat] = byName.get(name).geometry.coordinates;
    await view.goTo({ center: [lon, lat], zoom: 10, tilt: 60 });
    const column = findTown(name);
    if (column) view.openPopup({ features: [column], location: column.geometry });
  });

  // ---- The drawer ----
  title.textContent = "Findings";
  const setOpen = (open, startAt = 0) => {
    showDrawer(drawer, open);
    document.body.classList.toggle("findings-open", open);
    onToggle();
    if (open) {
      body.classList.remove("aside");
      sourcesPane.hidden = fullPane.hidden = true;
      playing = !reduceMotion();
      show(startAt);
    } else {
      clearTimeout(timer);
      clearTimeout(sceneTimer);
      cancelAnimationFrame(sceneRaf);
    }
  };
  document.getElementById("closeFindings").addEventListener("click", () => setOpen(false));
  // Any [data-open-findings], including ones the story adds later; data-card picks the card.
  document.addEventListener("click", (e) => {
    const el = e.target.closest?.("[data-open-findings]");
    if (!el) return;
    e.preventDefault();
    setOpen(true, Number(el.dataset.card) || 0);
  });
  document.addEventListener("keydown", (e) => {
    if (drawer.hidden || body.classList.contains("aside")) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable]")) return; // the year slider keeps its arrows
    if (e.key === "ArrowRight") show(index + 1);
    else if (e.key === "ArrowLeft") show(index - 1);
  });
}
