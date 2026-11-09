// A popup that is only the ticket: no ArcGIS frame, title bar or buttons (its popup is built from
// components the page's CSS can't restyle). The ticket floats over the map pinned to the point
// clicked, follows it as the map moves, and goes when closed (the punched hole in its corner),
// on Escape, or when the map is clicked elsewhere. "Zoom to" is on the ticket itself.

// Every card on the page: opening one closes the others.
const cards = new Set();

export function createTicketPopup(view, { className = "" } = {}) {
  const el = document.createElement("div");
  el.className = `ticket-pop ${className}`.trim();
  el.hidden = true;
  el.setAttribute("role", "dialog");
  el.innerHTML = `<div class="ticket-pop-body"><button class="ticket-close" type="button" aria-label="Close">&times;</button><div class="ticket-pop-content"></div></div><span class="ticket-tail" aria-hidden="true"></span>`;
  const host = view.container;
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  host.appendChild(el);
  const body = el.querySelector(".ticket-pop-content");

  let point = null, geometry = null, watch = null;
  const place = () => {
    if (!point) return;
    const p = view.toScreen(point);
    const off = !p || p.x < 0 || p.y < 0 || p.x > view.width || p.y > view.height;
    el.style.visibility = off ? "hidden" : "visible";
    if (p) el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
  };
  const hide = () => {
    el.hidden = true;
    point = null;
    watch?.remove();
    watch = null;
  };
  const show = (html, at, shape = null) => {
    for (const other of cards) if (other !== api) other.hide();
    body.innerHTML = html;
    geometry = shape;
    point = at;
    el.hidden = false;
    view.closePopup?.();
    place();
    watch?.remove();
    watch = view.watch(["camera", "size"], place);
    el.querySelector(".ticket-close").focus({ preventScroll: true });
  };

  el.querySelector(".ticket-close").addEventListener("click", hide);
  el.addEventListener("click", (e) => {
    const zoom = e.target.closest("[data-ticket-zoom]");
    if (zoom && geometry) { e.preventDefault(); view.goTo(geometry.extent ? geometry.extent.expand(1.6) : geometry).catch(() => {}); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.hidden) hide(); });

  const api = { show, hide, get open() { return !el.hidden; } };
  cards.add(api);
  return api;
}
