// Open or close a side drawer (story, findings) with a short slide and fade instead of popping.
// The `hidden` attribute stays the source of truth: it's cleared before the slide in and set
// after the slide out (the animations are in styles.css: .drawer-in / .drawer-out).

const OUT_MS = 260;

export function showDrawer(el, open) {
  clearTimeout(el.drawerTimer);
  if (open) {
    el.hidden = false;
    el.classList.remove("drawer-out");
    el.classList.remove("drawer-in");
    void el.offsetWidth; // restart the entrance if it was mid-way
    el.classList.add("drawer-in");
  } else if (!el.hidden) {
    el.classList.remove("drawer-in");
    el.classList.add("drawer-out");
    el.drawerTimer = setTimeout(() => {
      el.hidden = true;
      el.classList.remove("drawer-out");
    }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : OUT_MS);
  }
}
