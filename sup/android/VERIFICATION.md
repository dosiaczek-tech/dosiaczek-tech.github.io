# Weryfikacja wydania supy

## Przygotowane 1.0.6 — publiczny adres (2026-11-04)

- Wersja 1.0.6, versionCode 7; APK 37 936 bajtów. `nix run path:.`
  skompilował zasoby/Java/DEX, sprawdził wyrównanie, metadane i podpisy v2/v3.
- Niezmieniony certyfikat SHA-256:
  `8722186833e9facc49945aa7522bee26a6d263581f335e847ac5662c77324479`.
- SHA-256 APK:
  `08829600923ef5758c305a346834632dd9e4b24655d7e4fedb8e18c723734f83`.
- Nowy adres `https://dosiaczek-tech.github.io/sup/#moje-trasy`.
  Migracja kluczy `sup:` odbywa się lokalnie, bez starego serwera.
  Zachowuje oryginały i prywatną kopię. Konflikty/quota nie nadpisują zapisów.
  Przeszły trzy testy skryptów migracji: zakres, ponowienie, konflikt i rollback.
- Przeszło 55 dotychczasowych testów SUP oraz dwa nowe testy cache offline.
  Dwa testy Chromium potwierdziły odzyskanie katalogu po `online` i wznowieniu
  aplikacji bez przeładowania strony i usuwania pamięci dziennika.
- Strona została zbudowana; `?v=1.0.6`. Service worker dotyczy tylko `/sup/`,
  buforuje publiczny interfejs i katalog; nie przechwytuje kont/chmury ani surf.
- **Publikacja publiczna jeszcze nie została wykonana.** Nie zalecać instalacji
  jako gotowego wdrożenia przed udostępnieniem `/sup/`.
  Nie wykonywano instalacji/migracji na fizycznym telefonie z GrapheneOS.

## Aktualizacja 1.0.5 — dwa punkty prowadzą po rzece (2026-11-04)

- Wersja `1.0.5`, `versionCode=6`, rozmiar 33 698 bajtów.
- Użytkowniczka potwierdziła użycie „Rysuj trasę”: dawny główny przycisk włączał
  ręczne łączenie punktów prostymi. Nad mapą są teraz główne przyciski wyboru
  startu i mety po rzece; pierwszy punkt może rozpoznać rzekę automatycznie.
  Ręczne rysowanie jest w osobnej, zwijanej sekcji z jednoznacznym opisem.
- Dwie zapisane ręcznie lokalizacje można dopasować do rzeki w edycji, zachowując
  ID wpisu, nazwę, datę i notatki. Brak połączenia nie zastępuje pierwotnej linii.
- Podpowiedzi „Ostrzyce” i „Trątkownica” wskazują istniejące miejsca dostępu:
  pomost nad jeziorem oraz przystań za mostem. Test rzeczywistej sieci Raduni
  potwierdza 528 punktów i 14,337 km, wobec 9,787 km między końcami w linii prostej.
- Przeszło 10 testów `river-routing.test.js`, 7 testów `water-routing.test.js`,
  11 testów `river-planner.spec.js`, 20 testów `app.spec.js` i test synchronizacji
  własnej trasy po rzece na drugie urządzenie w `cloud.spec.js`.
  Po wykryciu dodatkowego błędu podwójnego dotknięcia ponowiono trzy testy
  wskazywania końców myszą/dotykiem. Mapa zachowuje widoczność obu końców.
  Testy dotykowe dotyczą mobilnej konfiguracji Chromium, nie fizycznego telefonu.
- Strona zbudowana przez `npm run build`, zasoby `?v=1.0.5`.
  `nix run path:.` zbudował i podpisał APK dotychczasowym kluczem; metadane,
  integralność ZIP, wyrównanie i podpisy v2/v3 są poprawne.
  Certyfikat SHA-256: `8722186833e9facc49945aa7522bee26a6d263581f335e847ac5662c77324479`.
- `dist/supy-1.0.5.apk` pobrano przez HTTP; `cmp` potwierdziło identyczność
  z plikiem lokalnym. Strona WWW i strona pobierania wskazują wydanie 1.0.5.
  Nie wykonywano instalacji ani testu na fizycznym urządzeniu z GrapheneOS.

