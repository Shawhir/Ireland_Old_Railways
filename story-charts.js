// Small-multiple line charts for the story: one measure per chart, all on the same time
// axis, so reading down at any year compares them without a second y-axis. Hovering one
// chart moves a crosshair through all of them and shows each value for that year.
// Colours come from the validated palette in styles.css (--viz-*).

const W = 360, H = 86;
const PAD = { l: 8, r: 54, t: 10, b: 6 };
const AXIS_H = 18;

const fmtDefault = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}m` : Math.abs(v) >= 1e4 ? `${Math.round(v / 1e3)}k` : Math.round(v).toLocaleString());

// Value at a year, interpolated between the known points (null outside the series).
function valueAt(points, year) {
  if (year < points[0][0] || year > points[points.length - 1][0]) return null;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    if (year <= x1) return y0 + ((y1 - y0) * (year - x0)) / (x1 - x0 || 1);
  }
  return points[points.length - 1][1];
}

const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

/**
 * series: [{ label, color, points: [[year, value], ...], format?, note? }]
 * options: { from, to, band: [startYear, endYear, label], ticks: [years] }
 */
// `table: false` leaves out the "Show the numbers" table (the story's short chapters).
export function smallMultiples(container, series, { from = 1910, to = 2025, band = null, ticks = [1920, 1950, 1980, 2010], table = true } = {}) {
  const root = document.createElement("figure");
  root.className = "viz";
  const x = (year) => PAD.l + ((year - from) / (to - from)) * (W - PAD.l - PAD.r);
  const charts = [];

  series.forEach((s, idx) => {
    const fmt = s.format || fmtDefault;
    const max = Math.max(...s.points.map((p) => p[1])) * 1.08 || 1;
    const y = (v) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
    const last = idx === series.length - 1;

    const block = document.createElement("div");
    block.className = "viz-row";
    const head = document.createElement("div");
    head.className = "viz-head";
    head.innerHTML = `<span class="viz-key" style="background:${s.color}"></span><span class="viz-title">${s.label}</span>${s.note ? `<span class="viz-note">${s.note}</span>` : ""}`;
    block.append(head);

    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H + (last ? AXIS_H : 0)}`, role: "img", "aria-label": `${s.label}: ${fmt(s.points[0][1])} in ${s.points[0][0]}, ${fmt(s.points.at(-1)[1])} in ${s.points.at(-1)[0]}` });
    if (band) {
      svg.append(svgEl("rect", { x: x(band[0]), y: PAD.t - 6, width: x(band[1]) - x(band[0]), height: H - PAD.t + 6 - PAD.b + 2, class: "viz-band" }));
      if (idx === 0) {
        const t = svgEl("text", { x: (x(band[0]) + x(band[1])) / 2, y: PAD.t - 0.5, class: "viz-band-label", "text-anchor": "middle" });
        t.textContent = band[2];
        svg.append(t);
      }
    }
    svg.append(svgEl("line", { x1: PAD.l, x2: W - PAD.r, y1: y(0), y2: y(0), class: "viz-base" }));

    const pts = s.points.map(([yr, v]) => [x(yr), y(v)]);
    const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
    // The line draws itself left to right and the area fades in under it (styles.css, .viz-line).
    svg.append(svgEl("path", { d: `${line}L${pts.at(-1)[0]},${y(0)}L${pts[0][0]},${y(0)}Z`, fill: s.color, "fill-opacity": 0.1, class: "viz-area" }));
    svg.append(svgEl("path", { d: line, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round", class: "viz-line", pathLength: 1 }));

    // Label the start and the end only.
    const [sx, sy] = pts[0], [ex, ey] = pts.at(-1);
    svg.append(svgEl("circle", { cx: ex, cy: ey, r: 4, fill: s.color, class: "viz-dot" }));
    const endLabel = svgEl("text", { x: ex + 7, y: ey + 4, class: "viz-end" });
    endLabel.textContent = fmt(s.points.at(-1)[1]);
    svg.append(endLabel);
    const startLabel = svgEl("text", { x: sx, y: Math.max(sy - 6, 9), class: "viz-start" });
    startLabel.textContent = fmt(s.points[0][1]);
    svg.append(startLabel);

    if (last) {
      for (const t of ticks) {
        const tx = svgEl("text", { x: x(t), y: H + 13, class: "viz-tick", "text-anchor": "middle" });
        tx.textContent = t;
        svg.append(tx);
      }
    }

    // Hover layer: a crosshair and a dot that follow the pointer, shared across charts.
    const hair = svgEl("line", { y1: PAD.t - 4, y2: H - PAD.b, class: "viz-hair", visibility: "hidden" });
    const hdot = svgEl("circle", { r: 4, fill: s.color, class: "viz-dot", visibility: "hidden" });
    svg.append(hair, hdot);
    const hit = svgEl("rect", { x: 0, y: 0, width: W, height: H, fill: "transparent" });
    svg.append(hit);
    block.append(svg);
    root.append(block);
    charts.push({ s, fmt, y, svg, hair, hdot, hit });
  });

  const tip = document.createElement("div");
  tip.className = "viz-tip";
  tip.hidden = true;
  root.append(tip);

  const show = (year) => {
    const rows = [];
    for (const c of charts) {
      const v = valueAt(c.s.points, year);
      const vis = v === null ? "hidden" : "visible";
      c.hair.setAttribute("visibility", "visible");
      c.hair.setAttribute("x1", x(year));
      c.hair.setAttribute("x2", x(year));
      c.hdot.setAttribute("visibility", vis);
      if (v !== null) {
        c.hdot.setAttribute("cx", x(year));
        c.hdot.setAttribute("cy", c.y(v));
      }
      rows.push(`<div><span class="viz-key" style="background:${c.s.color}"></span>${c.s.label}<b>${v === null ? "–" : c.fmt(v)}</b></div>`);
    }
    tip.innerHTML = `<div class="viz-tip-year">${year}</div>${rows.join("")}`;
    tip.hidden = false;
  };
  const hide = () => {
    tip.hidden = true;
    for (const c of charts) {
      c.hair.setAttribute("visibility", "hidden");
      c.hdot.setAttribute("visibility", "hidden");
    }
  };
  for (const c of charts) {
    c.hit.addEventListener("pointermove", (e) => {
      const box = c.svg.getBoundingClientRect();
      const px = ((e.clientX - box.left) / box.width) * W;
      const year = Math.round(from + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (to - from));
      show(Math.min(to, Math.max(from, year)));
    });
    c.hit.addEventListener("pointerleave", hide);
  }

  // The same numbers as a table, for anyone who'd rather read than hover.
  const years = [...new Set(series.flatMap((s) => s.points.map((p) => p[0])))].sort((a, b) => a - b);
  const details = document.createElement("details");
  details.className = "viz-table";
  if (!table) details.hidden = true;
  details.innerHTML = `<summary>Show the numbers</summary><table><thead><tr><th>Year</th>${series.map((s) => `<th>${s.label}</th>`).join("")}</tr></thead><tbody>${years.map((yr) => `<tr><td>${yr}</td>${series.map((s) => { const p = s.points.find((q) => q[0] === yr); return `<td>${p ? (s.format || fmtDefault)(p[1]) : ""}</td>`; }).join("")}</tr>`).join("")}</tbody></table>`;
  root.append(details);

  container.append(root);
  return root;
}

