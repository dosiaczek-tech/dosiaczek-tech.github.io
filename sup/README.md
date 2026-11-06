# Z nurtem — atlas i dziennik SUP

Osobna, statyczna aplikacja pod **http://zuffie.test:8766/sup/**.

## Funkcje

- Atlas **117 tras i wariantów**, w tym **108 z Kaszub, Borów Tucholskich i sąsiednich
  szlaków Pomorza**. Kliknięcie linii, znacznika lub karty
  otwiera długość odcinka, charakter nurtu, zwałki, przenoski, ocenę pod kątem SUP
  oraz oryginalną ocenę kajakową i link do źródła.
- Każda trasa ma własny, stały kolor, także po sortowaniu lub filtrowaniu.
  Kliknięcie nakładających się linii otwiera wybór wariantu. Wybrana trasa ma
  wyróżniony przebieg, START, METĘ i opcjonalne znaczniki kilometrów.
  Wpisy z katalogu zachowują ten kolor w dzienniku; ręcznie zapisane trasy
  otrzymują własne kolory.
- Linie katalogu prowadzą po wodzie. Rzeki korzystają z koryt OSM, a brakujące
  przejścia przez jeziora są wyznaczane w granicach akwenu z ominięciem wysp.
  Przewózki, przenoski i luki są oddzielnymi przerwami z numerowanymi punktami.
- Pinezki miejsc dostępu do wody z opisem brzegu/dojścia, zasad korzystania,
  sezonu i źródłami. „Start tutaj” / „Meta tutaj” oraz listy w szczegółach trasy
  pozwalają wybrać krótszy wariant. Przy nieciągłym przebiegu pokazujemy także
  dostęp do poszczególnych części wodnych. **≈** oznacza przybliżoną lokalizację
  opisanego miejsca; informację widać przed wyborem, na pinezce i w jej opisie.
- „Pokaż odcinek” przycina istniejącą linię wodną pomiędzy wybranymi punktami,
  mierzy ją i pozwala zapisać w dzienniku. Powrót do tej samej przystani jest
  osobnym wystąpieniem na trasie; wybór nie pomija odcinka powrotnego.
- Obie mapy można przybliżać i oddalać kółkiem myszy, a także przyciskami +/−.
- Szukanie rzeki, miejscowości i regionu (również bez polskich znaków), filtry
  trudności, przeszkód, akwenu, regionu i rodzaju wyprawy. Sortowanie po długości
  lub nazwie. Przycisk nad filtrami pokazuje przykład Wdy: Osowo Leśne–Wdecki Młyn.
- Własna trasa po rzece: główne przyciski nad mapą wybierają start i metę.
  Pierwszy punkt może automatycznie rozpoznać rzekę (do 150 m); przy kilku
  pobliskich szlakach aplikacja prosi o wybór rzeki z listy. Można też wybrać
  rzekę oraz podpowiedzi miejsc lub wpisać współrzędne `szerokość, długość`.
  Przyciski „Wskaż start na mapie” i „Wskaż metę na mapie” zawsze włączają wybór
  danego końca i przewijają stronę do mapy, również po ponownym naciśnięciu.
  Przebieg automatycznie podąża za korytem i jego zakrętami; dystans mierzy tę
  linię. Znaczniki startu i mety można przeciągać, a końce zmienić także przy
  edycji zapisanej wyprawy. Dostępne są fragmenty **36 rzek i kanałów** z lokalnego
  zestawu danych, również poza gotowymi odcinkami atlasu. Zasięg pokazuje linia
  na mapie. Brak ciągłego połączenia oznacza błąd, bez prostego skrótu przez ląd.
- Ręczne rysowanie jest osobno pod mapą w zwijanej sekcji **„Rysowanie ręczne —
  proste odcinki”**. Pomiar jest wyraźnie opisany jako suma prostych. Przy szkicu
  lub edycji wpisu z dwoma punktami przycisk **„Dopasuj tę prostą do rzeki”**
  zastępuje prostą krzywą po wodzie, zachowując nazwę, datę i notatki. Nieudane
  dopasowanie zachowuje pierwotny szkic; zmiana wpisu wymaga zwykłego zapisu.
