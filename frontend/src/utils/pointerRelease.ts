// Keep a row in place while an outside press is in progress, so blur cannot
// move its intended click target before pointerup/click.
let held = false;
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", () => { held = true; }, true);
  const release = () => { held = false; };
  document.addEventListener("pointerup", release, true);
  document.addEventListener("pointercancel", release, true);
}
export function afterPointerRelease(callback: () => void) {
  if (!held) { callback(); return; }
  const done = () => {
    document.removeEventListener("pointerup", done, true);
    document.removeEventListener("pointercancel", done, true);
    setTimeout(callback, 0);
  };
  document.addEventListener("pointerup", done, true);
  document.addEventListener("pointercancel", done, true);
}
