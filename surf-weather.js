/* Spot conditions: exact UTC-hour alignment and Warsaw calendar days, including DST. */
(function (root) {
  "use strict";
  const finite = Number.isFinite;
  const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" });
  const hourFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", hourCycle: "h23" });
  const clockFormat = new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" });
  const dayKey = time => dateFormat.format(new Date(time * 1000));
  function interval(time, end = time + 3600) {
    const clock = t => Object.fromEntries(clockFormat.formatToParts(new Date(t * 1000)).map(part => [part.type, part.value]));
    const startClock = clock(time), endClock = clock(end);
    return { end, label: `${startClock.hour}:${startClock.minute}–${dayKey(time) === dayKey(end) ? `${endClock.hour}:${endClock.minute}` : "24:00"}`,
      zone: startClock.timeZoneName === endClock.timeZoneName ? startClock.timeZoneName : `${startClock.timeZoneName} → ${endClock.timeZoneName}` };
  }
  function hours(conditions, now = Date.now()) {
    const from = Math.floor(now / 3600000) * 3600 - 24 * 3600;
    return [...new Set([conditions?.weather, conditions?.sea].flatMap(source => source?.data?.hourly?.time || []))]
      .filter(time => finite(time) && time >= from).sort((a, b) => a - b);
  }
  function selectTime(times, requestedTime, requestedDay, now = Date.now()) {
    if (finite(requestedTime) && (!requestedDay || dayKey(requestedTime) === requestedDay)) return requestedTime;
    const currentHour = Math.floor(now / 3600000) * 3600;
    if (!requestedDay || requestedDay === dayKey(currentHour)) return currentHour;
    const candidates = times.filter(time => finite(time) && dayKey(time) === requestedDay);
    // Noon is an explicit preview hour, not a daily average. Keep the requested date even without data.
    return candidates.find(time => Number(hourFormat.format(new Date(time * 1000))) >= 12)
      ?? candidates[candidates.length - 1] ?? Date.parse(`${requestedDay}T12:00:00Z`) / 1000;
  }
  function hourlyValue(data, variable, time, unit, minimum, maximum) {
    const index = data?.hourly?.time?.indexOf(time) ?? -1;
    const value = index >= 0 ? data.hourly[variable]?.[index] : null;
    return data?.hourly_units?.[variable] === unit && finite(value) && value >= minimum && value <= maximum ? value : null;
  }
  function cloudLabel(cover) {
    if (!finite(cover) || cover < 0 || cover > 100) return "Brak danych o zachmurzeniu";
    return cover === 0 ? "Bezchmurnie" : cover <= 25 ? "Małe zachmurzenie" : cover <= 75 ? "Częściowe zachmurzenie"
      : cover < 100 ? "Duże zachmurzenie" : "Całkowite zachmurzenie";
  }
  function weatherSymbol(weather, daylight = null) {
    const code = weather?.weatherCode, cover = weather?.cloudCover;
    // WMO weather codes distinguish precipitation from cloud cover; 100% cloud is not rain.
    if ([95, 96, 99].includes(code)) return { icon: "⛈️", label: code === 95 ? "Burza" : "Burza z gradem" };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: "🌨️", label: code >= 85 ? "Przelotny śnieg" : "Śnieg" };
    if ([56, 57, 66, 67].includes(code)) return { icon: "🌧️", label: code < 60 ? "Marznąca mżawka" : "Marznący deszcz" };
    if ([51, 53, 55].includes(code)) return { icon: "🌧️", label: "Mżawka" };
    if ([61, 63, 65].includes(code)) return { icon: code === 65 ? "☔" : "🌧️", label: code === 65 ? "Silny deszcz" : "Deszcz" };
    if ([80, 81, 82].includes(code)) return {
      icon: code === 82 ? "☔" : daylight === true && finite(cover) && cover <= 75 ? "🌦️" : "🌧️",
      label: code === 82 ? "Silne przelotne opady" : "Przelotny deszcz"
    };
    if ([45, 48].includes(code)) return { icon: "🌫️", label: code === 48 ? "Mgła osadzająca szadź" : "Mgła" };
    const hasCover = finite(cover) && cover >= 0 && cover <= 100;
    const type = hasCover ? cover === 0 ? 0 : cover <= 25 ? 1 : cover <= 75 ? 2 : 3
      : Number.isInteger(code) && code >= 0 && code <= 3 ? code : null;
    if (type === null) return null;
    return { icon: type === 0 ? daylight === false ? "🌙" : "☀️" : type === 3 || daylight === false ? "☁️" : type === 1 ? "🌤️" : "⛅",
      label: hasCover ? cloudLabel(cover) : ["Bezchmurnie", "Przeważnie pogodnie", "Częściowe zachmurzenie", "Pochmurno"][type] };
  }
  function sunTimes(conditions, day) {
    const weather = conditions?.weather?.data;
    const daily = weather?.daily, offset = weather?.utc_offset_seconds;
    // Open-Meteo's daily boundaries use a FIXED offset for the whole response.
    // Recover the provider's date before matching it to the selected Warsaw day;
    // formatting daily.time directly in Warsaw would shift dates after a DST change.
    const dailyIndex = finite(offset) ? daily?.time?.findIndex(t => finite(t)
      && new Date((t + offset) * 1000).toISOString().slice(0, 10) === day) ?? -1 : -1;
    const solar = variable => {
      const value = dailyIndex >= 0 ? daily[variable]?.[dailyIndex] : null;
      return weather?.daily_units?.[variable] === "unixtime" && finite(value) && value > 0 && dayKey(value) === day ? value : null;
    };
    return { sunrise: solar("sunrise"), sunset: solar("sunset") };
  }
  function atTime(conditions, time) {
    const hour = Math.floor(time / 3600) * 3600, day = dayKey(hour);
    const weather = conditions?.weather?.data, sea = conditions?.sea?.data;
    const cloudCover = hourlyValue(weather, "cloud_cover", hour, "%", 0, 100);
    const code = hourlyValue(weather, "weather_code", hour, "wmo code", 0, 99);
    const { sunrise, sunset } = sunTimes(conditions, day);
    const daylight = finite(sunrise) && finite(sunset) && sunrise < sunset ? hour >= sunrise && hour < sunset : null;
    return { time: hour, day,
      waterTemperature: hourlyValue(sea, "sea_surface_temperature", hour, "°C", -3, 45),
      airTemperature: hourlyValue(weather, "temperature_2m", hour, "°C", -90, 65),
      cloudCover, cloudLabel: cloudLabel(cloudCover), weatherCode: Number.isInteger(code) ? code : null,
      sunrise, sunset, daylight };
  }
  // Wetsuit by the water temperature, thicker extras when the air is cold: the usual advice for the Baltic.
  function wetsuit(water, air = null) {
    if (!finite(water)) return null;
    const cold = finite(air) && air < 8, cool = finite(air) && air < 12;
    if (water < 6) return "6/5 mm, buty, rękawice, kaptur";
    if (water < 10) return "5/4 mm, buty, rękawice, kaptur";
    if (water < 13) return cold ? "5/4 mm, buty, rękawice" : "5/4 mm, buty";
    if (water < 16) return cool ? "4/3 mm, buty" : "4/3 mm";
    if (water < 19) return "3/2 mm";
    if (water < 22) return "2 mm lub shorty";
    return "lycra";
  }
  const api = { dayKey, hours, selectTime, atTime, cloudLabel, weatherSymbol, interval, sunTimes, wetsuit };
  if (typeof module !== "undefined") module.exports = api; else root.SurfWeather = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
