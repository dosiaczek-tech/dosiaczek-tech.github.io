import { escapeHtml as esc, km, icon } from './ui.js';
import { comparePositions, sectionBetween, ACCESS_LABELS } from './access.js';

export const siteLabel = site => `${site.name}${site.coordinateAccuracy === 'approximate' ? ' · lokalizacja przybliżona' : ''}`;
export function accessDescription(site) {
  const accuracy = site.coordinateAccuracy === 'approximate' ? '<p class="access-accuracy"><strong>≈ Lokalizacja przybliżona</strong><br>Opis wskazuje rejon dostępu. Pinezka nie jest pomiarem GPS konkretnego zejścia; szczegóły położenia podano poniżej.</p>' : site.coordinateAccuracy === 'facility' ? '<p>Pinezka wskazuje obiekt lub miejsce opisane przez operatora. Dokładne zejście sprawdź na miejscu.</p>' : '';
  return `<strong>${esc(site.name)}</strong><p class="access-status">${esc(ACCESS_LABELS[site.status] ?? site.status)}</p>${accuracy}<p>${esc(site.conditions)}</p><p>${esc(site.landAccess)}</p>${site.address ? `<p>${esc(site.address)}</p>` : ''}${site.season ? `<p>Okres działania wg źródła: ${esc(site.season)}</p>` : ''}${site.fee ? `<p>${esc(site.fee)}</p>` : ''}<div class="access-sources">${site.sources.map(source => `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.name)} ${icon('external')}</a><small>Odczyt: ${esc(source.accessedAt)}${source.trackDate ? ` · data śladu: ${esc(source.trackDate)}` : ''}</small>`).join('')}</div>`;
}

