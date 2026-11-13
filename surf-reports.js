/* „Jak było?”: zgłoszenia sesji surferów we wspólnej bazie (Supabase), do sprawdzania i kalibracji prognozy.
 * Tabela pozwala każdemu tylko dodawać zgłoszenia z ostatnich 14 dni i je czytać; klucz jest publiczny z założenia.
 */
(function (root) {
  "use strict";
  const ENDPOINT = "https://xazcysthzwhykygcvtrl.supabase.co/rest/v1/session_reports";
  const KEY = "sb_publishable_5UYL11uc7OUjhh7fc2I5Dw_XFJmu1Pt";
  const DAYS = 14;
  const WIND = ["brak", "słaby", "umiarkowany", "silny"];
  const PROFILES = ["beginner", "intermediate", "advanced", "longboard"];
  const finite = Number.isFinite;

  // A report as the table accepts it, or the Polish reason why not.
  function build({ spotId, start, rating, waveHeight = null, wind = null, profile = null, forecastScore = null, comment = "" }, now = Date.now()) {
    if (!/^[a-z0-9-]{2,40}$/.test(spotId || "")) return { error: "Nieznany spot." };
    if (!finite(start)) return { error: "Podaj, kiedy była sesja." };
    if (start * 1000 < now - DAYS * 86400000) return { error: "Zgłoszenie może dotyczyć tylko ostatnich dwóch tygodni." };
    if (start * 1000 > now + 3600000) return { error: "Sesja nie może być w przyszłości." };
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Zaznacz, jak było (1–5)." };
    const text = String(comment || "").trim();
    if (text.length > 280) return { error: "Komentarz może mieć najwyżej 280 znaków." };
    return { report: { spot_id: spotId, session_start: new Date(start * 1000).toISOString(), rating,
      wave_height: finite(waveHeight) && waveHeight >= 0 && waveHeight <= 5 ? Math.round(waveHeight * 10) / 10 : null,
      wind: WIND.includes(wind) ? wind : null, profile: PROFILES.includes(profile) ? profile : null,
      forecast_score: finite(forecastScore) && forecastScore >= 0 && forecastScore <= 10 ? Math.round(forecastScore * 10) / 10 : null,
      comment: text || null } };
  }

  async function send(report, fetcher = root.fetch) {
    let response;
    try {
      response = await fetcher(ENDPOINT, { method: "POST", body: JSON.stringify(report),
        headers: { apikey: KEY, "Content-Type": "application/json", Prefer: "return=minimal" } });
    } catch { throw new Error("Brak połączenia — sprawdź internet i spróbuj ponownie."); }
    if (!response.ok) throw new Error("Nie udało się zapisać zgłoszenia. Spróbuj ponownie za chwilę.");
  }

  async function recent(spotId, now = Date.now(), fetcher = root.fetch) {
    const since = new Date(now - DAYS * 86400000).toISOString();
    const query = `select=session_start,rating,wave_height,wind,profile,forecast_score,comment&spot_id=eq.${encodeURIComponent(spotId)}` +
      `&session_start=gte.${encodeURIComponent(since)}&order=session_start.desc&limit=20`;
    let response;
    try { response = await fetcher(`${ENDPOINT}?${query}`, { headers: { apikey: KEY } }); }
    catch { throw new Error("Brak połączenia — zgłoszeń nie udało się wczytać."); }
    if (!response.ok) throw new Error("Nie udało się wczytać zgłoszeń.");
    const rows = await response.json();
    return Array.isArray(rows) ? rows.filter(row => Number.isInteger(row?.rating) && Date.parse(row.session_start)) : [];
  }

  const api = { build, send, recent, WIND, DAYS };
  if (typeof module !== "undefined") module.exports = api; else root.SurfReports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
