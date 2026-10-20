# Nad morzem — kamery Bałtyku na żywo

**Strona:** https://dosiaczek-tech.github.io/

Statyczna strona ze **128 źródłami kamer polskiego wybrzeża**, od Świnoujścia
po Krynicę Morską. Katalog obejmuje plaże, mola, porty, promenady oraz centra
nadmorskich miejscowości.

Wyróżniono Kołobrzeg, Brzeźno, Sopot oraz Mierzeję Wiślaną: dwa ujęcia ze Stegny,
Jantar, Kąty Rybackie i dwa widoki z Krynicy Morskiej.

## Funkcje

- Jeden odtwarzacz na żywo z przełączaniem kamer.
- Wyszukiwanie miejsc i filtrowanie pięciu regionów, w tym Mierzei Wiślanej.
- Ulubione zapisywane lokalnie w przeglądarce.
- Pełny ekran i pobieranie playlisty `.m3u` do VLC.
- Układ dostosowany do komputera i telefonu.
- Ponawianie połączenia po utracie internetu.
- Osobna zakładka **Prognozy surfingowe**: 71 spotów / odcinków w 43 miejscowościach,
  70 powiązanych kamer morskich, pięć dni prognozy, ranking okien dziennych.
- **Bałtyk Surf 1.2 / SWAN**: rzeczywista, niestacjonarna symulacja widma fal
  przy brzegu, z regionalną falą na granicy, wiatrem BS Wind 3 i rastrem EMODnet.
  Wykres przekroju, fala w okolicy głębokości 2 m, okres, moc i strefa załamania.
- Główny wykres pokazuje **pełny przekrój 0, 50, 100, …, 500 m** i jest od razu
  widoczny. Wybór godziny zmienia przekrój oraz podsumowanie. Punkt podsumowania
  jest zaznaczeniem na całej krzywej, nie początkiem wykresu.
- Podsumowanie, tabela, wykres czasowy i ranking dotyczą
  **tego samego punktu w strefie do 500 m od oszacowanego brzegu**. Podajemy
  odległość, głębokość oraz link do punktu prognozy na mapie. Brak wyniku
  przybrzeżnego nie jest zastępowany prognozą z dalszego morza.
- Automatyczny backend GitHub Actions: wiatr co 3 h, nowe obliczenia SWAN
  w cyklach 00/12 UTC. W tabeli wiatr pod komórkami fal i pięć klas kierunku:
  onshore, cross-on, cross, cross-off, offshore.
- Mapy Windy, godziny polskie, oznaczanie brakujących i nieaktualnych danych.
- Szacowana **moc fal przy spocie (kW/m)** i **energia fal (kJ/m²)** w podsumowaniu,
  tabeli oraz porównaniu modeli, z objaśnieniem jednostek i sposobu obliczania.
- Interaktywna mapa wyboru wszystkich spotów: kliknięcie znacznika otwiera
  prognozę, pobliskie punkty są grupowane, a mapa synchronizuje się z listą
  i filtrem regionu. Kolory odróżniają spoty z kamerą od pozostałych.
- Historia onshore → offshore / cisza z potwierdzeniem utrzymania fal:
  opis fazy i filtr „Tylko wywiewka po nawianiu”.
- Sobieszewo oraz 30 opisów spotów z mapy WestCoast (3 scalone z istniejącymi,
  27 nowych punktów). Pochodzenie, lokalne kierunki, charakter i poziom wg autora;
  bez przypisywania ocen kitesurfingowych do surfingu.

Prognozy: https://dosiaczek-tech.github.io/#surf/wladyslawowo
Przykładowe nowe spoty: `#surf/sobieszewo`, `#surf/kolobrzeg-palikpoint`,
`#surf/darlowko-zachod`.

To model eksperymentalny, bez walidacji na lokalnych pomiarach i bez asymilacji
satelitów. Konfiguracja solvera i odtwarzanie obliczeń: [MODEL.md](MODEL.md).
Opis oceny surfingu, ograniczeń i źródeł: [SURFING.md](SURFING.md).

## Uruchomienie i publikacja

Frontend można uruchomić lokalnie przez `python3 -m http.server 8000`.
Odtwarzanie wymaga internetu; biblioteka hls.js 1.6.13 jest pobierana z jsDelivr
z weryfikacją integralności SRI.
Prognozy pobierają publiczne dane Open-Meteo i EMODnet bez kluczy API;
publiczny endpoint Open-Meteo służy do użytku niekomercyjnego. Wyniki SWAN
generuje backend opisany w `MODEL.md`; bez plików `data/` frontend wyraźnie
oznacza brak prognozy przy brzegu; nie podstawia danych z dalszego morza.
Skrypty i arkusz `surf-*` oraz `surf.css` muszą być publikowane obok `index.html`.

Testy obliczeń i pobierania danych: `node --test tests/*.test.cjs`.

GitHub Pages publikuje artefakt `dist/` przez workflow `forecast-pages.yml`.
Zmiana kodu, harmonogram lub ręczne uruchomienie workflow odświeżają publikację.
Pliki obliczeniowe nie są dopisywane do historii Git; wejścia i logi SWAN
są archiwizowane jako artefakty GitHub Actions.

## Dodawanie kamer

Listy `CAMERAS`, `ADDITIONAL_CAMERAS` i `NADMORSKI_CAMERAS` znajdują się w skrypcie w `index.html`.
Każda pozycja zawiera unikalny identyfikator, nazwę, opis widoku, region,
identyfikator strumienia i numer serwera. Link źródłowy domyślnie powstaje
z identyfikatora kamery; pole `source` pozwala go nadpisać.
Kamery innych dostawców podają bezpośrednio `stream`, `poster`, `source`
i `provider`. `NADMORSKI_CAMERAS` buduje te pola z danych katalogu Nadmorski24.
Wyszukiwarka rozpoznaje również nazwę dostawcy, np. „Nadmorski24”.
Pola `description`, `tags` i `regionLabel` są uzupełniane automatycznie, jeśli
nie podano ich przy kamerze. Liczniki korzystają z rzeczywistej długości katalogu.
Publiczne strumienie HLS muszą udostępniać nagłówki CORS umożliwiające
odtwarzanie na tej stronie. Adresy transmisji mogą zmienić się po stronie dostawcy.

Bezpośredni link do wybranej kamery: `https://dosiaczek-tech.github.io/#brzezno`
lub `https://dosiaczek-tech.github.io/#stegna-plaza`.

Katalog uzupełniono 20.10.2026 o 40 źródeł Nadmorski24 i trzy przywrócone
transmisje WebCamera. Kamera Puck — Zatoka Pucka ma adres
`https://dosiaczek-tech.github.io/#puck-zatoka-pucka`.
[Zakres przeglądu i wyniki weryfikacji](KATALOG.md)
opisują sprawdzone źródła oraz kamery niedostępne podczas aktualizacji.

Obraz pochodzi z WebCamera.pl, Nadmorski24.pl i od właścicieli kamer; linki do źródeł są
dostępne w odtwarzaczu. To repozytorium zawiera stronę odtwarzacza, a nie nagrania.