export function createAccessPicker(container, feature, record, sites, onChange, onLocate) {
  const occurrences = record?.occurrences ?? [], allowed = occurrences.filter(item => sites.get(item.siteId)?.selectable);
  const occurrenceLabel = item => `${km(item.position.km)} km${feature.geometry.type === 'MultiLineString' ? ` · część ${item.position.line + 1}` : ''} · ${siteLabel(sites.get(item.siteId))}`;
  const hasPair = allowed.some(from => allowed.some(to => to.position.km - from.position.km > .05));
  const legSite = (leg, role) => { const item = occurrences.find(item => item.id === leg[role]); return item ? siteLabel(sites.get(item.siteId)) : leg[`${role}Break`] === 'missing-data' ? 'granica luki w danych — nie wskazuje miejsca dostępu' : 'miejsce dostępu nieustalone'; };
  const endpoint = (id, fallback) => sites.has(id) ? siteLabel(sites.get(id)) : fallback;
  container.innerHTML = `<h4>${icon('pin')} Wodowania i krótszy odcinek</h4>
    <p>${new Set(occurrences.map(item => item.siteId)).size} miejsc dostępu przy tej trasie. Kilometry podano w kierunku przebiegu, bez przerw.</p>
    <dl class="access-endpoints"><dt>Start trasy</dt><dd>${esc(endpoint(feature.properties.launchStart, 'Miejsce wodowania nieustalone'))}</dd><dt>Meta trasy</dt><dd>${esc(endpoint(feature.properties.launchFinish, 'Miejsce wyjścia nieustalone'))}</dd></dl>
    ${!record?.anchored ? '<p class="access-incomplete">Nie wszystkie końce tej trasy mają jeszcze przypisane miejsce wodowania. Orientacyjne końce oznaczamy osobno.</p>' : ''}
    ${(record?.legs.length ?? 0) > 1 ? `<details class="access-legs"><summary>Dostęp do oddzielnych części wodnych (${record.legs.length})</summary><ol>${record.legs.map(leg => `<li><strong>Część ${leg.index + 1}</strong><p>Początek: ${esc(legSite(leg, 'start'))}<br>Koniec: ${esc(legSite(leg, 'finish'))}</p></li>`).join('')}</ol></details>` : ''}
    ${hasPair ? `<div class="section-selects"><label>Start wodowania<select id="section-start"><option value="">Wybierz miejsce startu</option>${allowed.map(item => `<option value="${esc(item.id)}">${esc(occurrenceLabel(item))}</option>`).join('')}</select></label><label>Meta / wyjście z wody<select id="section-finish"><option value="">Wybierz miejsce zakończenia</option>${allowed.map(item => `<option value="${esc(item.id)}">${esc(occurrenceLabel(item))}</option>`).join('')}</select></label></div><div class="section-actions"><button id="preview-section" class="button button-small" type="button" disabled>Pokaż odcinek</button><button id="reset-section" class="text-button" type="button">Cała trasa</button></div><p id="section-result" role="status" aria-live="polite">Wybierz start i metę w kolejności płynięcia.</p><div id="section-sites"></div>` : '<p>Brakuje dwóch zlokalizowanych miejsc dostępu, aby wyznaczyć tutaj krótszy wariant.</p>'}
    ${occurrences.length ? `<details class="access-list"><summary>Wszystkie miejsca przy trasie (${occurrences.length})</summary>${occurrences.map(item => `<article><button class="text-button access-locate" type="button" data-id="${esc(item.id)}">${icon('pin')} ${esc(occurrenceLabel(item))}</button><details><summary>Opis dostępu i źródła</summary>${accessDescription(sites.get(item.siteId))}</details></article>`).join('')}</details>` : ''}`;
  container.querySelectorAll('.access-locate').forEach(button => button.addEventListener('click', () => onLocate(button.dataset.id)));
  if (!hasPair) return { choose() {} };
  const start = container.querySelector('#section-start'), finish = container.querySelector('#section-finish');
  const preview = container.querySelector('#preview-section'), result = container.querySelector('#section-result');
  function update() {
    const from = allowed.find(item => item.id === start.value), to = allowed.find(item => item.id === finish.value);
    for (const option of finish.options) {
      const item = allowed.find(item => item.id === option.value);
      option.disabled = Boolean(item && from && (comparePositions(from.position, item.position) >= 0 || item.position.km - from.position.km < .05));
    }
    const valid = from && to && comparePositions(from.position, to.position) < 0 && to.position.km - from.position.km >= .05;
    preview.disabled = !valid;
    result.textContent = valid ? 'Gotowe — pokaż wybrany odcinek na mapie.' : from && to ? 'Meta musi być dalej niż start. Wybierz inne miejsce zakończenia.' : 'Wybierz start i metę w kolejności płynięcia.';
    container.querySelector('#section-sites').innerHTML = [from && ['Start', from], to && ['Meta', to]].filter(Boolean).map(([label, item]) => `<details><summary>${label}: ${esc(sites.get(item.siteId).name)}</summary>${accessDescription(sites.get(item.siteId))}</details>`).join('');
    // Never leave an earlier preview/save target active while controls show a
    // different, incomplete or reversed pair.
    onChange(null, false);
  }
  function apply() {
    if (preview.disabled) return;
    try {
      const section = sectionBetween(feature, allowed.find(item => item.id === start.value), allowed.find(item => item.id === finish.value), sites);
      onChange(section, true);
      result.textContent = `Wybrany odcinek: ${km(section.lengthKm)} km po wodzie.${section.properties.breaks.length ? ` Przerwy / przewózki: ${section.properties.breaks.length}.` : ''} Długość jest pomiarem linii, nie kilometrażem całej oferty.`;
    } catch (error) { result.textContent = error.message; onChange(null, false); }
  }
  start.addEventListener('change', update); finish.addEventListener('change', update); preview.addEventListener('click', apply);
  container.querySelector('#reset-section').addEventListener('click', () => { start.value = ''; finish.value = ''; update(); onChange(null, true); });
  if (record.start && record.finish) { start.value = record.start; finish.value = record.finish; }
  update();
  return { choose(id, role) { (role === 'start' ? start : finish).value = id; update(); if (!preview.disabled) apply(); else (role === 'start' ? finish : start).focus({ preventScroll: true }); } };
}
