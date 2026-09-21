# Nad morzem — kamery Bałtyku na żywo

**Strona:** https://dosiaczek-tech.github.io/

Statyczna strona z **85 różnymi kamerami polskiego wybrzeża**, od Świnoujścia
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

## Uruchomienie i publikacja

Otwórz `index.html` w przeglądarce. Nie potrzeba instalacji ani procesu budowania.
Odtwarzanie wymaga internetu; biblioteka hls.js 1.6.13 jest pobierana z jsDelivr
z weryfikacją integralności SRI.

GitHub Pages publikuje katalog główny gałęzi `master`. Plik `.nojekyll` oznacza,
że pliki mają być udostępniane bez przetwarzania przez Jekyll.

## Dodawanie kamer

Listy `CAMERAS` i `ADDITIONAL_CAMERAS` znajdują się w skrypcie w `index.html`.
Każda pozycja zawiera unikalny identyfikator, nazwę, opis widoku, region,
identyfikator strumienia i numer serwera. Link źródłowy domyślnie powstaje
z identyfikatora kamery; pole `source` pozwala go nadpisać.
Pola `description`, `tags` i `regionLabel` są uzupełniane automatycznie, jeśli
nie podano ich przy kamerze. Liczniki korzystają z rzeczywistej długości katalogu.
Publiczne strumienie HLS muszą udostępniać nagłówki CORS umożliwiające
odtwarzanie na tej stronie. Adresy transmisji mogą zmienić się po stronie dostawcy.

Bezpośredni link do wybranej kamery: `https://dosiaczek-tech.github.io/#brzezno`
lub `https://dosiaczek-tech.github.io/#stegna-plaza`.

Katalog jest migawką z 21.09.2026. [Zakres przeglądu i wyniki weryfikacji](KATALOG.md)
opisują sprawdzone źródła oraz kamery niedostępne podczas aktualizacji.

Obraz pochodzi z WebCamera.pl i od właścicieli kamer; linki do źródeł są
dostępne w odtwarzaczu. To repozytorium zawiera stronę odtwarzacza, a nie nagrania.
