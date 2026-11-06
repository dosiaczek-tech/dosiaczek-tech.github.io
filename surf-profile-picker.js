/* Persistent day/hour panel. Selection scrolls into view without reordering dates. */
(function (root) {
  "use strict";
  const W = typeof module !== "undefined" ? require("./surf-weather.js") : root.SurfWeather;
  const dayFormat = new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", weekday: "short", day: "numeric", month: "short" });
  const hourFormat = new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  function groupOptions(options) {
    const byTime = new Map();
    for (const option of options) {
      const time = Number(option?.value);
      if (!option || option.disabled || option.value === "" || option.value == null || !Number.isFinite(time)) continue;
      byTime.set(time, { value: String(time), time, label: option.label, hour: hourFormat.format(new Date(time * 1000)) });
    }
    const groups = new Map();
    for (const option of [...byTime.values()].sort((a, b) => a.time - b.time)) {
      const day = W.dayKey(option.time);
      if (!groups.has(day)) groups.set(day, { day, label: dayFormat.format(new Date(option.time * 1000)), options: [] });
      groups.get(day).options.push(option);
    }
    return [...groups.values()];
  }
  function attach(select) {
    const label = document.querySelector(`label[for="${select.id}"]`);
    const wrapper = document.createElement("div"); wrapper.className = "surf-profile-picker";
    const button = document.createElement("button"); button.type = "button";
    button.id = `${select.id}Button`; button.className = "surf-profile-trigger";
    const value = document.createElement("span"); value.id = `${select.id}Value`; value.setAttribute("aria-live", "polite");
    const action = document.createElement("span"); action.className = "surf-profile-toggle-text";
    const chevron = document.createElement("span"); chevron.className = "surf-profile-chevron"; chevron.setAttribute("aria-hidden", "true");
    button.append(value, action, chevron);
    const panel = document.createElement("div"); panel.id = `${select.id}Options`; panel.className = "surf-profile-options";
    panel.setAttribute("role", "region");
    label.id ||= `${select.id}Label`; label.htmlFor = button.id;
    button.setAttribute("aria-labelledby", `${label.id} ${value.id}`);
    button.setAttribute("aria-controls", panel.id); panel.setAttribute("aria-labelledby", label.id);
    wrapper.append(button, panel); select.after(wrapper); select.hidden = true;
    let groups = [], expandedDay = null, selectedValue = "", signature = "";
    function setOpen(open, focus = false) {
      panel.hidden = !open; button.setAttribute("aria-expanded", String(open));
      action.textContent = open ? "Zwiń" : "Rozwiń";
      button.title = open ? "Zminimalizuj wybór pory" : "Rozwiń wybór pory";
      if (open) revealSelection();
      if (focus) button.focus({ preventScroll: true });
    }
    function revealSelection() {
      if (panel.hidden || !expandedDay || !panel.clientHeight) return;
      const section = Array.from(panel.children).find(item => item.dataset.day === expandedDay);
      if (!section) return;
      const target = section.querySelector('.surf-profile-hour[aria-pressed="true"]') || section.querySelector(".surf-profile-hour");
      if (!target) return;
      const headerHeight = section.querySelector(".surf-profile-day-button").getBoundingClientRect().height;
      const top = Math.max(0, panel.scrollTop + target.getBoundingClientRect().top - panel.getBoundingClientRect().top - headerHeight - 5);
      // Native scrolling stops at the final entry instead of adding blank space below it.
      panel.scrollTop = top;
    }
    function renderGroups() {
      const focused = panel.contains(document.activeElement) ? document.activeElement : null;
      const focusedValue = focused?.dataset.value, focusedDay = focused?.dataset.day, previousScroll = panel.scrollTop;
      const selectedDay = selectedValue ? W.dayKey(Number(selectedValue)) : null;
      panel.replaceChildren(...groups.map(group => {
        const section = document.createElement("section"); section.className = "surf-profile-day"; section.dataset.day = group.day;
        const open = group.day === expandedDay; section.classList.toggle("is-open", open);
        const dayButton = document.createElement("button"); dayButton.type = "button";
        dayButton.className = "surf-profile-day-button"; dayButton.dataset.day = group.day;
        dayButton.id = `${select.id}Day-${group.day}`;
        dayButton.setAttribute("aria-expanded", String(open)); dayButton.dataset.selected = String(group.day === selectedDay);
        const dayText = document.createElement("span"); dayText.textContent = group.label;
        const arrow = document.createElement("span"); arrow.className = "surf-profile-chevron"; arrow.setAttribute("aria-hidden", "true");
        dayButton.append(dayText, arrow);
        const hours = document.createElement("div"); hours.id = `${select.id}Hours-${group.day}`;
        hours.className = "surf-profile-hours"; hours.hidden = !open;
        hours.setAttribute("role", "group"); hours.setAttribute("aria-labelledby", dayButton.id);
        dayButton.setAttribute("aria-controls", hours.id);
        hours.append(...group.options.map(option => {
          const item = document.createElement("button"); item.type = "button";
          item.id = `${select.id}Hour-${option.value}`; item.className = "surf-profile-hour"; item.dataset.value = option.value;
          item.setAttribute("aria-pressed", String(option.value === selectedValue)); item.setAttribute("aria-label", option.label || `${group.label} · ${option.hour}`);
          const text = document.createElement("span"); text.textContent = option.hour; item.append(text);
          if (option.value === selectedValue) {
            const mark = document.createElement("span"); mark.className = "surf-profile-selected-mark";
            mark.textContent = "✓"; mark.setAttribute("aria-hidden", "true"); item.append(mark);
          }
          return item;
        }));
        section.append(dayButton, hours); return section;
      }));
      if (!groups.length) {
        const empty = document.createElement("p"); empty.className = "surf-small";
        empty.textContent = "Brak dostępnych godzin z pełnym przekrojem fal."; panel.append(empty);
      }
      panel.scrollTop = previousScroll;
      const restore = focusedValue ? panel.querySelector(`[data-value="${focusedValue}"]`) : focusedDay ? panel.querySelector(`button[data-day="${focusedDay}"]`) : null;
      if (!panel.hidden && restore && !restore.closest("[hidden]")) restore.focus({ preventScroll: true });
    }
    function sync() {
      const next = groupOptions(Array.from(select.options)), selected = select.selectedOptions[0];
      const nextValue = selected?.value || "", nextSignature = JSON.stringify([select.disabled, nextValue, next]);
      if (nextSignature === signature) return;
      signature = nextSignature;
      const changed = selectedValue !== nextValue;
      groups = next; selectedValue = nextValue;
      if (expandedDay && !groups.some(group => group.day === expandedDay)) expandedDay = null;
      if (changed && expandedDay && selectedValue) expandedDay = W.dayKey(Number(selectedValue));
      value.textContent = selected?.label || (groups.length ? "Wybierz dzień i godzinę" : "Brak dostępnych godzin");
      renderGroups();
      if (changed) revealSelection();
    }
    button.addEventListener("click", () => setOpen(panel.hidden));
    panel.addEventListener("click", event => {
      const hour = event.target.closest("button[data-value]");
      if (hour && panel.contains(hour)) {
        select.value = hour.dataset.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        sync(); revealSelection(); return;
      }
      const day = event.target.closest("button[data-day]");
      if (day && panel.contains(day)) {
        expandedDay = expandedDay === day.dataset.day ? null : day.dataset.day;
        renderGroups(); revealSelection();
      }
    });
    panel.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false, true); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const buttons = Array.from(panel.querySelectorAll("button")).filter(item => !item.closest("[hidden]"));
      const index = buttons.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
      buttons[next]?.focus({ preventScroll: true }); buttons[next]?.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
    select.addEventListener("change", () => queueMicrotask(sync));
    new MutationObserver(sync).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "label", "selected", "value"] });
    root.addEventListener("resize", revealSelection);
    sync(); setOpen(true);
  }
  const api = { groupOptions, attach };
  if (typeof module !== "undefined") module.exports = api; else root.SurfProfilePicker = api;
})(globalThis);
