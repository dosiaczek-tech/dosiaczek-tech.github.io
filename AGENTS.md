# Równoległa praca nad dwiema aplikacjami

W tym repozytorium pracują niezależne sesje OpenCode. Zmiany bez commita mogą
należeć do drugiej sesji — nie porządkuj ich ani nie nadpisuj przy okazji zadania.

## Granice pracy

- **Nad morzem / Bałtyk Surf (`/`)**: `index.html`, `surf-*.js`, `surf.css`,
  `model/`, główne `tests/` oraz dokumentacja tej aplikacji. To obszar sesji Bałtyk.
- **SUP (`/sup/`)**: kod, zasoby, testy, dokumentacja, zależności i konfiguracja
  nowej aplikacji znajdują się wyłącznie w `sup/`. To obszar sesji SUP.
- Przy zadaniu dotyczącym SUP przeczytaj także `sup/AGENTS.md` i edytuj tylko
  `sup/`. Przy zadaniu dotyczącym Bałtyku nie zmieniaj aplikacji w `sup/`.
- Nie przenoś wspólnego kodu między aplikacjami ani nie wykonuj refaktoryzacji
  drugiej aplikacji bez uzgodnionego rozszerzenia zakresu z użytkownikiem.

## Wspólna infrastruktura

`scripts/`, `.github/`, główny `README.md`, `.gitignore`, `shell.nix`, `.nojekyll`,
ten plik i `model/build_site.py` są utrzymywane przez sesję Bałtyk/infrastruktura.
Jeżeli SUP wymaga zmiany tych plików, opisz użytkownikowi potrzebną integrację;
nie edytuj ich równolegle z drugą sesją. Dokumentację SUP umieszczaj w `sup/`.

Wspólny podgląd działa pod `http://zuffie.test:8766/`, a SUP pod
`http://zuffie.test:8766/sup/`. Serwer obsługuje pliki statyczne i `index.html`
w katalogach. Zmiany plików aplikacji widać po odświeżeniu strony.
Sesja SUP korzysta z istniejącego serwera; jego uruchamianiem i restartami
zajmuje się sesja Bałtyk/infrastruktura. Nie zatrzymuj procesów drugiej sesji.
Gdy potrzebny jest dodatkowy proces SUP, przeznaczony jest dla niego port 8767;
ewentualne podłączenie go do wspólnego adresu uzgodnij z użytkownikiem.

## Wspólny katalog roboczy Git

- Sprawdzaj `git status --short` przed pracą i rozpoznawaj granice własnego zadania.
- Nie przełączaj gałęzi w tym współdzielonym katalogu podczas równoległej pracy.
- Nie używaj `reset`, `clean`, `stash` ani `restore`/`checkout` do usuwania,
  ukrywania lub cofania zmian drugiej sesji. Unikaj operacji na całym repozytorium.
- Commit i publikacja wymagają wyraźnego polecenia użytkownika. Jeśli commit
  zostanie zlecony, dodawaj tylko konkretne pliki własnego zakresu, nie `git add .`
  ani `git add -A`. Nie uwzględniaj cudzych zmian znajdujących się w indeksie.

## Rozdzielenie aplikacji w przeglądarce

SUP używa zasobów i adresów pod `/sup/`, własnych nazw pamięci przeglądarki
z prefiksem `sup:` oraz ewentualnego service workera ograniczonego do `/sup/`.
Klucze `nad-morzem:*`, trasy `/data/` i zasoby `surf-*` należą do aplikacji Bałtyk.
