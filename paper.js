// The map's animations move like cut paper on an animation stand: a new drawing every PAPER_MS
// (12 a second, "on twos" in old animators' terms), held in between. It's the look of the 1920
// sheet coming to life, and it spares the GPU: between steps nothing animated needs redrawing.
// The swans (swans.js), the lines and towns (lines3d.js, towns3d.js) and the scorch
// (lostland.js) all step together on this beat; the camera itself still moves smoothly.

export const PAPER_MS = 83;

// `now` (performance.now() ms) held to the start of its step.
export const paperTime = (now) => Math.floor(now / PAPER_MS) * PAPER_MS;

// Calls `fn` at the next step: for a render node to redraw then rather than every frame.
export function atNextStep(fn) {
  let timer = null;
  return () => {
    if (timer) return;
    const now = performance.now();
    timer = setTimeout(() => { timer = null; fn(); }, PAPER_MS - (now % PAPER_MS) + 1);
  };
}
