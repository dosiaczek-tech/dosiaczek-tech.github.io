/* Always-visible day list, five days at a time; each day opens or closes its hours. Selection scrolls into view without reordering dates. */
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
  const PAGE_DAYS = 5, LIST_DAYS = 14;
  // The same paging as the day tiles under "Gdzie warto jechać": five days from today, then five more at a time, fourteen at most.
  function dayPage(groups, today, pages, selectedDay) {
    const first = Math.max(0, groups.findIndex(group => group.day === today));
    const end = Math.min(groups.length, first + LIST_DAYS);
    const count = Math.max(1, Math.ceil((end - first) / PAGE_DAYS));
    const selected = groups.findIndex(group => group.day === selectedDay);
    // An hour chosen elsewhere (e.g. in the hourly table) keeps its day visible, also when it is before today.
    const shown = Math.min(count, Math.max(1, pages, Math.floor((selected - first) / PAGE_DAYS) + 1));
    const until = Math.min(end, first + shown * PAGE_DAYS);
    return { first, count, pages: shown, remaining: end - until,
      visible: groups.filter((group, index) => (index >= first && index < until) || index === selected) };
  }
  // The "Pokaż mniej" and "Pokaż kolejne…" buttons under a paged day list, worded as under the comparison chart.
  function updatePaging(view, paging, less, more) {
    const next = Math.min(PAGE_DAYS, view.remaining);
    paging.hidden = view.count < 2; less.disabled = view.pages === 1; more.disabled = next <= 0;
    more.textContent = next <= 0 ? "Pokaż kolejne dni" : next === 1 ? "Pokaż kolejny dzień" : `Pokaż kolejne ${next} dni`;
  }
  function attach(select) {
    const label = document.querySelector(`label[for="${select.id}"]`);
    const wrapper = document.createElement("div"); wrapper.className = "surf-profile-picker";
    // The day list itself is the control: it is always shown and cannot be collapsed.
    const value = document.createElement("span"); value.id = `${select.id}Value`; value.className = "surf-profile-announce";
    value.setAttribute("aria-live", "polite");
    const panel = document.createElement("div"); panel.id = `${select.id}Options`; panel.className = "surf-profile-options";
    panel.setAttribute("role", "region");
    label.id ||= `${select.id}Label`; label.removeAttribute("for");
    panel.setAttribute("aria-labelledby", label.id); panel.setAttribute("aria-describedby", value.id);
    const less = document.createElement("button"); less.type = "button"; less.className = "filter"; less.textContent = "Pokaż mniej";
    const more = document.createElement("button"); more.type = "button"; more.className = "filter";
    const paging = document.createElement("div"); paging.className = "surf-profile-pages"; paging.append(less, more);
    wrapper.append(value, panel, paging); select.after(wrapper); select.hidden = true;
    let groups = [], expandedDay = null, selectedValue = "", signature = "", pages = 1;
    const today = () => W.dayKey(Date.now() / 1000);
    function revealSelection() {
      if (!expandedDay || !panel.clientHeight) return;
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
      const view = dayPage(groups, today(), pages, selectedDay);
      pages = view.pages;
      panel.replaceChildren(...view.visible.map(group => {
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
      if (restore && !restore.closest("[hidden]")) restore.focus({ preventScroll: true });
      updatePaging(view, paging, less, more);
    }
    function showPages(requested) {
      const view = dayPage(groups, today(), requested, null);
      pages = view.pages;
      // Removing days never leaves the selected hour on a day that is no longer shown.
      const selectedDay = selectedValue ? W.dayKey(Number(selectedValue)) : null;
      if (groups.findIndex(group => group.day === selectedDay) >= view.first + pages * PAGE_DAYS) {
        const current = Math.floor(Date.now() / 3600000) * 3600, options = groups[view.first].options;
        select.value = (options.find(option => option.time >= current) || options[0]).value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        sync();
      }
      renderGroups();
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
    less.addEventListener("click", () => showPages(pages - 1));
    more.addEventListener("click", () => showPages(pages + 1));
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
    sync(); revealSelection();
  }
  const api = { groupOptions, dayPage, updatePaging, attach };
  if (typeof module !== "undefined") module.exports = api; else root.SurfProfilePicker = api;
})(globalThis);
