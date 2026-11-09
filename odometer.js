// A figure as a station's departure board would roll it: each digit is a little drum of 0-9
// three times over, spun two whole turns down into place, the right-hand digits turning longest
// and landing last; separators and units stay still. The roll plays when an ancestor gets the
// class "odo-go" (styles.css), so a card or chapter can start it as it comes in. Shared by the
// Findings (findings.js) and the story (story.js).

const ROLL_MS = 1500; // the longest a digit takes to roll into place

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function odo(text, { unit = "", pre = "" } = {}) {
  const chars = [...String(text)];
  const digits = chars.filter((c) => /\d/.test(c)).length;
  let seen = 0;
  const html = chars.map((c) => {
    if (!/\d/.test(c)) return `<span class="odo-c">${esc(c)}</span>`;
    const d = +c, k = seen++;
    const order = digits > 1 ? k / (digits - 1) : 1;
    return `<span class="odo-d" style="--d:${20 + d}; --t:${Math.round(ROLL_MS * (0.55 + 0.45 * order))}ms; --w:${Math.round(order * 120)}ms" aria-hidden="true"><span>${"0123456789".repeat(3).split("").map((x) => `<i>${x}</i>`).join("")}</span></span>`;
  }).join("");
  return `<span class="odo" role="text" aria-label="${esc(pre + text + (unit ? ` ${unit}` : ""))}">${pre ? `<span class="odo-pre">${esc(pre)}</span>` : ""}${html}${unit ? `<span class="odo-u">${esc(unit)}</span>` : ""}</span>`;
}