- Podpowiedzi Raduni rozpoznają **Ostrzyce** (pomost nad jeziorem) oraz
  **Trątkownicę** (przystań Kaszubskich Kajaków za mostem, dalej niż przystanie
  w Kiełpinie). Ten wariant w aktualnych danych ma 528 punktów i około 14,3 km.
  Nazwę i położenie mety potwierdza [opis operatora](https://kaszubskiekajaki.pl/1-Splywy)
  oraz [jego adres](https://kaszubskiekajaki.pl/3-Kontakt). Dystans zależy od
  dokładnych końców; to pomiar przebiegu z mapy, nie zapis GPS faktycznej wyprawy.
- Dziennik z nazwą, datą, rodzajem akwenu, notatkami i edycją. Trasy z katalogu
  można przenieść do formularza przez „Już tędy płynęłam”.
- Opcjonalna synchronizacja prywatnego dziennika przez **Supabase Free**,
  z logowaniem e-mailem i hasłem, rejestracją oraz odzyskiwaniem hasła.
  Osobne kopie lokalne kont, kolejka zmian bez połączenia i scalanie między
  urządzeniami. Instrukcja: **[cloud-setup.html](cloud-setup.html)**.
- Import GPX (ślady i trasy, zachowanie przerw między segmentami), eksport i import
  kopii JSON. Ponowny import tej samej kopii nie duplikuje wpisów i zachowuje
  lokalne edycje istniejących identyfikatorów.
- Układ na telefon i komputer, obsługa klawiatury, komunikaty błędów pamięci i sieci.

## Zapisywanie danych

Bez logowania wyprawy zapisują się w `localStorage`, pod kluczem
**`sup:journal:v1`**, osobno dla danego profilu przeglądarki i adresu strony.
HTTP, HTTPS, inna domena lub port mają osobne magazyny.

Po konfiguracji chmury i zalogowaniu dziennik konta synchronizuje się z Supabase.
Przycisk „Przenieś wcześniejsze wpisy z tego urządzenia” kopiuje stare wpisy na
konto; oryginał lokalny pozostaje zachowany. Samo logowanie nie przypisuje
automatycznie danych gościa do konta. Na drugim urządzeniu wystarczy zalogować
się do tego samego konta w aplikacji z tą samą konfiguracją projektu.
`cloud-config.json` zawiera publiczny adres i klucz podłączonego projektu.
Pozostawienie obu wartości pustych przełącza aplikację w tryb wyłącznie lokalny.

Kopie kont są rozdzielone w `sup:journal:account:<projekt>:<uid>:v1`, zapamiętany
profil w `sup:journal:active:v1`, a sesja Supabase w `sup:auth:<projekt>:v1`.
Wylogowanie przełącza na dziennik lokalny; kopia konta i jego niewysłane zmiany
pozostają do ponownego zalogowania. Hasła nie są zapisywane w kopii dziennika.

Eksportuj JSON przed czyszczeniem danych strony albo przejściem na inne urządzenie.
Limity: 500 wypraw, 20 000 punktów na wyprawę, 8 MB GPX, 15 MB kopii JSON;
rzeczywista pojemność localStorage zależy od przeglądarki. Nieudany zapis zachowuje
szkic. Nieczytelne dane nie są automatycznie kasowane; eksport pozwala pobrać ich
surową kopię. Wpis zmieniony w innej karcie lub po synchronizacji wymaga ponownego
otwarcia edycji. Eksport/import dotyczy aktualnie wyświetlanego dziennika, zachowuje
format wersji 1 i nie zawiera sesji logowania ani wewnętrznej historii synchronizacji.

Ręczny rysunek mierzy proste odcinki między kliknięciami, nie wyznacza automatycznie
szlaku po rzece. GPX mierzy wyłącznie odcinki wewnątrz segmentów. Wpis z katalogu
zachowuje kilometraż źródłowy i informację o rodzaju geometrii.

Po wczytaniu katalogu starsze geometrie przypisanych do niego wypraw są aktualizowane
do przebiegu wodnego, z zachowaniem nazwy, daty, notatek i zapisanego dystansu.
Dotyczy to także importowanych kopii. Ręczne rysunki oraz GPX nie są zastępowane.
Wybrany wariant między wodowaniami zachowuje własną geometrię, także po aktualizacji
katalogu, edycji i imporcie kopii. Opcjonalne `sourceSection` przechowuje identyfikatory
punktów, wystąpień i nazwy końców; dystans jest zawsze przeliczany z zapisanej linii.
Taki wpis oznacza kartę jako **„Przebyty fragment”**, nie jako przebytą pełną ofertę.
Starszy schemat bez odpowiednika w katalogu pokazuje same lokalizacje, bez
łączącej je prostej. Magazyn i kopie nadal korzystają z wersji 1; obsługiwany jest
dodatkowy rodzaj geometrii `water-route` oraz odcinki `MultiLineString`.

## Dane i ich dokładność

`data/routes.json` zawiera autorskie streszczenia faktów z publicznych opisów,
odczytanych **22–23.10.2026**. Długości dotyczą opisanych odcinków, nie całych rzek.
Źródła opisują kajakarstwo; `difficulty` oraz `supNote` są interpretacją dla SUP,
natomiast `sourceDifficulty` zachowuje charakter oceny źródłowej. Opisy nie są
raportem bieżącej drożności ani potwierdzeniem aktualnego udostępnienia dla SUP.

Rozszerzenie o 78 tras opracowano na podstawie:

- [Kaszuby Północne — szlaki kajakowe](https://kaszubypolnocne.pl/szlaki/szlaki-kajakowe/):
  Piaśnica, Reda, Czarna Wda.
- [eKajaki — spływy wielodniowe](https://www.ekajaki.pl/splywy_wielodniowe.html),
  z rozwinięciem o szczegółowe oferty jednodniowe i weekendowe: Słupia, Łupawa,
  Bukowina, Kamienica, Skotawa, Bytowa, Radunia, Łeba, Wda, Brda, Wierzyca i dopływy.
- [Hydrostacja — Kaszuby i Bory Tucholskie](https://www.kajaki.hydrostacja.pl/kajaki-kaszuby-bory-tucholskie/),
  uzupełniona jej ofertami jednodniowymi i kilometrażem Wdy: 12 odcinków Wdy i Brdy.
- [Pomorskie Szlaki Kajakowe](https://kajaki.pomorskie.eu/szlaki-kajakowe/):
  dodatkowe mniejsze rzeki, kanały, jeziora oraz porównanie opisów.

Kolejne **23 odcinki Wierzycy** pochodzą z
[Kajakodajni — opis Wierzycy](https://www.kajakodajnia.pl/wierzyca-opis.html).
Uwzględniono obie listy (11 i 14 pozycji), sześć opisów oraz wymieniony w tekście
wariant Stocki Młyn–Brody. Powtórzenia i nazwy Krąg / Kręgski Młyn, Kolincz /
Kolincki Młyn połączono w jedne karty z odnotowaniem rozbieżności kilometrażu.
`sourceReferences` pozwala sprawdzić pokrycie wszystkich 32 odwołań na stronie.
Podlinkowane oferty `kajaki.pomorskie.pl` uzupełniają informacje o przeszkodach
i punktach startu/mety. Wyszukanie **„Kajakodajnia”** wyświetla całą tę kolekcję.

Trzy górne etapy, dla których strona podaje tylko punkty, dystans i czas, mają
**„Brak oceny SUP”**. Stocki Młyn–Brody jest wymieniony bez osobnego kilometrażu:
**ok. 9 km** to jawny szacunek z różnic długości opublikowanych etapów (9–10 km).
Oznaczenie szacunku zachowuje się w dzienniku oraz kopii JSON dzięki opcjonalnemu
polu `distanceEstimated`, bez zmiany wersji ani wymagań dla starszych wpisów.
Kręgski Młyn–Żabno pokazuje koryto Wierzycy z dojściem w okolice tamy i odcinkiem
powrotnym. Koryto OSM daje około 6,4 km wobec 4 km w ofercie (wariant przez
rozlewisko). Różnica nie powoduje zastąpienia rzeki prostą linią: mapa mierzy
widoczny przebieg, a karta oddzielnie podaje kilometraż opublikowany przez operatora.

Pełny spis tras, kilometraży i odnośników: **[SOURCES.md](SOURCES.md)**.
117 wpisów nie oznacza 117 rozłącznych rzek: dłuższe wyprawy obejmują także krótsze
odcinki z katalogu. Filtr wielodniowy wykorzystuje deklarację źródła, a nie czas
oszacowany dla SUP. Nie sumuj wszystkich długości jako unikalnych kilometrów rzek.

Wybrane rozbieżności są zapisane w `lengthNote`, `portages` i `accessNote`:
Reda (28 / 22 km), Kanał Wdy (22,5 / 18 km), różne granice etapów Hydrostacji,
przewózki na Słupi i ominięcie zamkniętego Jaru Raduni. Dla Studnicy wykorzystano
37 km Miastko–Kawka z regionalnego przewodnika, zamiast sprzecznych 117 km w karcie
oferty wielodniowej. Hydrostacja odradza SUP na górnej Wdzie z powodu płycizn — ta
informacja jest widoczna mimo łatwej oceny kajakowej innych źródeł.

Źródła wcześniejszej kolekcji ogólnopolskiej:

| Odcinki | Źródło |
| --- | --- |
| Krutyń–Ukta, Ukta–Nowy Most, Zgon–Krutyń | [AS-TOUR — Krutynia](https://www.splywy.pl/krutynia/) |
| Swornegacie–Męcikał | [Pomorskie Szlaki Kajakowe — Brda](https://kajaki.pomorskie.eu/en/brda-easy/) |
| Męcikał–Woziwoda | [Pomorskie Szlaki Kajakowe — Brda](https://kajaki.pomorskie.eu/en/brda-easy-2/) |
| Woziwoda–Piła-Młyn | [Pomorskie Szlaki Kajakowe — Piekiełko](https://kajaki.pomorskie.eu/en/brda-medium/) |
| Skrzeszewo–Kozin | [Pomorskie Szlaki Kajakowe — Bukowina](https://kajaki.pomorskie.eu/en/bukowina-hard/) |
| Tuchomie–Gałąźnia Mała | [Pomorskie Szlaki Kajakowe — Kamienica](https://kajaki.pomorskie.eu/en/kamienica-hard/) |
| Zielona Chocina–Swornegacie | [Pomorskie Szlaki Kajakowe — Chocina](https://kajaki.pomorskie.eu/en/chocina-easy/) |
| Ujście Młosiny–jezioro Księże | [Pomorskie Szlaki Kajakowe — Zbrzyca](https://kajaki.pomorskie.eu/zbrzyca-ujscie_mlosiny-jezioro_ksieze/) |
| Maćkowa Ruda–Frącki | [AS-TOUR — Czarna Hańcza](https://www.splywy.pl/czarna_hancza/) |
| Tomaszów Mazowiecki–Spała | [PAGAj — Pilica](https://kajaki-pilica.pl/trasy-kajakowe-pilica/splyw-kajakowy-tomaszow-mazowiecki-spala/) |
| Bieżany–Strzegowo | [AGRO-KAJAK — Wkra](https://www.kajaki-wkra.pl/splywy-kajakowe-rzeka-wkra-100-km-od-warszawy/) |
| Barnimie–Bogdanka | [Kajaki.pl — Drawa](https://www.kajaki.pl/rzeka,drawa,pl,20.html) |
| Morawica–Ostrów, Kuby-Młyny–Morawica | [KAJARK — Czarna Nida](https://www.kajaki-nida.pl/szlaki-kajakowe/) |

`data/route-map.geojson` to dane pochodne **© OpenStreetMap contributors,
[ODbL 1.0](https://www.openstreetmap.org/copyright)**, pobrane przez Nominatim i API OSM.
Zawierają identyfikatory obiektów OSM, kotwice odcinków, datę pobrania i opis
dokładności. Końce z przypisanym miejscem dostępu prowadzą w pobliże opisanej
przystani lub wodowania; pozostałe są jawnie orientacyjne (znak **„?”**).
Linie nie wyznaczają dróg dojścia ani lądowych tras przenosek. Aktualne
liczby tras wodnych i tras z przerwami aplikacja wylicza z GeoJSON.

**Żadna trasa katalogu nie używa prostych łączących miejscowości.**
`osm-waterway` oznacza przebieg po korycie, `water-route` zawiera także przejścia
przez akweny oparte na poligonach OSM. Te ostatnie są orientacyjnymi liniami po wodzie,
a nie nagranymi śladami GPS. Generator sprawdza, że nie przecinają lądu ani wysp.
`LineString` lub `MultiLineString` zachowuje tylko odcinki wodne. Luki w danych
nie są dorysowywane; `properties.breaks` opisuje ich końce i przyczynę.

Radunia Stężyca–Gdańsk ma trzy odcinki wodne: do Trątkownicy/Kiełpina,
Rutki–Łapino (rejon Kolbud) oraz Straszyn–Gdańsk z końcówką Motławą.
Wyjście przed przewózką do Straszyna jest przy parkingu na prawym brzegu zbiornika
Łapino, według aktualnego opisu i mapy Kajaczkowa. Przewózki omijają
Jar Raduni i zbiornik Straszyn, zgodnie z
[regionalnym opisem Raduni](https://kajaki.pomorskie.eu/rzeka/radunia/).
Analogicznie zachowane są przewózki na Słupi. Numerowane punkty przerw pozwalają
otworzyć ich opis, bez kreślenia linii po lądzie.

Znaczniki kilometrów są interpolowane wzdłuż widocznych odcinków wodnych.
Przerw nie dodajemy do dystansu i nie przeskalowujemy pomiaru
do długości oferty. Na przykład Wda Osowo Leśne–Wdecki Młyn ma 21,6 km w ofercie,
a pomiar linii między orientacyjnymi punktami może być krótszy. Przy oddaleniu
etykiety rozstawiamy co 5 lub 10 km i ukrywamy kolidujące, a po przybliżeniu
pokazujemy co 1 km. Nieciągły przebieg może mieć krótszy pomiar niż cała wyprawa.

Pliki wspierające kontrolę geometrii:
- `data/water-areas.geojson` — granice jezior wykorzystane do przejść po wodzie;
- `data/waterways-reference.json` — pobrane linie OSM stanowiące podstawę przebiegów;
- `data/geometry-audit.json` — wynik dla każdej ze 117 tras: długość, liczba
  fragmentów, odległości punktów od wody, luki oraz pochodzenie danych.
- `data/access-points.json` — miejsca dostępu i ich wystąpienia wzdłuż każdej trasy;
- `data/access-audit.json` — pokrycie startów/met, części wodnych, możliwości wyboru
  wariantu oraz opisy źródłowe, dla których nie znaleziono jednoznacznej lokalizacji.

### Pochodzenie i pokrycie wodowań

Źródłami są konkretne obiekty OSM (m.in. `canoe=put_in`, `waterway=access_point`,
slipy i nazwane przystanie kajakowe), katalog **Pomorskich Szlaków Kajakowych**,
opisane pinezki Hydrostacji i eKajaków na Traseo oraz punkty z publicznych map
Kajaki.Pomorskie.PL podlinkowanych przez Kajakodajnię. Nie każdy most, pomost,
kemping ani adres wypożyczalni jest automatycznie uznawany za wodowanie.
Przejrzane powiązania źródeł znajdują się w `tools/access-directory-links.mjs`,
`tools/operator-access-notes.mjs`, `tools/map-pin-notes.mjs`,
`tools/track-access-notes.mjs`, `tools/reviewed-facilities.mjs`,
`tools/reviewed-locations.mjs`, `tools/reviewed-crossings.mjs` i
`tools/guide-access-notes.mjs`. `tools/access-targets.mjs` wiąże zatwierdzony
punkt z końcem trasy przed trasowaniem, zamiast szukać wodowania przy centroidzie wsi.

**Stan po przeglądzie 23.10.2026:** 240 miejsc, przypisane oba końce **117/117 tras**
i możliwość wyboru odcinka na każdej z nich. **12 lokalizacji jest przybliżonych**;
11 tras wykorzystuje co najmniej jedną z nich jako start lub metę.
Oba końce ma opisane **130/134 narysowanych części wodnych**. Pozostałe cztery
fragmenty należą do Granicznej Wieprznica–Rybaki: rozdzielają je trzy luki geometrii
(około 167, 180 i 168 m). Ich sześć granic nie jest przedstawianych jako miejsca
wodowania ani wyjścia. Wszystkie końce zaplanowanych przewózek i oznaczonej
przenoski w Konradowie mają osobne punkty dostępu. Aktualne liczby podaje `summary`
w plikach danych i stopka atlasu.

To przegląd
źródeł, nie terenowa weryfikacja wszystkich miejsc ani potwierdzenie publicznego
dostępu z własnym SUP-em. Przy punktach prywatnych widoczne są warunki uzgodnienia
dostępu; punkt z zakazem nie jest dostępny w selektorze. Historyczne mapy operatorów
mogą mieć starszą datę śladu niż data odczytu strony — obie daty są wyświetlane.

Pinezka obiektu pozostaje w jego źródłowych współrzędnych, a dla obrysów OSM
wybierany jest wierzchołek najbliższy pełnemu korytu, nie centroid pola ani koniec
już przyciętej trasy. Przybliżone punkty mają jawne `coordinateAccuracy` i
`coordinateMethod`:

- `documented-road-crossing` / `documented-portage-area` — wskazany w opisie
  rejon przeprawy lub przenoski, bez udawania pomiaru konkretnego zejścia;
- `guide-river-kilometre` — Męcikał, ul. Leśna: km 142,4 Brdy, 500 m powyżej
  mostu DW235 na km 141,9; źródło podaje kilometraż z dokładnością ok. 100 m.
  To inna lokalizacja niż pole nad jeziorem Trzemeszno;
- `documented-facility-nearest-river` — Bieżany: orientacyjny punkt na Wkrze
  przy potwierdzonej bazie. Zachowane są współrzędne bazy, przesunięcie i źródło
  cieku; dokładne zejście wskazuje obsługa.

Kody lokalizacyjne Plus Code z map obiektów są odczytywane względem wskazanej
miejscowości; środek kadru mapy nie jest współrzędną wodowania.
Wariant jest przycinany
na linii wodnej do najbliższej pozycji przy tym obiekcie (do 150 m); popup podaje
odległość do narysowanego przebiegu. Nie rysujemy prostego dojazdu przez ląd.
Zmiana końca pełnej trasy wymaga obiektu przy tej samej sieci wodnej, dopasowania
do 120 m. Przeniesienie automatyczne wymaga przejścia po wodzie bez luk;
przejrzana kotwica nie może powodować nowej dużej luki. Projekcja dzieli istniejącą
krawędź wody, bez dorysowania odcinka po lądzie. Konkretne pinezki początku/mety wskazane
przez operatora mają pierwszeństwo, np. różne strony tamy w Kolinczu.
Klucz geometrii przy powiązaniach chroni przed użyciem indeksów ze starszego
pliku przy częściowej aktualizacji zasobów statycznych.

Meta w Gniewie wymaga dopłynięcia Wisłą do przystani przy ul. Rybackiej;
opis trasy wyraźnie wskazuje ten fragment. Dla ofert kończących się ogólnie przy
ujściu Młosiny / jeziorze Księżym wybrano opisane miejsca Kaszuba / Laska.
Źródłowa długość oferty i rzeczywisty pomiar wybranego dostępu pozostają oddzielne.

Podkład mapy pobiera standardowe kafelki OpenStreetMap. Aplikacja nie buforuje ich
do użytku offline. Skrypty i style są lokalne; dostęp do internetu jest potrzebny
do kafelków i otwierania źródeł, nie do odczytu zapisanego dziennika po załadowaniu
aplikacji. Aplikacja nie ma service workera; praca bez połączenia dotyczy już
załadowanej aplikacji, nie gwarantowanego uruchamiania strony offline.

### Chmura: konfiguracja i scalanie

1. Utwórz projekt Supabase w planie Free (rejestracja e-mailem, bez Google).
2. Uruchom `supabase/journal.sql` w SQL Editor. Tabela `sup_journals` używa RLS:
   odczyt tylko dla `auth.uid()`. Zapis jest możliwy przez funkcję
   `sup_save_journal(expected_revision, new_trips)`, która samodzielnie wyznacza
   właściciela z sesji i odrzuca nieaktualną wersję. Brak dostępu anonimowego.
3. Włącz Email Auth oraz ustaw Site URL i dozwolone Redirect URLs na adres `/sup/`.
   Domyślne SMTP wysyła tylko do członków zespołu projektu, obecnie do 2 wiadomości
   na godzinę; dla innych adresów skonfiguruj własny SMTP.
4. Wpisz publiczne `url` i `publishableKey` do `cloud-config.json` i odśwież stronę.
   Obsługiwany jest też starszy klucz `anon`. Klucze `secret` / `service_role`
   nie są przeznaczone do pliku publicznego i są odrzucane przez aplikację.

Konfiguracja nie wymaga przebudowy bundla. Publikuj ją pod tym samym adresem co
aplikację. Szczegółowy przewodnik dla właścicielki: [cloud-setup.html](cloud-setup.html).
Plan Free może uśpić projekt po tygodniu nieaktywności; wznowienie następuje
w panelu Supabase. W razie braku połączenia aplikacja zachowuje lokalne zmiany
i nie pokazuje ich jako wysłanych.

- `src/journal-store.js` zapisuje wpisy i bazę synchronizacji atomowo w jednym
  kluczu. Rozdziela projekty, konta i pierwotny dziennik gościa.
- `src/sync-core.js` porównuje wpisy z ostatnim znanym stanem serwera, używając
  kanonicznych skrótów SHA-256. Rozróżnia dodanie, edycję i usunięcie. Usunięty
  wpis nie wraca ze starszej kopii na telefonie. Dwie różne edycje lub edycja
  równoczesna z usunięciem zachowują zmienioną treść jako „kopię konfliktu”.
  Deterministyczne ID kopii zapobiegają powielaniu przy ponowieniach.
- Serwer używa porównania wersji (CAS); odpowiedź `40001` powoduje ponowne
  pobranie i scalenie, zamiast nadpisania zmian drugiego urządzenia.
- `src/cloud-client.js` korzysta z SDK dla sesji i odzyskiwania hasła. Żądania
  danych mają token przypisany do konta w momencie rozpoczęcia cyklu. Odpowiedź
  starej sesji nie jest stosowana po zmianie konta.
- `src/cloud-sync.js` synchronizuje po zapisie, powrocie połączenia lub do karty,
  co minutę w widocznej karcie oraz na żądanie. Web Locks ogranicza równoległe
  cykle w kartach przeglądarki, jeśli jest dostępne.

Testy bazy wykonują rzeczywisty PostgreSQL przez PGlite, sprawdzając uprawnienia
anonimowe, izolację użytkowników, zakaz bezpośredniego zapisu i kontrolę wersji.
Testy przeglądarkowe wykorzystują dwie izolowane przeglądarki i testowy endpoint
API; obejmują migrację, edycje, usunięcia, działanie bez połączenia, konflikt,
zmianę konta, rejestrację i odzyskiwanie hasła. Nie zastępują końcowej próby na
skonfigurowanym projekcie użytkowniczki.

## Rozwój i sprawdzanie

### Logo aplikacji

Źródłem znaku jest `assets/logo.svg`: kontur kobiety na desce SUP,
złote pióro wiosła i ciemnozielone tło, opracowane na podstawie przesłanego wzoru.
`assets/logo.png` to wersja 1024 × 1024. Znak strony i favicon (`assets/mark.svg`)
mają grubszą kreskę dla małych rozmiarów; ten sam rysunek wykorzystuje ikona
adaptacyjna Androida. Po zmianie źródłowego SVG wygeneruj warianty:

```sh
nix-shell ../shell.nix --run "node tools/prepare-brand.mjs --png"
```

Zmiana znaku strony jest widoczna po odświeżeniu. Ikona zainstalowanego Androida
wymaga aktualizacji APK według `android/README.md`.

Wszystkie polecenia uruchamiaj z `sup/`:

```sh
nix-shell ../shell.nix --run "npm ci"
nix-shell ../shell.nix --run "npm run build"
nix-shell ../shell.nix --run "npm test"
nix-shell ../shell.nix --run "npm run test:browser"
```

Build generuje `assets/app.js` i `assets/app.css`; te pliki są częścią aplikacji
statycznej i powinny być publikowane wraz z `index.html`, `assets/mark.svg` oraz
`data/`. Po zmianie `src/` wykonaj build i odśwież stronę.

Build przygotowuje też `data/river-network.json` przez
`tools/prepare-river-network.mjs`, wyłącznie z istniejących lokalnych danych OSM,
geometrii atlasu, obszarów wody i miejsc dostępu. Nie odpytuje usług sieciowych.
Sieć łączy odcinki tej samej rzeki we wspólnych punktach; zachowuje zakręty i nie
uzupełnia luk. Przy łączeniu przyciętej geometrii atlasu z korytem OSM dopuszcza
2 cm różnicy zaokrąglenia współrzędnych. Osie jezior przecinające wyspy są
pomijane na rzecz sprawdzonych przejść atlasu. Punkty użytkownika są rzutowane
na tę sieć z maksymalnej odległości 150 m. Sama linia nie potwierdza drożności,
legalnego wodowania ani możliwości ominięcia zapory.

Własne przebiegi mają rodzaj `river-route`, opis `riverRoute` (rzeka, nazwy startu
i mety), własną geometrię oraz dystans wyliczony z niej. Przechodzą przez zapis,
kopie JSON i synchronizację; aktualizacja katalogu nie zastępuje ich gotową
trasą. Zmiana końca w formularzu unieważnia poprzednią linię do czasu ponownego
wyznaczenia, aby nie zapisać starej geometrii z nowymi końcami.

Testy przeglądarkowe korzystają z istniejącego serwera, nie uruchamiają ani nie
restartują wspólnej infrastruktury. `SUP_BASE_URL` może wskazać inne `/sup/`,
`SUP_CHROMIUM` — inną ścieżkę Chromium. Domyślnie używają systemowego Chromium
w `/run/current-system/sw/bin/chromium`. Każdy test ma izolowany profil pamięci.
Zrzuty ekranu i wyniki znajdują się w ignorowanym `test-results/`.

### Aktualizacja katalogu i geometrii

```sh
nix-shell ../shell.nix --run "npm run data:catalogue"
nix-shell ../shell.nix --run "npm run data:map"
nix-shell ../shell.nix --run "npm run data:access"
```

`tools/kaszuby-catalogue.mjs` i `tools/kajakodajnia-catalogue.mjs` są edytowalnymi
opracowaniami faktów i interpretacji regionalnych. `data:catalogue` aktualizuje te rekordy po stabilnych ID w
`data/routes.json`, zachowuje wcześniejsze wpisy i generuje `SOURCES.md`.
Zachowanie ID pozwala powiązać wcześniej zapisane wyprawy z katalogiem.

`tools/prepare-map.mjs` korzysta z `tools/osm-data.mjs`: jednorazowych,
sekwencyjnych zapytań Nominatim z identyfikującym User-Agent, odstępem co najmniej
1,25 s i lokalnym cache w `.cache/nominatim/`. Uzupełnia je API OSM: pełne relacje
rzek oraz niewielkie wyciągi zawierające brakujące nienazwane strugi i przepusty.
Nie wykonuje tych zapytań przy wejściu użytkownika na stronę.
Istniejący cache zachowuje odczytany snapshot; do aktualizacji usuń wyłącznie
odpowiednie lokalne wpisy tego cache. Nowy wynik należy przejrzeć i uruchomić
testy danych. Nazwy miejscowości bywają niejednoznaczne; sam geokoder nie stanowi
weryfikacji lokalizacji. Zapytania regionalne mają granice geograficzne; punkty
o identycznych nazwach wymagają doprecyzowania gminy. Niektóre kotwice pochodzą
bezpośrednio z obiektów OSM albo z publicznych odnośników do przystani podanych
przez operatora; przy takich punktach zachowany jest adres źródła.

`tools/water-plans.mjs` definiuje akweny i osobne etapy wodne, w tym świadome
przerwy na przewózki. `tools/water-graph.mjs` szuka przebiegu po sieci wodnej.
Na jeziorach korzysta z siatki wewnątrz poligonu, a skróty wygładza wyłącznie po
sprawdzeniu całego odcinka względem brzegów i wysp. Przy wąskich wejściach do
przystani lokalnie zagęszcza siatkę z 60 m do 10 m, nadal sprawdzając każdą krawędź.
Połączenia przez luki służą
wyłącznie ustaleniu kolejności fragmentów — nigdy nie są zapisywane jako linie
do wyświetlenia. Rozbieżność długości względem oferty nie usuwa koryta.
Błąd źródła lub punkt oddalony ponad 2,5 km od sieci wodnej wstrzymuje publikację
nowej mapy. `--only=id1,id2` zapisuje roboczy wynik wyłącznie do `.cache/`.

Testy geograficzne weryfikują każdą narysowaną krawędź: musi pokrywać się z linią
źródłową OSM lub w całości leżeć wewnątrz wody jeziora. Samo zagęszczenie punktów
na prostej przez ląd nie przejdzie tej kontroli. Osobne testy obejmują wyspy,
rozdzielenie odcinków Raduni, kilometraż bez przeskoków oraz migrację dziennika.

`tools/read-sources.mjs URL...` pomaga odczytywać publiczne opisy do ignorowanego
`.cache/source-pages/` (adres, data i SHA256 HTML). Parser nie wykonuje skryptów
pobieranej strony. `tools/inspect-river.mjs` i `tools/audit-geometries.mjs` służą
do diagnostyki geometrii.

### Aktualizacja miejsc dostępu

Zebranie źródeł jest osobnym krokiem przygotowania danych, nigdy zapytaniem
wykonywanym przez przeglądarkę użytkownika:

```sh
nix-shell ../shell.nix --run "node tools/collect-access-sources.mjs"
nix-shell ../shell.nix --run "node tools/inspect-source-maps.mjs"
nix-shell ../shell.nix --run "node tools/inspect-source-maps.mjs --all-operators"
nix-shell ../shell.nix --run "node tools/collect-operator-access.mjs"
nix-shell ../shell.nix --run "node tools/collect-map-pins.mjs"
nix-shell ../shell.nix --run "npm run data:refresh-access"
```

Źródła są zachowywane w `.cache/launch-sources/`; odczyt HTML/XML odbywa się bez
wykonywania skryptów pobranych stron. `collect-operator-access.mjs` odczytuje
publiczne dane mapy i opisane punkty, nie zamienia każdego końca śladu w przystań.
`geocode-access.mjs` zapisuje propozycje dopasowań do ręcznego przeglądu — sam
geokoder może wskazać inny obiekt w sąsiedniej miejscowości.
`collect-access-map.mjs` uzupełnia małe wyciągi OSM i przerywa na limitach API
(429/509). Overpass był niedostępny podczas zbierania danych. Nie ponawiaj
masowo pobierania wyciągów po komunikacie o limicie.

Po przywróceniu dostępności API można pobrać wyłącznie okolice nieustalonych
końców tras i części wodnych, korzystając z mniejszych wycinków:

```sh
nix-shell ../shell.nix --run "node tools/collect-access-map.mjs --missing"
nix-shell ../shell.nix --run "npm run data:refresh-access"
```

Postęp tej próby zapisuje się osobno w `.cache/launch-sources/missing-osm-progress.json`.
`tools/audit-access-gaps.mjs` rozróżnia brak punktu w źródłach od znanego obiektu
oddalonego od przebiegu. `--snapshot` zachowuje stan przed uzupełnieniem,
a `--compare` pokazuje nowe miejsca i trasy z uzupełnionymi końcami.
`--legs` wypisuje brakujące końce wszystkich fragmentów wraz z rodzajem przerwy.
`review-access-sites.mjs --directory=NAZWA` pokazuje opis PSK, a `--bridges`,
`--hydro`, `--near=lon,lat` wspierają ręczne porównanie z cache OSM.
`review-public-track.mjs URL` odczytuje pojedynczą publiczną mapę Traseo do przeglądu.
Kolektor operatorów uwzględnia również wszystkie mapy wymienione w kuracji
`track-access-notes.mjs`, w tym mapę Rutki–Łapino Kajaczkowa.
Import nakładających się wycinków OSM wybiera nowszą wersję obiektu, niezależnie
od kolejności plików cache.

`data:refresh-access` przebudowuje punkty, następnie końce geometrii wodnej i na
koniec indeksy punktów dla tej geometrii. Po samym `data:map` zawsze wykonaj
`data:access`. Przed publikacją sprawdź audyt, uruchom testy i build. Testy obejmują
przycięcie bez łączenia przerw, wizyty powrotne, zachowanie wariantu w dzienniku,
położenie końców przy wodowaniach i osobne pomosty przed/za tamą w Kolinczu.

Kod i zależności tej aplikacji pozostają w `sup/`. Integrację publikacji obsługuje
sesja infrastruktury. Licencja biblioteki mapowej: `THIRD_PARTY.md`.
