/* On touch screens a map follows the page: one finger scrolls the page, two fingers move and zoom the map. */
(function (root) {
  "use strict";
  function attach(map) {
    if (!root.L?.Browser.touch || !root.matchMedia?.("(pointer: coarse)").matches) return;
    // Two fingers still move the map: Leaflet's pinch handler follows their midpoint.
    map.dragging.disable();
    const container = map.getContainer(), hint = document.createElement("div");
    hint.className = "surf-map-gesture-hint"; hint.setAttribute("aria-hidden", "true");
    hint.textContent = "Użyj dwóch palców, aby przesunąć mapę";
    container.append(hint);
    let start = null, timer = 0;
    const show = visible => {
      clearTimeout(timer); hint.classList.toggle("is-visible", visible);
      if (visible) timer = setTimeout(() => hint.classList.remove("is-visible"), 1500);
    };
    container.addEventListener("touchstart", event => {
      start = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
      if (!start) show(false);
    }, { passive: true });
    // A tap on a marker is not a drag; only a real one-finger move shows the hint.
    container.addEventListener("touchmove", event => {
      const touch = event.touches[0];
      if (start && event.touches.length === 1 && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 10) show(true);
    }, { passive: true });
  }
  root.SurfMapGestures = { attach };
})(globalThis);