SHA-256 APK:

```text
2888e34c42700c36063f85c13f7baa7a555da4916d9acb6ec429fe90b60422bb
```

## Aktualizacja 1.0.4 — wskazywanie startu i mety (2026-11-04)

- Wersja `1.0.4`, `versionCode=5`, rozmiar 33 698 bajtów.
- Odtworzono błąd w Chromium: wybranie rzeki automatycznie włączało wybór startu,
  a przycisk „Wskaż start na mapie” go wyłączał. Analogiczny problem dotyczył mety.
- Oba przyciski zawsze włączają wskazany tryb i pokazują mapę. Powtórne
  naciśnięcie nie wyłącza wybierania. Dotknięcie zbyt daleko od rzeki pokazuje
  komunikat widoczny również przy przewinięciu strony do mapy.
- Test regresji zawiódł przed poprawką. Po poprawce przeszło wszystkie siedem
  testów `river-planner.spec.js`, w tym kliknięcia myszą i dotknięcia ekranu
  w mobilnym Chromium, ponowne naciśnięcie przycisku, zmiana końca i zapis.
- Strona zbudowana przez `npm run build`; zasoby mają oznaczenie `?v=1.0.4`.
  `nix run path:.` poprawnie zbudował i podpisał APK istniejącym kluczem.
  Poprawne metadane, integralność ZIP, wyrównanie oraz podpisy v2/v3.
  Certyfikat SHA-256: `8722186833e9facc49945aa7522bee26a6d263581f335e847ac5662c77324479`.
- `dist/supy-1.0.4.apk` pobrano przez HTTP; `cmp` potwierdziło zgodność z plikiem
  lokalnym. Strona pobierania wskazuje nowe wydanie. Nie wykonywano testu
  instalacji ani obsługi na fizycznym telefonie z GrapheneOS.

SHA-256 APK:

```text
9d1f8b2eb4e36949f539282b812cb713be791deae806d88252649dd9cf7f02a8
```

## Aktualizacja 1.0.3 — pełny przycisk również na stronie mobilnej (2026-11-04)

- Wersja `1.0.3`, `versionCode=4`, rozmiar 33 698 bajtów.
- Strona WWW pokazuje zielony przycisk z pełnym napisem **Odśwież aplikację**.
  Na ekranach do 900 px przycisk ma osobny wiersz w przyklejonym górnym pasku.
  Usunięto ukrywanie napisu na telefonie; zasoby strony mają oznaczenie wersji
  `?v=1.0.3`, aby pobrać nowe style. Natywny zielony przycisk pozostaje zachowany.
- `npm run build` oraz `nix run path:.`: poprawne budowanie strony i APK.
  Weryfikacja pakietu, ZIP, wyrównania i podpisów v2/v3 zakończona powodzeniem.
  Certyfikat SHA-256 jest zgodny z poprzednimi wydaniami:
  `8722186833e9facc49945aa7522bee26a6d263581f335e847ac5662c77324479`.
- APK `dist/supy-1.0.3.apk` pobrany przez HTTP jest identyczny z lokalnym
  plikiem (`cmp`). `download.html` wskazuje wersjonowany plik nowego wydania.
- Przeszły trzy testy Chromium: pełny napis i zielone tło przy szerokościach
  320–1440 px, widoczność po przewinięciu i rzeczywiste przeładowanie strony,
  mobilny dziennik oraz wybieranie własnych końców rzeki na mapie.
- Nie wykonywano instalacji na fizycznym telefonie z GrapheneOS.

SHA-256 APK:

```text
2a23472b9a9b2baee780a6a77766a9c39b6edd742c14d8aeafc087889fbc2f1b
```

## Aktualizacja 1.0.2 — zielony przycisk odświeżania (2026-11-04)

- Wersja `1.0.2`, `versionCode=3`, rozmiar 33 698 bajtów.
- Natywny górny pasek zawiera przycisk **Odśwież aplikację**: białe litery
  i strzałka na zielonym tle `#185B4D`, zaokrąglenie 8 dp, wysokość dotyku 48 dp.
  Pasek ma wysokość 56 dp i uwzględnia istniejącą obsługę wcięć systemowych.
