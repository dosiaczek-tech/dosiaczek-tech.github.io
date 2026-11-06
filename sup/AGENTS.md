# Sesja SUP

Ta sesja rozwija osobną aplikację dostępną pod `/sup/`.

- Edytuj wyłącznie pliki w tym katalogu i jego podkatalogach.
- Wszystkie pliki aplikacji, testy, `README.md`, `package.json`, lockfile,
  konfigurację narzędzi i zależności trzymaj w `sup/`.
- Zmiany widoczne w Git poza `sup/` należą do drugiej sesji. Nie cofaj ich,
  nie formatuj i nie dodawaj do swojego commita.
- Główne `AGENTS.md` opisuje właściciela infrastruktury oraz zasady wspólnego Git.

## Dostarczanie zmian na telefon

- Użytkowniczka korzysta z aplikacji **supy na GrapheneOS**. Oczekuje również
  nowego APK po zmianach, nie tylko edycji strony w repozytorium.
- Przy dostarczaniu zmian zbuduj stronę, przygotuj nowe wydanie według
  `android/README.md`, zwiększ wersję i `versionCode`, podpisz dotychczasowym
  kluczem i podaj link do wersjonowanego pliku APK dostępnego na telefonie.
- Nie zastępuj istniejącego klucza podpisującego. Aktualizacja ma działać
  bez odinstalowania aplikacji i bez usuwania jej danych.
- Przycisk w natywnym górnym pasku ma mieć napis **„Odśwież aplikację”**,
  białe litery i zielone tło.
- Ten sam pełny napis i zielone tło muszą być widoczne również u góry strony
  WWW, także na telefonie. Nie zastępuj napisu samą ikoną na małych ekranach.

## Uruchomienie

- Podgląd: **http://zuffie.test:8766/sup/**.
- `index.html` jest plikiem startowym; obecną stronę powitalną można zastąpić
  właściwą aplikacją.
- Używaj ścieżek względnych do własnych zasobów albo ścieżek zaczynających się
  od `/sup/`. Przy użyciu routera lub bundlera ustaw bazę `/sup/`.
- Wspólny serwer statyczny jest już uruchomiony. Edycja HTML/CSS/JS wymaga
  odświeżenia przeglądarki, a nie restartu serwera.
- Node.js 22 jest dostępny przez `nix-shell ../shell.nix`. Własne dodatkowe
  zależności i konfigurację środowiska dodawaj w `sup/`.
- Jeżeli aplikacja potrzebuje backendu lub innego sposobu serwowania,
  opisz potrzebną integrację. Wspólny serwer i publikację obsługuje druga sesja.

## Izolacja danych

Własne pliki danych umieszczaj pod `/sup/`. Dla localStorage, IndexedDB i cache
stosuj prefiks `sup:`. Ewentualny service worker ma obejmować tylko `/sup/`.
Nie zmieniaj danych ani ustawień aplikacji Bałtyk.
