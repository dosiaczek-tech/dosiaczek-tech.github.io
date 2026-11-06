# supy — aplikacja Android

## Przygotowane 1.0.6 — publiczny adres (oczekuje na publikację)

APK `releases/supy-1.0.6.apk`, versionCode 7, otwiera
`https://dosiaczek-tech.github.io/sup/#moje-trasy`. Najpierw trzeba opublikować
stronę `/sup/`; poprzedni APK 1.0.5 nadal korzysta z domowego podglądu.
Nie instalować przygotowanej wersji jako działającej usługi przed wdrożeniem.

Pierwsze uruchomienie kopiuje wyłącznie klucze `sup:` z dawnego originu
`http://zuffie.test:8766` do publicznego HTTPS. Odbywa się lokalnie w WebView,
bez połączenia ze starym serwerem. Oryginały pozostają; dodatkowy snapshot jest
w prywatnym katalogu aplikacji. Konflikt lub błąd zapisu zatrzymuje migrację
i wycofuje tylko świeżo dodane klucze. Nie czyścimy dziennika ani sesji konta.
Aktualizacja używa dotychczasowego podpisu — nie odinstalowywać aplikacji.

Wznowienie aplikacji ponawia nieudane wczytanie strony/katalogu. Po pierwszym
pełnym wczytaniu przez HTTPS service worker `/sup/sw.js` przechowuje publiczny
katalog i interfejs do użycia bez sieci. Nie przechwytuje chmury, kont, map
zewnętrznych ani aplikacji surf. Świeże kafelki map i synchronizacja wymagają
internetu. Obecna aplikacja SUP jest atlasem/dziennikiem, bez modułu pogody.

Poniżej zachowano instrukcje poprzedniego wydania korzystającego z serwera
domowego; publiczna publikacja wymaga osobnego zatwierdzenia.

Natywna aplikacja Java/WebView z ikoną kobiety na SUP-ie, otwierająca od razu:

**http://zuffie.test:8766/sup/#moje-trasy**

Nazwa na telefonie: **supy**. Pakiet: `io.github.dosiaczek.supy`.
Wymagany Android 8.0 / API 26 lub nowszy; target API 36.

## Instalacja i ikona na pulpicie

Strona z przyciskiem pobierania na istniejącym serwerze SUP:
**http://zuffie.test:8766/sup/android/download.html**.
Aktualne wydanie: **1.0.5**, `versionCode=6`, plik **`dist/supy-1.0.5.apk`**.
Strona wskazuje wersjonowany plik; `dist/supy.apk` pozostaje aliasem najnowszego
wydania. Pobieranie nie zależy od godzinnego serwera na porcie 8767.

Jeśli supy jest już zainstalowane, zainstaluj APK jako aktualizację bez
odinstalowywania poprzedniej aplikacji. Ten sam pakiet i podpis pozwalają
zachować jej dane. Użytkowniczka korzysta z GrapheneOS i oczekuje linku do
nowego APK przy dostarczeniu zmian, także gdy zmiany strony technicznie
wymagają tylko odświeżenia.

1. Pobierz `dist/supy.apk` na telefon i otwórz plik.
2. Gdy Android zapyta, zezwól tej przeglądarce lub menedżerowi plików na
   instalowanie aplikacji z tego źródła, następnie wybierz **Zainstaluj**.
3. Na liście aplikacji znajdź **supy**. Przytrzymaj ikonę i przeciągnij na pulpit
   albo wybierz **Dodaj do ekranu głównego**, zależnie od telefonu.
4. Od tej pory otwieraj aplikację przez tę ikonę. Uruchamia ona natywny WebView.

Instalacja przez USB:

```bash
adb install -r dist/supy.apk
adb shell am start -n io.github.dosiaczek.supy/.MainActivity
```

## Zmiany widoczne po odświeżeniu

APK **nie zawiera kopii strony**. Przy otwieraniu pobiera stronę z serwera,
a zielony przycisk **Odśwież aplikację** z białym napisem i strzałką w natywnym
górnym pasku lub **⋮ → Odśwież** wczytuje
bieżącą stronę i jej zasoby ponownie. `LOAD_NO_CACHE` oraz czyszczenie wyłącznie
cache HTTP przy odświeżaniu zapobiegają korzystaniu ze starych plików strony.
Serwer dla HTML, CSS i JS wysyła obecnie `Cache-Control: no-store`.

Do pobrania zmian strony pod tym samym adresem technicznie wystarczy
**Odśwież aplikację**. Zgodnie z preferencją użytkowniczki dostarczamy też nowe
wydanie APK z linkiem do pobrania. Jeśli zmiana dotyczy `sup/src/`, należy
najpierw wykonać normalne budowanie strony (`npm run build` w `sup/`), aby
zaktualizować serwowane `assets/app.js` i `assets/app.css`. Zmiany samej natywnej
aplikacji, np. ikony, uprawnień lub adresu startowego, wymagają nowego APK.

Odświeżanie nie usuwa zapisanych wypraw, localStorage, IndexedDB ani cookies.
Niezapisany formularz nadal może wymagać zapisania przed odświeżeniem strony.
Jeśli w przyszłości strona otrzyma service workera, jego strategia aktualizacji
również musi pobierać aktualne zasoby — cache workera jest osobny od cache HTTP.

## Twoje trasy i logowanie

WebView ma własną pamięć, oddzielną od Chrome. Trasy zapisane lokalnie w Chrome
nie pojawią się w nowej aplikacji automatycznie. Przenieś je przez **Eksportuj**
w Chrome i **Importuj** w supy albo zaloguj się do tego samego skonfigurowanego
konta dziennika w chmurze. Zapisane w supy dane pozostają po odświeżaniu i
aktualizacji przez `adb install -r` z tym samym podpisem.