// Horizontal bars for one measure across a few categories, sharing a zero baseline.
// bars: [{ label, sub?, value, color }]; the value is written at the end of each bar.
export function barChart(container, bars, { title, note, format = fmtDefault } = {}) {
  const root = document.createElement("figure");
  root.className = "viz";
  const max = Math.max(...bars.map((b) => b.value)) || 1;
  root.innerHTML = `${title ? `<div class="viz-head" style="margin-bottom:10px"><span class="viz-title">${title}</span>${note ? `<span class="viz-note">${note}</span>` : ""}</div>` : ""}
    <div class="viz-bars" role="list">${bars.map((b) => `
      <div class="viz-bar-row" role="listitem" title="${b.label}: ${format(b.value)}">
        <span class="viz-bar-label">${b.label}${b.sub ? `<small>${b.sub}</small>` : ""}</span>
        <span class="viz-bar-track"><span class="viz-bar" style="width:0;background:${b.color}" data-w="${(b.value / max) * 78}"></span><span class="viz-bar-value">${format(b.value)}</span></span>
      </div>`).join("")}</div>`;
  container.append(root);
  // Grow the bars in once they're on the page.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.querySelectorAll(".viz-bar").forEach((el) => { el.style.width = `${el.dataset.w}%`; });
  }));
  return root;
}

// A row of headline numbers. An optional accent colours the card's edge.
export function statRow(container, stats) {
  const row = document.createElement("div");
  row.className = "viz-stats";
  row.innerHTML = stats.map(({ value, label, sub, accent }) => `<div class="viz-stat"${accent ? ` style="--stat-accent:${accent}"` : ""}><div class="viz-stat-value">${value}</div><div class="viz-stat-label">${label}</div>${sub ? `<div class="viz-stat-sub">${sub}</div>` : ""}</div>`).join("");
  container.append(row);
  return row;
}
