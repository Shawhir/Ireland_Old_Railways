// Works out the lost-railway scorch for a year off the page's thread (see lostfield.js).
import { reachFor, firstClocks, planClocks } from "./lostfield.js";

let features = null, presentYear = 0;
self.onmessage = ({ data: m }) => {
  if (m.type === "init") { features = m.features; presentYear = m.presentYear; return; }
  const reach = reachFor(features, m.year, presentYear);
  const clock = m.mode === "first" ? firstClocks(features, m.year, presentYear, m.now)
    : m.mode === "plan" ? planClocks(features, m.plan, m.now) : null;
  self.postMessage({ id: m.id, reach, clock }, [reach.buffer, ...(clock ? [clock.buffer] : [])]);
};
