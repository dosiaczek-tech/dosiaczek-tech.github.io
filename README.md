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
- **Bałtyk Surf 0.2**: porównanie DWD EWAM / ECMWF WAM, konsensus wiatru
  ICON / GFS / ECMWF, profil dna EMODnet i eksperymentalna transformacja fal 1D.
- Mapy Windy, godziny polskie, oznaczanie brakujących i nieaktualnych danych.
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
satelitów. Pełny opis obliczeń, ograniczeń, źródeł i plan rozwoju: [SURFING.md](SURFING.md).

## Uruchomienie i publikacja

Otwórz `index.html` w przeglądarce. Nie potrzeba instalacji ani procesu budowania.
Odtwarzanie wymaga internetu; biblioteka hls.js 1.6.13 jest pobierana z jsDelivr
z weryfikacją integralności SRI.
Prognozy pobierają publiczne dane Open-Meteo i EMODnet bez kluczy API;
publiczny endpoint Open-Meteo służy do użytku niekomercyjnego. Nie wymagają backendu.
Skrypty i arkusz `surf-*` oraz `surf.css` muszą być publikowane obok `index.html`.

Testy obliczeń i pobierania danych: `node --test tests/*.test.cjs`.

GitHub Pages publikuje katalog główny gałęzi `master`. Plik `.nojekyll` oznacza,
że pliki mają być udostępniane bez przetwarzania przez Jekyll.

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
