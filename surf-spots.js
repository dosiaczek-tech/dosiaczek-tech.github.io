/* Punkty reprezentatywne plaż, WGS84. Normalna wskazuje od lądu ku morzu.
 * Współrzędne i orientacje są przybliżeniem do prognozy regionalnej, nie pozycją kamery.
 * Tylko jawna lista kamer morskich — nigdy automatyczne dopasowanie po miejscowości.
 */
(function (root) {
  "use strict";
  const rows = [
    ["swinoujscie", "Świnoujście", "Plaża", 53.925, 14.251, 355, "zachod", ["swinoujscie", "swinoujscie-plaza"]],
    ["miedzyzdroje", "Międzyzdroje", "Plaża przy molo", 53.933, 14.444, 325, "zachod", ["miedzyzdroje", "miedzyzdroje-plaza", "miedzyzdroje-plaza-zachod"]],
    ["miedzywodzie", "Międzywodzie", "Plaża", 54.012, 14.694, 340, "zachod", ["miedzywodzie"]],
    ["dziwnow", "Dziwnów", "Plaża morska", 54.027, 14.746, 335, "zachod", ["dziwnow-plaza"]],
    ["trzesacz", "Trzęsacz", "Plaża", 54.079, 14.994, 350, "zachod", ["trzesacz"]],
    ["rewal", "Rewal", "Plaża", 54.084, 15.017, 350, "zachod", ["rewal-plaza"]],
    ["niechorze", "Niechorze", "Plaża przy molo", 54.100, 15.079, 350, "zachod", ["niechorze-molo-kamera", "niechorze-plaza"]],
    ["mrzezyno", "Mrzeżyno", "Plaża", 54.148, 15.299, 345, "zachod", ["mrzezyno-plaza"]],
    ["rogowo", "Rogowo", "Plaża", 54.158, 15.352, 345, "zachod", ["rogowo"]],
    ["dzwirzyno", "Dźwirzyno", "Plaża", 54.163, 15.411, 350, "zachod", ["dzwirzyno", "dzwirzyno-plaza"]],
    ["grzybowo", "Grzybowo", "Plaża", 54.165, 15.492, 355, "zachod", ["grzybowo"]],
    ["kolobrzeg", "Kołobrzeg", "Molo i plaże centralne", 54.188, 15.554, 335, "zachod", ["kolobrzeg", "kolobrzeg-plaza", "zachodnia-plaza-kolobrzeg"]],
    ["ustronie", "Ustronie Morskie", "Plaża", 54.218, 15.755, 335, "zachod", ["ustronie-morskie"]],
    ["sarbinowo", "Sarbinowo", "Plaża", 54.249, 15.956, 350, "zachod", ["sarbinowo", "kamera-na-plazy-w-sarbinowie"]],
    ["chlopy", "Chłopy", "Plaża przy przystani", 54.255, 15.990, 350, "zachod", ["chlopy"]],
    ["mielno", "Mielno", "Plaża przy promenadzie", 54.263, 16.055, 330, "zachod", ["mielno", "sofra-mielno-kamera"]],
    ["lazy", "Łazy", "Plaża", 54.304, 16.191, 330, "zachod", ["widok-na-plaze-w-lazach"]],
    ["dabki", "Dąbki", "Plaża morska", 54.381, 16.312, 320, "srodek", ["dabki"]],
    ["bobolin", "Bobolin", "Plaża", 54.395, 16.337, 320, "srodek", ["bobolin"]],
    ["darlowko", "Darłowo", "Darłówko — plaża wschodnia", 54.443, 16.384, 320, "srodek", ["darlowo", "darlowo-plaza-darlowko"]],
    ["jaroslawiec", "Jarosławiec", "Plaża morska", 54.538, 16.541, 290, "srodek", ["jaroslawiec-plaza", "jaroslawiec-dubaj"]],
    ["ustka", "Ustka", "Plaża wschodnia", 54.591, 16.861, 345, "srodek", ["ustka", "ustka-rafa"]],
    ["rowy", "Rowy", "Plaża", 54.667, 17.049, 320, "srodek", ["rowy-plaza"]],
    ["leba", "Łeba", "Plaża wschodnia", 54.770, 17.565, 0, "srodek", ["leba", "leba-neptun"]],
    ["lubiatowo", "Lubiatowo", "Plaża", 54.811, 17.864, 350, "srodek", ["lubiatowo-kamera"]],
    ["bialogora", "Białogóra", "Plaża", 54.838, 17.956, 355, "polwysep", ["bialogora-plaza"]],
    ["debki", "Dębki", "Plaża", 54.833, 18.079, 0, "polwysep", ["debki", "debki-plaza-n24", "debki-plaza-obrotowa", "debki-wieza"]],
    ["karwia", "Karwia", "Plaża", 54.832, 18.210, 0, "polwysep", ["karwia-plaza", "karwia-plaza-n24"]],
    ["ostrowo", "Ostrowo", "Plaża", 54.834, 18.255, 0, "polwysep", ["ostrowo-plaza"]],
    ["jastrzebia", "Jastrzębia Góra", "Plaża", 54.836, 18.310, 0, "polwysep", ["jastrzebia-gora", "jastrzebia-gora-n24"]],
    ["chlapowo", "Chłapowo", "Plaża pod klifem", 54.807, 18.383, 30, "polwysep", ["chlapowo-lazurowe"]],
    ["wladyslawowo", "Władysławowo", "Plaża od strony Bałtyku", 54.800, 18.407, 30, "polwysep", ["wladyslawowo", "wladyslawowo-druga-plaza", "wladyslawowo-plaza-n24", "wladyslawowo-baltyk"]],
    ["jastarnia", "Jastarnia", "Plaża morska — Dom Zdrojowy", 54.707, 18.685, 35, "polwysep", ["jastarnia-dom-zdrojowy"]],
    ["jurata", "Jurata", "Plaża od strony Bałtyku", 54.683, 18.722, 35, "polwysep", ["jurata-plaza"]],
    ["gdynia", "Gdynia", "Plaża miejska · Zatoka Gdańska", 54.514, 18.552, 85, "trojmiasto", ["gdynia-plaza"]],
    ["orlowo", "Gdynia", "Orłowo · Zatoka Gdańska", 54.480, 18.565, 75, "trojmiasto", ["gdynia-orlowo"]],
    ["sopot", "Sopot", "Plaża i molo · Zatoka Gdańska", 54.447, 18.574, 65, "trojmiasto", ["sopot", "sopot-molo-n24", "sopot-male-molo", "sopot-meridian"]],
    ["brzezno", "Gdańsk", "Brzeźno · Zatoka Gdańska", 54.411, 18.624, 35, "trojmiasto", ["brzezno"]],
    ["stogi", "Gdańsk", "Stogi · Zatoka Gdańska", 54.375, 18.733, 15, "trojmiasto", ["gdansk-plaza-stogi"]],
    ["sobieszewo", "Gdańsk", "Sobieszewo — plaża morska", 54.350, 18.831, 0, "trojmiasto", []],
    ["jantar", "Jantar", "Plaża morska", 54.346, 19.028, 340, "mierzeja", ["jantar"]],
    ["stegna", "Stegna", "Plaża morska", 54.346, 19.112, 350, "mierzeja", ["stegna-plaza", "kamera-stegna-plaza"]],
    ["katy", "Kąty Rybackie", "Plaża morska", 54.354, 19.234, 350, "mierzeja", ["katyrybackie"]],
    ["krynica", "Krynica Morska", "Plaża morska", 54.389, 19.444, 330, "mierzeja", ["krynica-morska-plaza", "krynica-morska-kamera", "krynicamorska"]]
  ];
  const spots = rows.map(([id, town, name, lat, lon, normal, region, cameras]) => ({
    id, town, name, lat, lon, normal, region, cameras,
    geometry: "Orientacyjny punkt plaży i kierunek brzegu; wymaga lokalnej kalibracji."
  }));
  const community = typeof module !== "undefined" ? require("./surf-community.js") : root.SurfCommunity;
  for (const record of community) {
    const existing = record.mergeInto && spots.find(s => s.id === record.mergeInto);
    if (existing) {
      // Zachowujemy ID, linki i kamery. Położenie precyzujemy punktem autora mapy.
      Object.assign(existing, { lat: record.lat, lon: record.lon, community: record.community,
        geometry: "Punkt z mapy WestCoast; normalna brzegu przybliżona, bez obliczonej osłony falochronów." });
    } else spots.push({ ...record, geometry: "Punkt z mapy WestCoast; normalna brzegu przybliżona, bez obliczonej osłony falochronów." });
  }
  spots.find(s => s.id === "sobieszewo").nearbySpot = "stogi";
  if (typeof module !== "undefined") module.exports = spots;
  else root.SurfSpots = spots;
})(typeof globalThis !== "undefined" ? globalThis : this);
