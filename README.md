# Nad morzem — kamery Bałtyku na żywo

**Strona:** https://dosiaczek-tech.github.io/

Statyczna strona z 12 kamerami: Kołobrzeg (dwa widoki), Gdańsk-Brzeźno,
Sopot, Hel, Kuźnica, Władysławowo, Łeba, Ustka, Sarbinowo, Międzyzdroje
oraz Gdańsk nad Motławą.

## Funkcje

- Jeden odtwarzacz na żywo z przełączaniem kamer.
- Wyszukiwanie miejsc i filtrowanie regionów.
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

Lista `CAMERAS` znajduje się w skrypcie w `index.html`. Każda pozycja zawiera
nazwę, opis widoku, region, identyfikator strumienia i link do strony źródłowej.
Publiczne strumienie HLS muszą udostępniać nagłówki CORS umożliwiające
odtwarzanie na tej stronie. Adresy transmisji mogą zmienić się po stronie dostawcy.

Bezpośredni link do wybranej kamery: `https://dosiaczek-tech.github.io/#brzezno`
lub `https://dosiaczek-tech.github.io/#sopot`.

Obraz pochodzi z WebCamera.pl i od właścicieli kamer; linki do źródeł są
dostępne w odtwarzaczu. To repozytorium zawiera stronę odtwarzacza, a nie nagrania.
