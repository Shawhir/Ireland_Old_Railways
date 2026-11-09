// The story, in nine chapters: how the railway grew, why it fell, the fall itself, what that did
// to travel and to the places it left, and what keeping the lines would mean for people, the
// economy and the environment. Each chapter sets the map up (year, camera, which towns) and
// puts the numbers beside it.
//
// Figures are sourced (see SOURCES) or computed from the map's own data. Where a figure is
// an estimate it says so in the text.

import { smallMultiples, statRow, barChart } from "./story-charts.js";
import { showDrawer } from "./drawer.js";

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Island population by census: Republic (CSO A0102 / census) + Northern Ireland (NISRA).
// Census years pair up as 1936/37, 2002/01 and 2022/21.
const POPULATION = [
  [1911, 4390219], [1926, 4228553], [1936, 4248165], [1951, 4331514], [1961, 4243383],
  [1971, 4514313], [1981, 4975405], [1991, 5103555], [2002, 5602470], [2011, 6399115], [2022, 7052314],
];
// Licensed private cars in the Republic (Dáil answers; CSO Transport Omnibus / TEA11).
const CARS_ROI = [
  [1930, 34653], [1950, 85140], [1959, 154054], [1961, 186302], [1970, 389338], [1976, 551117],
  [1978, 638740], [1989, 773396], [2000, 1319250], [2010, 1872715], [2020, 2215127], [2022, 2255971],
];
// Motorway in the Republic, km (first opened 1983; TII National Route Lengths / network indicators).
const MOTORWAY_ROI = [[1982, 0], [1990, 26], [2004, 192], [2005, 247], [2013, 897], [2018, 969], [2022, 995]];
// Rail passenger journeys in the Republic, millions (CSO TCA01).
const RAIL_JOURNEYS_ROI = [
  [1981, 15.37], [1983, 13.03], [1985, 20.09], [1990, 26.77], [1995, 27.12], [2000, 31.72],
  [2007, 45.51], [2010, 38.07], [2013, 36.74], [2019, 50.06], [2020, 17.93], [2022, 35.85], [2024, 50.66], [2025, 55.04],
];

// Lines the All-Island Strategic Rail Review (2024) recommends rebuilding, through these
// towns (plus Navan, in the NTA's Greater Dublin plan).
const REBUILD_TOWNS = ["Dungannon", "Omagh", "Strabane", "Letterkenny", "Armagh", "Monaghan", "Clones", "Cavan", "Tuam", "New Ross", "Navan"];

// Emissions, g CO2e per km. UK DESNZ greenhouse gas conversion factors, used as a proxy for
// Ireland: an average car per vehicle-km, and national rail (mostly diesel here) per passenger-km.
const G_CAR = 170, CAR_OCCUPANCY = 1.6, G_TRAIN = 35;
// For the "if they ran today" saving: an assumed 40 km average regional trip, the same share of
// rail journeys that replace a car-driver trip as analysis/estimate.mjs, and 15,000 km a year per car.
const TRIP_KM = 40, CAR_DRIVER_SHARE = (1 - 0.35) * 0.57, CAR_KM_YEAR = 15000;
const tonnesSaved = (journeys) => (journeys * TRIP_KM * (CAR_DRIVER_SHARE * G_CAR - G_TRAIN)) / 1e6;

