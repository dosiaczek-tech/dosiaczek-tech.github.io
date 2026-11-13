const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../surf-reports.js');

const now = Date.UTC(2026, 10, 14, 15);
const hourAgo = now / 1000 - 3600;

test('a report is built only from what the shared table accepts', () => {
  const { report } = R.build({ spotId: 'kolobrzeg-latarnia-surf', start: hourAgo, rating: 4, waveHeight: 1, wind: 'słaby',
    profile: 'beginner', forecastScore: 7.43, comment: '  Czysta fala przy falochronie ' }, now);
  assert.deepEqual(report, { spot_id: 'kolobrzeg-latarnia-surf', session_start: new Date(hourAgo * 1000).toISOString(), rating: 4,
    wave_height: 1, wind: 'słaby', profile: 'beginner', forecast_score: 7.4, comment: 'Czysta fala przy falochronie' });
  const minimal = R.build({ spotId: 'stegna', start: hourAgo, rating: 2, waveHeight: NaN, wind: '', profile: 'x', comment: ' ' }, now).report;
  assert.deepEqual([minimal.wave_height, minimal.wind, minimal.profile, minimal.forecast_score, minimal.comment], [null, null, null, null, null]);
});

test('the reasons for a rejected report are in Polish', () => {
  const base = { spotId: 'stegna', start: hourAgo, rating: 3 };
  assert.equal(R.build({ ...base, rating: 0 }, now).error, 'Zaznacz, jak było (1–5).');
  assert.equal(R.build({ ...base, start: now / 1000 - 15 * 86400 }, now).error, 'Zgłoszenie może dotyczyć tylko ostatnich dwóch tygodni.');
  assert.equal(R.build({ ...base, start: now / 1000 + 7200 }, now).error, 'Sesja nie może być w przyszłości.');
  assert.equal(R.build({ ...base, start: NaN }, now).error, 'Podaj, kiedy była sesja.');
  assert.equal(R.build({ ...base, spotId: 'Zły spot' }, now).error, 'Nieznany spot.');
  assert.equal(R.build({ ...base, comment: 'x'.repeat(281) }, now).error, 'Komentarz może mieć najwyżej 280 znaków.');
});

test('sending posts the report with the public key and reports failures in Polish', async () => {
  const calls = [];
  await R.send({ spot_id: 'stegna' }, async (url, options) => { calls.push([url, options]); return { ok: true }; });
  assert.match(calls[0][0], /\/rest\/v1\/session_reports$/);
  assert.equal(calls[0][1].method, 'POST');
  assert.match(calls[0][1].headers.apikey, /^sb_publishable_/);
  assert.equal(calls[0][1].headers.Prefer, 'return=minimal');
  await assert.rejects(R.send({}, async () => ({ ok: false })), /Nie udało się zapisać zgłoszenia/);
  await assert.rejects(R.send({}, async () => { throw new TypeError('Failed to fetch'); }), /Brak połączenia/);
});

test('recent reports of a spot cover the last two weeks, newest first', async () => {
  let asked;
  const rows = await R.recent('kolobrzeg', now, async url => { asked = url; return { ok: true, json: async () => [
    { session_start: '2026-11-14T09:00:00+00:00', rating: 4 }, { session_start: 'nonsense', rating: 3 }, { rating: 5 }] }; });
  assert.match(asked, /spot_id=eq\.kolobrzeg/);
  assert.match(asked, new RegExp(`session_start=gte\\.${encodeURIComponent(new Date(now - 14 * 86400000).toISOString())}`));
  assert.match(asked, /order=session_start\.desc/);
  assert.equal(rows.length, 1, 'malformed rows are skipped');
});

test('the spot page has the report form and loads its script before the app', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const id of ['surfReports', 'surfReportOpen', 'surfReportForm', 'surfReportTime', 'surfReportWave', 'surfReportWind', 'surfReportComment', 'surfReportList'])
    assert.match(html, new RegExp(`id="${id}"`));
  assert.equal((html.match(/name="surfReportRating"/g) || []).length, 5);
  assert.ok(html.indexOf('src="surf-reports.js') < html.indexOf('src="surf-app.js'));
});
