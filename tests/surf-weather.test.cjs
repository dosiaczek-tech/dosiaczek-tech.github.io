const { test } = require('node:test');
const assert = require('node:assert/strict');
const W = require('../surf-weather.js');
const time = date => Date.parse(date) / 1000;
const first = time('2026-10-25T11:00:00Z'), second = time('2026-10-26T11:00:00Z');
function conditions() {
  return {
    weather: { data: {
      utc_offset_seconds: 7200,
      hourly_units: { temperature_2m: '°C', cloud_cover: '%' },
      hourly: { time: [first, second], temperature_2m: [0, -2.5], cloud_cover: [0, 100] },
      daily_units: { sunrise: 'unixtime', sunset: 'unixtime' },
      // Fixed summer offset in a forecast fetched BEFORE the clocks change.
      daily: { time: [time('2026-10-24T22:00:00Z'), time('2026-10-25T22:00:00Z')],
        sunrise: [time('2026-10-25T05:47:00Z'), time('2026-10-26T05:49:00Z')],
        sunset: [time('2026-10-25T15:21:00Z'), time('2026-10-26T15:19:00Z')] }
    } },
    sea: { data: { hourly_units: { sea_surface_temperature: '°C' },
      hourly: { time: [first - 3600, second], sea_surface_temperature: [13, 12.8] } } }
  };
}

test('temperatures align by UTC timestamp, preserve zero and negative temperatures, and never fill a sea data gap', () => {
  const data = conditions();
  const a = W.atTime(data, first + 1800), b = W.atTime(data, second);
  assert.equal(a.airTemperature, 0);
  assert.equal(a.cloudCover, 0);
  assert.equal(a.cloudLabel, 'Bezchmurnie');
  assert.equal(a.waterTemperature, null);
  assert.equal(b.airTemperature, -2.5);
  assert.equal(b.waterTemperature, 12.8);
  assert.equal(b.cloudLabel, 'Całkowite zachmurzenie');
  assert.equal(W.atTime(data, second + 3600).airTemperature, null);
});

test('sunrise and sunset stay on the selected Warsaw day after DST changes inside an API response', () => {
  const data = conditions();
  assert.equal(W.dayKey(data.weather.data.daily.time[1]), '2026-10-25', 'direct Warsaw formatting is the wrong date for this API boundary');
  const selected = W.atTime(data, second);
  assert.equal(selected.day, '2026-10-26');
  assert.equal(selected.sunrise, time('2026-10-26T05:49:00Z'));
  assert.equal(selected.sunset, time('2026-10-26T15:19:00Z'));
  const clock = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' });
  assert.equal(clock.format(new Date(selected.sunrise * 1000)), '06:49');
  assert.equal(clock.format(new Date(selected.sunset * 1000)), '16:19');
});

test('sun events are daily and remain available without an hourly temperature, but never come from a different date', () => {
  const data = conditions();
  const midnight = W.atTime(data, time('2026-10-25T23:00:00Z'));
  assert.equal(midnight.day, '2026-10-26');
  assert.equal(midnight.airTemperature, null);
  assert.equal(midnight.sunrise, time('2026-10-26T05:49:00Z'));
  const beyond = W.atTime(data, time('2026-10-27T11:00:00Z'));
  assert.equal(beyond.sunrise, null);
  assert.equal(beyond.sunset, null);
  data.weather.data.daily.sunrise[1] = time('2026-10-25T05:47:00Z');
  data.weather.data.daily.sunset[1] = null;
  assert.equal(W.atTime(data, second).sunrise, null);
  assert.equal(W.atTime(data, second).sunset, null);
});

test('missing, invalid and wrongly labelled units are not displayed as valid weather', () => {
  const data = conditions();
  data.weather.data.hourly.temperature_2m[0] = null;
  data.weather.data.hourly.cloud_cover[0] = 101;
  data.sea.data.hourly.sea_surface_temperature[1] = 100;
  assert.equal(W.atTime(data, first).airTemperature, null);
  assert.equal(W.atTime(data, first).cloudCover, null);
  assert.equal(W.atTime(data, second).waterTemperature, null);
  data.sea.data.hourly.sea_surface_temperature[1] = 0;
  assert.equal(W.atTime(data, second).waterTemperature, 0);
  data.sea.data.hourly_units.sea_surface_temperature = '°F';
  assert.equal(W.atTime(data, second).waterTemperature, null);
  for (const value of [null, undefined, NaN, Infinity, -1, 101, '0']) assert.equal(W.cloudLabel(value), 'Brak danych o zachmurzeniu');
  const absent = W.atTime(null, first);
  for (const key of ['airTemperature', 'waterTemperature', 'cloudCover', 'sunrise', 'sunset']) assert.equal(absent[key], null);
});

