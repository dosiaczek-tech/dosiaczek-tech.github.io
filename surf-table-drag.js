/* Shared mouse dragging for forecast tables; touch retains native scrolling. */
(function (root) {
  "use strict";
  function attach(viewport, table) {
    let drag = null, suppressClick = false;
    function finishDrag() {
      if (!drag) return;
      const id = drag.id;
      drag = null;
      viewport.classList.remove("is-dragging");
      if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
    }
    viewport.addEventListener("pointerdown", event => {
      if (event.isPrimary && event.button === 0) suppressClick = false;
      if (event.pointerType !== "mouse" || event.button !== 0 || !event.isPrimary ||
          !table.contains(event.target) || viewport.scrollWidth <= viewport.clientWidth + 1) return;
      finishDrag();
      const left = viewport.scrollLeft;
      viewport.scrollTo({ left, behavior: "instant" });
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left, moved: false };
    });
    viewport.addEventListener("pointermove", event => {
      if (!drag || drag.id !== event.pointerId) return;
      if (!(event.buttons & 1)) { finishDrag(); return; }
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved) {
        if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return;
        drag.moved = true; suppressClick = true;
        viewport.classList.add("is-dragging");
        viewport.setPointerCapture(event.pointerId);
        const selection = root.getSelection();
        if (selection?.anchorNode && viewport.contains(selection.anchorNode)) selection.removeAllRanges();
      }
      event.preventDefault();
      viewport.scrollLeft = drag.left - dx;
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) viewport.addEventListener(type, event => {
      if (drag?.id === event.pointerId) finishDrag();
    });
    root.addEventListener("blur", finishDrag);
    table.addEventListener("dragstart", event => event.preventDefault());
    viewport.addEventListener("click", event => {
      // A completed drag may still generate a click. Keyboard activation remains available.
      if (suppressClick && event.detail > 0) {
        suppressClick = false; event.preventDefault(); event.stopPropagation();
      }
    }, true);
  }
  root.SurfTableDrag = { attach };
})(globalThis);