- `npm run build` w `sup/`: zbudowano bieżącą stronę, w tym wyznaczanie własnej
  trasy między startem i metą po dostępnej sieci 36 rzek i kanałów.
- `nix run path:.`: kompilacja, weryfikacja metadanych, integralności ZIP,
  wyrównania i podpisanie zakończone powodzeniem. Użyto istniejącego klucza.
- Podpisy v2 i v3 są poprawne. Certyfikat SHA-256 jest identyczny z 1.0.1:
  `8722186833e9facc49945aa7522bee26a6d263581f335e847ac5662c77324479`.
- `aapt2 dump xmltree` oraz `dump resources` potwierdzają w gotowym APK
  przycisk, jego tekst, biały kolor liter i zielone tło.
- Wersjonowany plik: `dist/supy-1.0.2.apk`; najnowszy alias: `dist/supy.apk`.
  `download.html` wskazuje nowe wydanie. Pobranie wersjonowanego APK przez
  `http://zuffie.test:8766/sup/android/dist/supy-1.0.2.apk` zakończyło się
  powodzeniem; `cmp` potwierdziło identyczność z lokalnym plikiem.

SHA-256 APK:

```text
6314e70ad887a5ac1f9f18197461007c2065c9375ab322a1d526c7e7141662b2
```

`adb devices -l` zwróciło pustą listę. Nie wykonano instalacji ani testu
interfejsu na telefonie z GrapheneOS lub emulatorze. Nowy APK należy zainstalować
jako aktualizację istniejącego supy, bez odinstalowania poprzedniej wersji.
APK nadal pobiera stronę z `zuffie.test`; telefon musi mieć dostęp do tego serwera.

## Aktualizacja 1.0.1 — nowe logo (2026-10-30)

- Wersja `1.0.1`, `versionCode=2`, rozmiar 29 529 bajtów.
- Znak kobiety na SUP-ie z białym konturem i złotym piórem wiosła,
  wygenerowany z `sup/assets/logo.svg`; tło ikony `#0C5E4E`.
- `nix run path:.`: kompilacja, sprawdzenie i podpisanie APK zakończone powodzeniem.
  Użyto istniejącego klucza — certyfikat SHA-256 jest identyczny jak w 1.0.0.
- Schematy podpisu v2 i v3 poprawne. Inspekcja skompilowanego `ic_sup.xml`
  przez `aapt2 dump xmltree` potwierdziła pięć nowych ścieżek grafiki.
- APK dostępny pod `http://zuffie.test:8766/sup/android/dist/supy.apk`;
  SHA-256 pobranego pliku jest zgodny z plikiem lokalnym:

```text
d04b6058d9a4013d72341073a575681bbb0aaa9eca60ea37f431302f0ddf33c2
```

Sprawdzono wizualnie SVG, PNG, małą ikonę i nagłówek strony w Chromium.
Nie instalowano aktualizacji na telefonie podczas tej zmiany.

## Archiwum weryfikacji 1.0.0

Data: **2026-10-29**. Budowanie i podpisywanie na koncie **dosiaczek**.

## APK

```text
/home/dosiaczek/opencode/dosiaczek-tech.github.io/sup/android/dist/supy.apk
```

| Właściwość | Sprawdzony wynik |
| --- | --- |
| Nazwa | `supy` |
| Pakiet | `io.github.dosiaczek.supy` |
| Activity startowa | `io.github.dosiaczek.supy.MainActivity` |
| Wersja / versionCode | `1.0.0` / `1` |
| Minimum / target API | `26` / `36` |
| Rozmiar | 29 529 bajtów |
| Podpis APK | poprawne schematy v2 i v3, jeden podpisujący |
| Klucz | RSA, 3072 bity |

SHA-256 APK:

```text
83ab30e8d35cf497c9512553cf2e67a64a8eb9f0977ecbdee77a14a37bf16182
```

SHA-256 publicznego certyfikatu podpisującego:

```text
8722186833e9facc49945aa7522bee26a6d263581f335e847ac5662c77324479
```