const SOURCES = {
  hmso: "HMSO, Railway Statistics of Ireland (1913)",
  cso1916: "CSO, Ireland in 1916",
  census: "CSO census (A0102); NISRA census",
  dail: "Dáil and Seanad debates (CIÉ losses, closures)",
  cars: "Dáil answers 1931–1990; CSO Transport Omnibus 2020 and TEA11",
  tii: "TII National Route Lengths; TII network indicators 2022; DfI NI road statistics 2025",
  cso2022: "CSO Census 2022, Profile 7: commuting",
  railJ: "CSO TCA01 rail passenger journeys",
  tomtom: "TomTom Traffic Index 2025",
  epa: "EPA provisional greenhouse gas emissions 1990–2024",
  desnz: "UK DESNZ greenhouse gas conversion factors (car per vehicle-km, national rail per passenger-km)",
  epaAir: "EPA, Air Quality in Ireland 2022",
  eurostat: "Eurostat, modal split of inland freight",
  aisrr: "All-Island Strategic Rail Review (2024)",
  nce: "New Civil Engineer, 'New rail lines eyed in £31bn Republic and Northern Ireland vision' (12 August 2024)",
  acts: "Tramways and Public Companies (Ireland) Act 1883; Light Railways (Ireland) Act 1889",
  history: "Railways Act 1924; Transport Act 1944; Transport Act (Northern Ireland) 1948; Beddy Report (1957); Benson Report (1963)",
  map: "This map: OpenHistoricalMap lines; OSM towns with 2021/22 census populations",
};
const sources = (...keys) => `<p class="story-src">Sources: ${keys.map((k) => SOURCES[k]).join("; ")}.</p>`;

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
  const RAIL_KM = railSeries.filter((r) => r.year >= 1910).map((r) => [r.year, r.railKm]);

  const color = { rail: css("--viz-rail"), people: css("--viz-people"), cars: css("--viz-cars"), roads: css("--viz-roads") };
  const accent = { brand: css("--brand"), closures: css("--line-lost"), town: css("--town"), air: "#0f8f7f", bill: "#b4321f" };
  const km = (v) => `${Math.round(v).toLocaleString()} km`;
  const band = [1950, 1970, "the closures"];

  const rebuild = towns.features.filter((f) => REBUILD_TOWNS.includes(f.properties.name));
  const rebuildPop = rebuild.reduce((s, f) => s + f.properties.pop, 0);
  const lost1950 = railAt(1950).railKm, lost1970 = railAt(1970).railKm;
  const fmtM = (n, d = 1) => `${(n / 1e6).toFixed(d)}m`;

  // From the map: the network at its peak, and what's left.
  const peak = railSeries.reduce((m, r) => (r.railKm > m.railKm ? r : m), { railKm: 0 });
  const last = railSeries[railSeries.length - 1] || {};
  const RAIL_KM_ALL = railSeries.map((r) => [r.year, r.railKm]);
  // The biggest places that lost their station, and how many were in the commuter belts.
  const biggest = [...towns.features].sort((x, y) => y.properties.pop - x.properties.pop).slice(0, 8);
  const beltTowns = towns.features.filter((f) => f.properties.belt);
  const beltPop = beltTowns.reduce((n, f) => n + f.properties.pop, 0);
  const over5k = towns.features.filter((f) => f.properties.pop >= 5000).length;
  const saved = { low: tonnesSaved(impact.journeys.low), central: tonnesSaved(impact.journeys.central), high: tonnesSaved(impact.journeys.high) };
  const kt = (t) => `${Math.round(t / 1000)}k`;

  const chapters = [
    // 1. Growth
    {
      kicker: "Growth", accent: accent.brand,
      title: "1834–1920: an island laced with rail",
      scene: () => { api.setTownsFilter(null); api.goHome(); api.play(1834, 1920, 55); },
      render: (el) => {
        el.innerHTML = `<p>Ireland's first passenger railway, Dublin to Kingstown (Dún Laoghaire), opened in 1834. The main lines followed in the 1840s to 1860s, out from Dublin and Belfast to Cork, Galway, Sligo, Derry and the ports.</p><p>From the 1880s the state paid to push light railways and tramways, many of them narrow gauge, into the poorer west and north-west: to Dingle, Achill, Clifden, Burtonport and West Clare.</p>`;
        smallMultiples(el, [{ label: "Railway open", note: "whole island", color: color.rail, points: RAIL_KM_ALL.filter(([y]) => y <= 1920), format: km }], { from: 1834, to: 1920, ticks: [1840, 1860, 1880, 1900, 1920] });
        statRow(el, [
          { value: km(peak.railKm), label: "of railway at its peak", sub: String(peak.year), accent: color.rail },
          { value: "964", label: "stations", sub: "1916" },
          { value: "30.8m", label: "journeys a year", sub: "1911" },
          { value: "4.4m", label: "people", sub: "1911", accent: color.people },
        ]);
        el.insertAdjacentHTML("beforeend", `<p>That's about <b>1.3 km of railway for every 1,000 people</b>. Almost every town of any size had a station. Besides passengers, the trains carried post, coal, cattle and 6.7 million tons of goods a year.</p>${sources("map", "acts", "hmso", "cso1916", "census")}`);
      },
    },
    // 2. Why they fell
    {
      kicker: "Why they fell", accent: accent.closures,
      title: "Border, war, the road, and a shrinking country",
      scene: () => { api.setTownsFilter(null); api.goHome(); api.play(1920, 1956, 200); },
      render: (el) => {
        el.innerHTML = `<p>The decline started decades before the big closures:</p>
          <ul class="story-list">
            <li><b>Partition, 1921.</b> A new border cut across the network. Lines in the north-west and along the border crossed it again and again, with customs stops on the way.</li>
            <li><b>The Civil War, 1922–23.</b> Lines, stations and bridges were attacked; the Mallow viaduct was blown up.</li>
            <li><b>Too many small companies.</b> In 1925 the southern railways were merged into one, the Great Southern, to cut costs.</li>
            <li><b>The road.</b> From the 1920s buses and lorries went door to door, cheaper and more flexible than a branch line with two trains a day.</li>
            <li><b>The Emergency, 1939–45.</b> Coal ran short; trains ran slowly on poor fuel, and services were cut.</li>
            <li><b>Losses and reports.</b> Nationalised as CIÉ (1945, fully in 1950) and the Ulster Transport Authority (1948), the railways kept losing money: CIÉ lost about £2.6 million in 1957/58. The Beddy (1957) and Benson (1963) reports recommended deep cuts.</li>
          </ul>
          <p>People were also leaving, and the closures were planned for a falling population. The Republic's population reached its lowest recorded level in <b>1961</b>.</p>`;
        smallMultiples(el, [
          { label: "Railway open", note: "whole island", color: color.rail, points: RAIL_KM, format: km },
          { label: "People on the island", color: color.people, points: POPULATION, format: (v) => fmtM(v, 2) },
        ], { band });
        statRow(el, [
          { value: km(railAt(1920).railKm - railAt(1950).railKm), label: "closed before 1950", sub: "1920–1950", accent: accent.closures },
          { value: "4.24m", label: "people on the island in 1961", sub: "the low point", accent: color.people },
        ]);
        el.insertAdjacentHTML("beforeend", sources("history", "dail", "census", "map"));
      },
    },
    // 3. The fall
    {
      kicker: "The fall", accent: accent.closures,
      title: "1950–1975: the lines come up",
      scene: () => { api.setTownsFilter(null); api.goHome(); api.play(1945, 1976, 230); },
      render: (el) => {
        el.innerHTML = `<p>In twenty years, almost half the network was closed and lifted. The Tralee and Dingle closed in 1953, Dublin's Harcourt Street line in 1958 and the West Clare in 1961. Stormont closed most of the Great Northern lines west of the main line in 1957, and the "Derry Road" through Omagh went in 1965. By the mid-1970s, the network was the size it is today.</p>`;
        statRow(el, [
          { value: km(lost1950 - lost1970), label: "closed in 20 years", sub: `${Math.round((1 - lost1970 / lost1950) * 100)}% of the 1950 network`, accent: accent.closures },
          { value: km(peak.railKm - last.railKm), label: "gone since the peak", sub: `${Math.round((1 - last.railKm / peak.railKm) * 100)}% of the ${peak.year} network`, accent: accent.closures },
          { value: km(last.railKm), label: "left today", accent: color.rail },
        ]);
        smallMultiples(el, [{ label: "Railway open", note: "whole island", color: color.rail, points: RAIL_KM_ALL, format: km }], { from: 1834, to: 2026, band, ticks: [1850, 1900, 1950, 2000] });
        el.insertAdjacentHTML("beforeend", sources("dail", "map"));
      },
    },
    // 4. Travel
    {
      kicker: "Travel", accent: color.cars,
      title: "The car filled the gap",
      scene: () => { api.setTownsFilter(null); api.goHome(); api.play(1955, 2026, 70); },
      render: (el) => {
        el.innerHTML = `<p>As the railway shrank, the population began to grow again, and car numbers rose with it. In 1930 there was one car for every 86 people in the Republic; today there's one for every 2.3. The Republic's first motorway opened in 1983; it now has about 1,000 km, and the North 115 km.</p>`;
        smallMultiples(el, [
          { label: "Railway open", note: "whole island", color: color.rail, points: RAIL_KM, format: km },
          { label: "People", note: "whole island", color: color.people, points: POPULATION, format: (v) => fmtM(v, 1) },
          { label: "Private cars", note: "Republic", color: color.cars, points: CARS_ROI, format: (v) => (v >= 1e6 ? fmtM(v, 2) : `${Math.round(v / 1000)}k`) },
          { label: "Motorway", note: "Republic", color: color.roads, points: MOTORWAY_ROI, format: km },
        ], { band });
        statRow(el, [
          { value: "26×", label: "more cars than in 1950", sub: "Republic", accent: color.cars },
          { value: "45% → 63%", label: "of commuters go by car", sub: "1986 → 2022, Republic", accent: color.cars },
          { value: "29 min", label: "average commute", sub: "2022, up from 26.6 in 2011", accent: color.cars },
        ]);
        el.insertAdjacentHTML("beforeend", `<p>Where a line still runs, people use it: rail journeys in the Republic have more than tripled since the early 1980s and set a record in 2025. Most of the island has no train to take.</p>`);
        smallMultiples(el, [{ label: "Rail journeys a year", note: "Republic, millions", color: color.rail, points: RAIL_JOURNEYS_ROI, format: (v) => `${v.toFixed(0)}m` }], { from: 1980, to: 2025, ticks: [1985, 2000, 2015] });
        el.insertAdjacentHTML("beforeend", `<p class="story-src">The 2020 dip is COVID.</p>${sources("map", "census", "cars", "tii", "cso2022", "railJ")}`);
      },
    },
    // 5. The places hit
    {
      kicker: "The places hit", accent: accent.town,
      title: "Whole counties left without a train",
      scene: () => {
        api.setYear(2026);
        api.setTownsFilter(null);
        api.flyTo({ center: [-7.5, 54.45], scale: 2200000, tilt: 35 });
      },
      render: (el) => {
        el.innerHTML = `<p>The purple columns are the towns and villages that lost their railway, taller for more people. The north-west and the border areas lost the most: <b>Donegal, Tyrone, Fermanagh, Cavan and Monaghan</b> have no railway at all today. Derry and Sligo are each at the end of a single line.</p>`;
        statRow(el, [
          { value: last.townsCutOff.toLocaleString(), label: "towns and villages cut off", accent: accent.town },
          { value: fmtM(last.peopleToday, 2), label: "people live in them today", accent: accent.town },
          { value: String(over5k), label: "of them towns of 5,000 or more" },
          { value: "1.30 → 0.29", label: "km of railway per 1,000 people", sub: "1920s → today: 78% less", accent: color.rail },
        ]);
        barChart(el, biggest.map((f) => ({ label: f.properties.name, sub: f.properties.closed_year ? `lost its line ${f.properties.closed_year}` : "", value: f.properties.pop, color: accent.town })), { title: "The biggest places that lost their railway", note: "people today", format: (v) => v.toLocaleString() });
        el.insertAdjacentHTML("beforeend", `<p>Some of them have since become commuter towns: <b>${beltTowns.length}</b> places in the belts around Dublin, Belfast and Cork, home to <b>${Math.round(beltPop / 1000)}k people</b>, lost their stations, and their commuters now go by road.</p>${sources("map")}`);
      },
    },
    // 6. People
    {
      kicker: "If they'd stayed: people", accent: color.people,
      title: "Another way to travel, and cleaner air",
      scene: () => { api.setYear(2026); api.setTownsFilter(null); api.goHome(); },
      render: (el) => {
        el.innerHTML = `<p>If the closed lines ran today, with trains as frequent as on the lines that survived, the ${fmtM(impact.people, 2)} people in those towns would have a way to travel that most of them don't have now.</p>`;
        statRow(el, [
          { value: `~${fmtM(impact.journeys.central, 0)}`, label: "rail journeys a year", sub: `estimate, ${fmtM(impact.journeys.low, 0)}–${fmtM(impact.journeys.high, 0)}`, accent: color.rail },
          { value: `~${Math.round(impact.carTripsPerWeekday.central / 1000)}k`, label: "car trips off the road each weekday", sub: `estimate, ${Math.round(impact.carTripsPerWeekday.low / 1000)}k–${Math.round(impact.carTripsPerWeekday.high / 1000)}k`, accent: color.cars },
          { value: "~1,700", label: "early deaths a year from poor air", sub: "Ireland, mostly from fine particles; traffic is a main source of city NO₂", accent: accent.air },
        ]);
        el.insertAdjacentHTML("beforeend", `<p>A station gives people who can't or don't drive (the young, the old, people who can't afford a car) a way to reach work, college, hospitals and family on their own. Passengers can use their time on a train in a way drivers can't. Fewer cars would also mean less of the nitrogen dioxide that traffic puts into town streets.</p>${sources("epaAir", "map")}<p class="story-src">Estimates: Findings, "If they were all running today".</p>`);
      },
    },
    // 7. Economy
    {
      kicker: "If they'd stayed: economy", accent: accent.bill,
      title: "Less time lost, towns within reach",
      scene: () => {
        api.setYear(2026);
        api.setTownsFilter((p) => Boolean(p.belt));
        api.flyTo({ center: [-6.55, 53.85], scale: 1600000, tilt: 40 });
      },
      render: (el) => {
        el.innerHTML = `<p>On an island of 7 million where most people drive, a lot of time is lost in traffic. Purple on the map: the commuter-belt towns around Dublin, Belfast and Cork that lost their stations, from Navan to Carrigaline, Banbridge and Comber.</p>`;
        statRow(el, [
          { value: "191 h", label: "lost a year in Dublin rush-hour traffic", sub: "per driver; Cork 107, Belfast 102", accent: accent.bill },
          { value: "~1%", label: "of inland freight goes by rail", sub: "one of the lowest shares in Europe", accent: color.cars },
        ]);
        el.insertAdjacentHTML("beforeend", `<p>Every extra car on the road slows the ones already there. A double-track railway can move far more people an hour than a motorway lane, without the queues. A station lets people in a town reach jobs in the city, and brings people from the city to the town's housing and as visitors.</p><p>Freight could make a bigger difference. Rail carries almost none of it, so lorries carry nearly all, often on the same roads as the commuters. A single freight train can do the work of dozens of lorries.</p>${sources("tomtom", "eurostat", "map")}`);
      },
    },
    // 8. Environment
    {
      kicker: "If they'd stayed: environment", accent: accent.air,
      title: "A fifth of the carbon",
      scene: () => { api.setYear(2026); api.setTownsFilter(null); api.goHome(); },
      render: (el) => {
        const carsEq = Math.round(saved.central / ((CAR_KM_YEAR * G_CAR) / 1e6) / 100) * 100;
        el.innerHTML = `<p>The car is the dirtiest way to move people. For every kilometre travelled, a train passenger puts out about <b>a fifth of the CO₂</b> of someone driving alone, and still about a third even when the car is shared.</p>`;
        barChart(el, [
          { label: "Car", sub: "driver alone", value: G_CAR, color: color.cars },
          { label: "Car", sub: `${CAR_OCCUPANCY} people (average)`, value: Math.round(G_CAR / CAR_OCCUPANCY), color: color.cars },
          { label: "Train", sub: "average, Great Britain's railways", value: G_TRAIN, color: color.rail },
        ], { title: "CO₂ per passenger-km", note: "grams", format: (v) => `${v} g` });
        statRow(el, [
          { value: `${Math.round(G_CAR / G_TRAIN)}×`, label: "less CO₂ per km by train than driving alone", accent: color.rail },
          { value: "22%", label: "of the Republic's emissions are transport", sub: "2025, up from about 9% in 1990", accent: color.cars },
          { value: "49%", label: "of road transport emissions come from cars", accent: color.cars },
        ]);
        el.insertAdjacentHTML("beforeend", `
          <div class="story-callout"><b>If the closed lines ran today:</b> about <b>${kt(saved.central)} tonnes of CO₂ a year</b> saved (${kt(saved.low)}–${kt(saved.high)}), after counting the trains' own diesel. That's the yearly exhaust of roughly <b>${carsEq.toLocaleString()} cars</b>. Electric trains, like the DART today, would save more and put no exhaust into town streets.</div>
          ${sources("desnz", "epa")}
          <p class="story-src">The saving is an estimate: it assumes a ${TRIP_KM} km average trip, the journey and car-switching figures from the Findings, and ${CAR_KM_YEAR.toLocaleString()} km a year per car.</p>`);
      },
    },
    // 9. Putting it back
    {
      kicker: "Putting it back", accent: "#3ce8ff",
      title: "2050: a plan to rebuild what was lifted",
      // The map and the page change to the future: the proposed network in light (future.js).
      future: true,
      scene: () => {
        api.setYear(2026);
        api.setTownsFilter((p) => REBUILD_TOWNS.includes(p.name));
        api.goHome();
      },
      render: (el) => {
        el.innerHTML = `<p>In August 2024 the two governments published the All-Island Strategic Rail Review, <i>a vision for a new age of rail</i>: 32 recommendations to carry out by 2050. Much of it puts back what was lifted:</p>
          <ul class="story-list">
            <li><b>A new line from Portadown to Derry</b>, with extensions into Tyrone and Donegal (Dungannon, Omagh, Strabane, Letterkenny).</li>
            <li><b>The Western Rail Corridor</b> reopened from Athenry to Claremorris, through Tuam.</li>
            <li><b>The South Wexford line</b> reopened, and lines to Armagh, Monaghan and Cavan.</li>
            <li><b>Faster and more often:</b> intercity lines upgraded for 200 km/h, double track across the country, a train at least every hour between cities and every two hours on rural routes.</li>
            <li><b>Electric:</b> intercity lines electrified with new electric trains, for a net-zero railway; and rail to Dublin, Belfast and Shannon airports.</li>
          </ul>`;
        statRow(el, [
          { value: "~2,300 → ~3,000", label: "km of railway", sub: "the review's count, today → 2050", accent: color.rail },
          { value: "700,000", label: "more people within 5 km of a station", sub: "from the new lines in the North Midlands and North West", accent: accent.town },
          { value: "65m → 180m+", label: "rail journeys a year", sub: "today → 2050", accent: color.rail },
          { value: "€35–37bn", label: "to do it all", sub: "2023 prices (£29–31bn)", accent: accent.bill },
        ]);
        el.insertAdjacentHTML("beforeend", `<p>The highlighted towns on the rebuilt corridors are home to <b>${Math.round(rebuildPop / 1000)}k people</b> today. Even at 3,000 km, the island would have a little over half the railway it had in ${peak.year}.</p>
          <p class="story-src">None of it is official policy yet in either jurisdiction: each scheme needs its own business case, and the cost has been questioned given the public finances.</p>
          <div class="story-fair"><strong>Caveats</strong>The people who closed them had reasons. Many of these lines were slow, infrequent and losing money, and some would still struggle if they had been kept as they were. The Ennis–Athenry reopening carried about half its forecast. The numbers show how much was given up just as the country began to grow, and how much it now costs to put back.</div>${sources("aisrr", "nce", "map")}`);
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
    c.render(body.querySelector(".story-content"));
    body.scrollTop = 0;
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
      // One drawer at a time.
      showDrawer(document.getElementById("findings"), false);
      document.body.classList.remove("findings-open");
    } else {
      api.stopPlay();
      api.setFuture(false);
      api.setTownsFilter(null);
    }
    api.onToggle();
    // Closing hands the space back to the map: glide the island back to the middle of it.
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
  // Opening Findings closes the story.
  document.querySelectorAll("[data-open-findings]").forEach((el) => el.addEventListener("click", () => {
    if (document.body.classList.contains("story-open")) setOpen(false);
  }));
}