test('partial source outages preserve the available conditions', () => {
  const data = conditions();
  const seaOnly = W.atTime({ sea: data.sea }, second);
  assert.equal(seaOnly.waterTemperature, 12.8);
  assert.equal(seaOnly.airTemperature, null);
  assert.equal(seaOnly.sunrise, null);
  const weatherOnly = W.atTime({ weather: data.weather }, second);
  assert.equal(weatherOnly.waterTemperature, null);
  assert.equal(weatherOnly.airTemperature, -2.5);
  assert.equal(weatherOnly.sunrise, time('2026-10-26T05:49:00Z'));
});

test('repeated Warsaw hours in autumn remain separate observations', () => {
  const early = time('2026-10-25T00:00:00Z'), late = time('2026-10-25T01:00:00Z');
  const data = conditions();
  data.weather.data.hourly = { time: [early, late], temperature_2m: [5, 6], cloud_cover: [25, 75] };
  assert.ok(W.hours(data, late * 1000).includes(early));
  assert.ok(W.hours(data, late * 1000).includes(late));
  assert.equal(W.atTime(data, early).airTemperature, 5);
  assert.equal(W.atTime(data, late).airTemperature, 6);
  assert.equal(W.atTime(data, early).cloudLabel, 'Małe zachmurzenie');
  assert.equal(W.atTime(data, late).cloudLabel, 'Częściowe zachmurzenie');
});

test('day/hour selection keeps explicit sessions, chooses the requested day and limits historical options to twenty-four hours', () => {
  const data = conditions();
  const now = first * 1000 + 1800000;
  data.weather.data.hourly.time.push(first - 25 * 3600, first - 24 * 3600, first, null);
  const times = W.hours(data, now);
  assert.equal(times.includes(first - 25 * 3600), false);
  assert.equal(times.includes(first - 24 * 3600), true);
  assert.equal(times.filter(t => t === first).length, 1);
  assert.equal(W.selectTime(times, null, null, now), first);
  assert.equal(W.selectTime(times, first, '2026-10-26', now), second);
  assert.equal(W.selectTime(times, second + 3600, '2026-10-26', now), second + 3600, 'explicit missing hour must not become another forecast hour');
  assert.equal(W.dayKey(W.selectTime(times, null, '2026-10-29', now)), '2026-10-29');
});

test('weather columns cover exactly one hour and use Polish clock times', () => {
  const start = time('2026-10-22T12:00:00Z');
  assert.deepEqual(W.interval(start), { end: start + 3600, label: '14:00–15:00', zone: 'CEST' });
});

test('the final weather interval ends at 24:00 under its starting date', () => {
  for (const start of [time('2026-10-22T21:00:00Z'), time('2026-10-26T22:00:00Z')]) {
    const period = W.interval(start);
    assert.equal(period.label, '23:00–24:00');
    assert.equal(period.end, start + 3600);
    assert.notEqual(W.dayKey(start), W.dayKey(period.end));
  }
});

test('autumn clock change distinguishes the two 02:00 weather intervals', () => {
  const early = time('2026-10-25T00:00:00Z'), late = early + 3600;
  assert.deepEqual(W.interval(early), { end: late, label: '02:00–02:00', zone: 'CEST → CET' });
  assert.deepEqual(W.interval(late), { end: late + 3600, label: '02:00–03:00', zone: 'CET' });
});

test('spring clock change does not invent an extra forecast hour', () => {
  const start = time('2026-03-29T00:00:00Z');
  assert.deepEqual(W.interval(start), { end: start + 3600, label: '01:00–03:00', zone: 'CET → CEST' });
});

test('three-hour local forecast blocks retain their real end across the autumn clock change', () => {
  const start = time('2026-10-24T22:00:00Z'), end = time('2026-10-25T02:00:00Z');
  assert.equal(end - start, 4 * 3600);
  assert.deepEqual(W.interval(start, end), { end, label: '00:00–03:00', zone: 'CEST → CET' });
});

test('partial forecast blocks use the supplied boundary instead of inventing a full interval', () => {
  const start = time('2026-10-22T17:00:00Z'), end = time('2026-10-22T19:00:00Z');
  assert.deepEqual(W.interval(start, end), { end, label: '19:00–21:00', zone: 'CEST' });
  const midnight = time('2026-10-22T22:00:00Z');
  assert.equal(W.interval(end, midnight).label, '21:00–24:00');
});