Import JSON/GPX korzysta z systemowego wyboru dokumentów. Eksport JSON strony
jest zapisywany przez systemowe okno **Zapisz**. Krótki skrypt jednorazowo
odczytuje żądany Blob strony przez `evaluateJavascript`; nie ma
`addJavascriptInterface` ani udostępnionego stronie obiektu natywnego. Jeśli
Android odtworzy Activity podczas wyboru pliku, powtórz import/eksport.

## Zachowanie aplikacji

- Polski interfejs, własna ikona adaptacyjna i wariant ikony tematycznej.
- JavaScript, DOM storage, trwałe cookies i cookies osadzonych stron.
- Wstecz: najpierw historia strony, potem zamknięcie Activity; klawiaturę
  obsługuje Android. Obsługa nowego mechanizmu Wstecz na API 33+.
- Uwzględnione paski systemowe, wycięcie ekranu i klawiatura, także edge-to-edge.
- Menu: Odśwież, Moje trasy, Adres strony z kopiowaniem, Otwórz w przeglądarce.
- Pasek postępu i natywny ekran błędu z ponawianiem połączenia. Błąd pojedynczego
  obrazka lub mapy nie zasłania całej strony.
- Linki HTTP(S) na `zuffie.test` pozostają w aplikacji; linki zewnętrzne otwiera
  przeglądarka. Osadzone mapy nadal działają wewnątrz strony. Obsługa linków
  `target="_blank"` zainicjowanych przez użytkownika.
- Historia WebView jest zapisywana/odtwarzana przy odtworzeniu Activity.
  Nie gwarantuje to zachowania pamięci JavaScript i niezapisanych formularzy.

## Sieć

Telefon musi rozwiązywać nazwę **zuffie.test** i mieć dostęp do portu **8766**.
Zazwyczaj oznacza to domowe Wi-Fi albo odpowiedni VPN/DNS. Ustawienia DNS
komputera nie przenoszą się do APK. Sama instalacja nie udostępnia serwera
w internecie.

Sprawdzony adres używa HTTP i nie przekierowuje na HTTPS. Konfiguracja Androida
zezwala na HTTP wyłącznie dla dokładnej nazwy `zuffie.test`, na wszystkich jej
portach. Inne hosty wymagają HTTPS. Systemowe CA i weryfikacja nazwy/certyfikatu
pozostają włączone; błędy SSL są zawsze odrzucane. Obecnie nie potrzeba prywatnego
CA. Przy przejściu na HTTPS z lokalnym CA należy osadzić tylko jego publiczny
certyfikat i zaufać mu dla konkretnego hosta, nigdy wyłączać weryfikacji SSL.

## Budowanie i podpisywanie

W tym katalogu, na x86_64 Linux z Nix/flakes:

```bash
nix build path:.                 # result/supy-unsigned.apk
nix run path:.                   # dist/supy.apk i dist/supy.apk.sha256
nix run path:.#verify -- dist/supy.apk
```

Konfiguracja bazuje na działającym Falki i pinie z
`/home/dosiaczek/green_android`: nixpkgs
`46db2e09e1d3f113a13c0d7b81e2f221c63b8ce9`, Android SDK 36,
build-tools 36.0.0 i JDK 17. Bez Gradle i zależności Maven. Nix uruchamia
aapt2 → javac → d8 → ZIP → zipalign, a `nix run` podpisuje wynik poza sandboxem.
`nix develop path:.` udostępnia te same narzędzia. `path:.` obejmuje również
nowe pliki robocze bez dodawania ich do wspólnego indeksu Git.

Przed wydaniem zbuduj stronę w `sup/` przez `npm run build` w opisanym środowisku
Nix, a potem zbuduj i podpisz APK. Skopiuj podpisany plik do nazwy zawierającej
nową wersję (obecnie `dist/supy-1.0.5.apk`), przygotuj jego SHA-256 i zaktualizuj
link oraz opis w `download.html`. Sprawdź zgodność podpisu z poprzednim wydaniem
i zgodność APK pobranego przez HTTP z plikiem lokalnym. Podaj użytkowniczce
bezpośredni link do wersjonowanego APK oraz odnośnik do pliku w środowisku pracy.

Własny, trwały klucz supy jest tworzony na koncie uruchamiającym `nix run`:

```text
~/.local/share/supy-android/release.p12
~/.local/share/supy-android/release.password
```

**Zrób bezpieczną kopię obu plików.** Katalog ma uprawnienia `0700`, pliki
`0600`; klucz nie trafia do źródeł ani Nix store. Alias: `supy`, RSA-3072.
Każdy kolejny APK używa tego samego klucza. Przy wydawaniu nowego APK zwiększ
`versionCode` oraz zaktualizuj `version` w `flake.nix`.

## Weryfikacja

Wyniki dostarczenia zapisano w `VERIFICATION.md`. Sprawdzenie kompilacji,
pakietu, podpisu i serwera nie zastępuje testów na telefonie.

Skrypt eksportu ma dodatkowy test integracyjny w desktopowym Chromium:

```bash
nix shell github:NixOS/nixpkgs/46db2e09e1d3f113a13c0d7b81e2f221c63b8ce9#nodejs_22 \
  --command node tests/blob-download.mjs
```

Ten test używa istniejącego Playwright z `sup/node_modules`, systemowego Chromium
i działającej strony. Nie jest częścią budowania APK ani testem Androida.
Na telefonie należy sprawdzić: ikonę i start w „Moje trasy”, odświeżanie zmian,
Wstecz, klawiaturę, obrót/wycięcie ekranu, zachowanie wpisów i logowania,
import JSON/GPX, eksport JSON, linki zewnętrzne oraz błąd sieci z ponowieniem.