## Przeprowadzone kontrole

- `nix build --print-build-logs`: kompilacja i sprawdzenie niepodpisanego APK.
- `nix run`: podpisanie poza Nix store i sandboxem.
- Kolejny `nix run`: ponowne użycie tego samego klucza; identyczny SHA-256 APK.
- `nix run .#verify -- dist/supy.apk`: pakiet, nazwa, Activity MAIN/LAUNCHER,
  API, integralność ZIP, wyrównanie oraz podpisy poprawne.
- `nix flake check --no-build`: poprawna ewaluacja konfiguracji.
- Skrypty podpisywania i weryfikacji przeszły sprawdzenia `writeShellApplication`.
- Inspekcja skompilowanego manifestu i network-security-config przez aapt2:
  `INTERNET`, eksportowana Activity startowa, `adjustResize`, nowy mechanizm
  Wstecz, `debuggable=false`, HTTP dozwolone tylko dla `zuffie.test`, systemowe CA.
- Właścicielem klucza i hasła jest `dosiaczek`; katalog ma `0700`, pliki `0600`.
  Oba pliki znajdują się w `~/.local/share/supy-android/`, poza projektem i Nix store.
- Test `tests/blob-download.mjs` w desktopowym Chromium: odczyt rzeczywistego
  eksportu JSON ze strony jest identyczny z pobranym plikiem. Przeszły również
  przypadki dużego tekstu, polskich znaków/emoji oraz wygasłego Blob URL.
- `git diff --check -- sup/android`: brak błędów białych znaków.

## Strona i pobieranie

- `http://zuffie.test:8766/sup/#moje-trasy`: **HTTP 200**, bez przekierowań;
  DNS na komputerze: `192.168.1.245`.
- HTML, `assets/app.js` i `assets/app.css`: **HTTP 200**, `Cache-Control: no-store`.
- Tymczasowy serwer APK: **http://192.168.1.245:8767/supy.apk**,
  HTTP 200, 29 529 bajtów. SHA-256 pobranego przez HTTP pliku jest zgodny z APK.
- Serwer udostępnia wyłącznie `dist/` i jest uruchomiony z limitem **1 godziny**.
  PID przy dostarczeniu: `349434`. Log:
  `~/.local/share/supy-android/download-server.log`.

Weryfikacja sieci została wykonana na komputerze budującym. Telefon potrzebuje
własnego dostępu do sieci i DNS `zuffie.test`; sam plik APK tego nie zapewnia.

### Aktualizacja sposobu pobierania

Po zgłoszeniu problemu z linkiem na porcie 8767 dodano stronę
**http://zuffie.test:8766/sup/android/download.html** z przyciskiem HTML
`download="supy.apk"`, działającą na tym samym serwerze i porcie co strona SUP.
Strona i jej plik `dist/supy.apk` zwróciły HTTP 200; SHA-256 APK pobranego z portu
8766 jest zgodny z powyższym wydaniem. Ten adres nie zależy od godzinnego procesu
na porcie 8767. Poprzedni serwer podczas sprawdzania również zwracał HTTP 200;
przyczyna problemu po stronie telefonu nie została jeszcze potwierdzona.

## Testy na Androidzie

**Nie wykonano testów na telefonie ani emulatorze.** `adb devices -l` zwróciło
pustą listę. Test desktopowy nie sprawdza WebView ani systemowych okien Androida.
Do sprawdzenia na telefonie pozostają instalacja/ikona na pulpicie, ładowanie
i odświeżanie strony, Wstecz, klawiatura/wycięcie ekranu/obrót, zachowanie tras
i logowania, import JSON/GPX, eksport JSON i ekran błędu połączenia.

Instalacja: otwórz pobrany APK na telefonie albo uruchom
`adb install -r dist/supy.apk` z tego katalogu.

Przed kolejnymi wydaniami zachowaj kopię `release.p12` i `release.password`,
zwiększ `versionCode` w `flake.nix` i podpisz tym samym kluczem. Zmiany strony
opublikowane pod tym samym adresem wymagają jedynie odświeżenia aplikacji.