test('day and night follow sunrise and sunset at the start of the hour, independently of clouds', () => {
  const data = conditions();
  assert.equal(W.atTime(data, time('2026-10-26T05:00:00Z')).daylight, false);
  assert.equal(W.atTime(data, time('2026-10-26T06:00:00Z')).daylight, true);
  assert.equal(W.atTime(data, second).cloudCover, 100);
  assert.equal(W.atTime(data, second).daylight, true);
  assert.equal(W.atTime(data, time('2026-10-26T15:00:00Z')).daylight, true);
  assert.equal(W.atTime(data, time('2026-10-26T16:00:00Z')).daylight, false);
});

test('missing or inconsistent sun events leave the light state unknown instead of inventing night', () => {
  assert.equal(W.atTime(null, second).daylight, null);
  const data = conditions();
  data.weather.data.daily.sunrise[1] = null;
  assert.equal(W.atTime(data, second).daylight, null);
  data.weather.data.daily.sunrise[1] = time('2026-10-26T17:00:00Z');
  assert.equal(W.atTime(data, second).daylight, null);
});

test('day cards get sun events for their own date, including the day after a DST transition', () => {
  const data = conditions();
  assert.deepEqual(W.sunTimes(data,'2026-10-25'),{sunrise:time('2026-10-25T05:47:00Z'),sunset:time('2026-10-25T15:21:00Z')});
  assert.deepEqual(W.sunTimes(data,'2026-10-26'),{sunrise:time('2026-10-26T05:49:00Z'),sunset:time('2026-10-26T15:19:00Z')});
  assert.deepEqual(W.sunTimes(data,'2026-10-27'),{sunrise:null,sunset:null});
  assert.deepEqual(W.sunTimes(null,'2026-10-26'),{sunrise:null,sunset:null});
});

test('weather codes align with the exact hour and reject invalid values or units', () => {
  const data=conditions();
  data.weather.data.hourly_units.weather_code='wmo code';
  data.weather.data.hourly.weather_code=[0,61];
  assert.equal(W.atTime(data,first).weatherCode,0);
  assert.equal(W.atTime(data,second).weatherCode,61);
  assert.equal(W.atTime(data,second+3600).weatherCode,null);
  for(const invalid of [null,-1,100,2.5,'61']) {
    data.weather.data.hourly.weather_code[1]=invalid;
    assert.equal(W.atTime(data,second).weatherCode,null);
  }
  data.weather.data.hourly.weather_code[1]=61;
  data.weather.data.hourly_units.weather_code='unknown';
  assert.equal(W.atTime(data,second).weatherCode,null);
});

test('clouds alone never become rain and night icons do not show sunshine', () => {
  assert.equal(W.weatherSymbol({cloudCover:0,weatherCode:0},true).icon,'☀️');
  assert.equal(W.weatherSymbol({cloudCover:20,weatherCode:1},true).icon,'🌤️');
  assert.equal(W.weatherSymbol({cloudCover:60,weatherCode:2},true).icon,'⛅');
  assert.equal(W.weatherSymbol({cloudCover:100},true).icon,'☁️');
  assert.equal(W.weatherSymbol({cloudCover:0,weatherCode:0},false).icon,'🌙');
  assert.equal(W.weatherSymbol({cloudCover:60,weatherCode:2},false).icon,'☁️');
  assert.equal(W.weatherSymbol({},true),null);
  assert.equal(W.weatherSymbol({weatherCode:17},true),null);
});

test('WMO precipitation overrides cloud-cover symbols and separates showers and heavy rain', () => {
  assert.equal(W.weatherSymbol({weatherCode:61,cloudCover:0},true).icon,'🌧️');
  assert.equal(W.weatherSymbol({weatherCode:80,cloudCover:40},true).icon,'🌦️');
  assert.equal(W.weatherSymbol({weatherCode:80,cloudCover:40},false).icon,'🌧️');
  assert.equal(W.weatherSymbol({weatherCode:80,cloudCover:100},true).icon,'🌧️');
  assert.equal(W.weatherSymbol({weatherCode:65},true).icon,'☔');
  assert.match(W.weatherSymbol({weatherCode:82},true).label,/Silne/);
  assert.equal(W.weatherSymbol({weatherCode:95},true).icon,'⛈️');
  assert.equal(W.weatherSymbol({weatherCode:73},true).icon,'🌨️');
  assert.equal(W.weatherSymbol({weatherCode:45},true).icon,'🌫️');
  assert.match(W.weatherSymbol({weatherCode:66},true).label,/Marznący/);
});
