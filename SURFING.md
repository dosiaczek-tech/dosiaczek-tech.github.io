# Bałtyk Surf 0.2 — model, źródła i kierunek rozwoju

## Co już działa

- Osobne zakładki **Kamery** i **Prognozy surfingowe**; wejście bezpośrednie:
  `/#surf/wladyslawowo`. Po przejściu do prognozy odtwarzacz kamery jest zatrzymywany.
- 71 spotów / odcinków w 43 miejscowościach, 70 bezpośrednio powiązanych kamer.
  Rejestr w `surf-spots.js`: współrzędne, normalna brzegu, region i jawne ID kamer.
- Pięć kolejnych dób, wartości godzinowe, porównanie modeli, trzy najlepsze
  niepokrywające się okna dzienne po trzy godziny dla wybranej plaży.
- Fale: **DWD EWAM + ECMWF WAM**. Wiatr: **DWD ICON + NOAA GFS + ECMWF IFS**.
- Rzeczywiste pobieranie profilu dna **EMODnet** i eksperymentalna transformacja 1D.
- Osadzana mapa **Windy** (fale / wiatr), uruchamiana przyciskiem; link do Windy
  i lokalizacji na OpenStreetMap. Dane z iframe nie są wejściem modelu.
- Brak danych nie jest zerem. Awaria wiatru nie usuwa prognozy fal, ale wyłącza
  ocenę. Niepełny profil dna wyłącza transformację, a nie całą prognozę.
- Wykrywanie sekwencji onshore → słaby offshore / cisza przy utrzymującej się
  fali. Historia poprzednich 24 h jest analizowana także dla pierwszej godziny
  prognozy; API pobiera dodatkowo dwa poprzednie dni modelowe.
- 30 opisów społecznościowej mapy WestCoast i dodatkowo Sobieszewo. 28 spotów
  nie ma kamery konkretnego peaku; kamery sąsiednich plaż są oznaczone jako pobliskie.

To działający prototyp predykcji lokalnej, **nie zwalidowany odpowiednik LOTUS
ani uruchomiony model SWAN**. Nie znamy jeszcze jego błędu względem obserwacji.
Wynik oznacza potencjał dla rekreacyjnego surfingu na falach, nie kitesurfingu
czy windsurfingu, ani ocenę bezpieczeństwa.

## Zakres geograficzny

Prognoza dotyczy strony morskiej. Zatoka Gdańska (Trójmiasto i Mierzeja) jest
uwzględniona; zatoka wewnętrzna / Pucka — nie. Przykładowo Jastarnia ma prognozę
dla plaży Domu Zdrojowego, ale nie dla mola i Maszoperii. Jurata ma prognozę
dla morskiej plaży, nie mola na zatoce. Hel, Kuźnica, Chałupy, Puck i Rewa
nie otrzymują prognozy tylko dlatego, że istnieje kamera w danej miejscowości.
Tak samo pomijamy jeziora, centra miast, porty i widoki bez potwierdzonej plaży.

W zakładce prognoz jest wykaz **wszystkich miejscowości z katalogu kamer**:
liczba powiązanych kamer oraz lista pominiętych widoków. Przy dodawaniu kamery
trzeba ręcznie zweryfikować stronę akwenu i dopisać jej ID do odpowiedniego spotu.
W obrębie miejscowości kilka kamer może reprezentować sąsiednie plaże, nie dokładnie
ten sam peak. Współrzędne i azymuty są przybliżone; wymagają kontroli na mapie
i w terenie. Prognoza nie opisuje każdej pojedynczej rewy.

### Mapa WestCoast i Unplug

Źródło: [Surfing na Pomorze Zachodnie / WestCoast](https://www.google.com/maps/d/viewer?mid=124V-0M-nOqrd7XHs2fK-J9E86LTFxQ-C),
publiczny [KML](https://www.google.com/maps/d/kml?mid=124V-0M-nOqrd7XHs2fK-J9E86LTFxQ-C&forcekml=1),
odczyt 20.10.2026. Kontakt autora podany w mapie: zs-surf.pl. Współrzędne pochodzą
z punktów autora, opisy w aplikacji są naszymi krótkimi streszczeniami, a normalne
brzegu są przybliżeniami własnymi. Data obserwacji autora nie jest znana.

Mapa zawiera 31 punktów: 30 spotów i szkołę SurfAcademy. Importujemy 30 spotów,
z czego Międzyzdroje, Trzęsacz i Rewal scalamy z istniejącymi ID i doprecyzowujemy
położenie. Pozostałe 27 dostaje osobne ID. Punktu szkoły, linii podziału regionów
i wielokątów kąpielisk / terenów dostępu nie traktujemy jako spotów. Historyczne
opisy ograniczeń nie są aktualnym regulaminem akwenu.

Rejestr `surf-community.js` zawiera pochodzenie, lokalne kierunki fal i wiatru,
charakter dna / peaku oraz uwagi o konstrukcjach i dostępie. Poziom pozostaje
nieokreślony, jeśli źródło nie podaje oceny. Tylko sugestie nauki przy latarni
w Kołobrzegu i na pianie w Dźwirzynie są przekazywane jako **opinie autora zależne
od warunków**, nie zweryfikowana klasyfikacja bezpieczeństwa.

**Lokalne wskazówki nie zmieniają automatycznie siły wiatru ani kierunków w modelu.**
Przykładowo autor opisuje zachodni wiatr jako cross-off przy niektórych konstrukcjach
w Kołobrzegu. Normalna regionalnego brzegu może klasyfikować go jako boczny:
różnica jest widoczna w UI, zamiast ukryta przez arbitralne przestawienie normalnej.
Podobnie „SW swell” w opisie lokalnej fali nie musi być kierunkiem nadejścia
w punkcie modelu 5 km od brzegu. Obliczenie osłony i refrakcji przy konstrukcjach
wymaga dokładniejszej geometrii i modelu lokalnego.

Strona [Unplug — Vättern / Varamon](https://unplug-kitesurf.com/spots/vattern-varamon-sweden)
zwracała HTTP 503 (także wariant www) 20.10.2026. Nie importowano jej treści
ani poziomów. Ocena początkującego kitesurfera nie jest oceną początkującego
surfera: m.in. offshore może poprawiać powierzchnię fali, ale być niekorzystny
dla nauki kitesurfingu. Vättern jest jeziorem, nie częścią katalogu bałtyckich spotów.

## Źródła wykorzystane w v0.2

| Dane | Źródło / dostęp | Zastosowanie |
| --- | --- | --- |
| Hs, średni okres, kierunek fal | [Open-Meteo Marine](https://open-meteo.com/en/docs/marine-weather-api), jawne modele `dwd_ewam,ecmwf_wam` | Dwie równoległe prognozy, bez udawania niezależnych obserwacji |
| Wiatr 10 m, porywy, temperatura, dzień/noc | [Open-Meteo Weather](https://open-meteo.com/en/docs), `icon_seamless,gfs_seamless,ecmwf_ifs025` | Konsensus wiatru i wybór okien dziennych |
| Głębokość | [EMODnet Bathymetry WMS](https://ows.emodnet-bathymetry.eu/wms?service=WMS&request=GetCapabilities), warstwa `emodnet:mean`, `GetFeatureInfo` | Sześć próbek profilu poprzecznego do brzegu |
| Mapa pogody | [Windy](https://www.windy.com/), oficjalny embed | Wizualne porównanie, osobne od wyniku |
| Położenie plaży | [OpenStreetMap](https://www.openstreetmap.org/) | Link do mapy, nie numeryczna maska brzegu |

Według dokumentacji dostawcy DWD EWAM ma siatkę około 5 km, ECMWF WAM około
9 km. To nie jest rozdzielczość surfbreaku. Open-Meteo może interpolować czas;
godzinowa tabela nie oznacza niezależnego pomiaru co godzinę.

EMODnet ma siatkę 1/16 minuty kątowej (~115 m w osi N–S, mniej w osi E–W
na szerokości Bałtyku). Głębokości są względem **LAT**. WMS jest wersją bieżącą
produktu; nie zamrażamy wydania rastera. Źródła: EMODnet Bathymetry Consortium,
DTM 2024 [DOI](https://doi.org/10.12770/cf51df64-56f9-4a99-b1aa-36b8d7b743a1).
GEBCO uzupełnia luki w produkcie EMODnet — nie dodajemy go jako „drugiego modelu
dna”, co podwójnie liczyłoby część tych samych danych.

Publiczne API Open-Meteo jest przeznaczone do użytku niekomercyjnego i ma limity
zapytań; dane wymagają atrybucji CC BY 4.0. W aplikacji są wskazani Open-Meteo,
DWD, ECMWF, NOAA, EMODnet i właściciele map. Przed komercyjnym wdrożeniem
należy przejść na odpowiedni plan dostawców. Klucze płatnych API trzymać
po stronie serwera, nie w publicznym repozytorium.

## Obliczenia

Implementacja: `surf-model.js`, funkcje czyste, testowalne bez przeglądarki.

### 1. Czas i punkt wejścia

- Punkt fal znajduje się geodezyjnie 5 km od reprezentatywnego punktu spotu,
  w kierunku normalnym od lądu ku morzu; `cell_selection=sea` wybiera komórkę morską.
- Wiatr pobieramy dla punktu plaży. Siatki poszczególnych modeli mogą wskazywać
  inne rzeczywiste komórki niż zadane współrzędne. Profil dna odnosi się do
  zadanej trasy, nie do batymetrii wewnętrznej modeli atmosferycznych i falowych.
- API zwraca UTC Unix time. Łączymy fale i wiatr po znacznikach czasu, nie indeksie
  tablic. Daty wyświetlamy w `Europe/Warsaw`, z poprawną zmianą czasu letniego.
- Dane z poprzednich dwóch dni pozostają historią modelową, nie pomiarami.
  Przed wyświetleniem przyszłości analizujemy poprzednie 24 h każdego terminu;
  nie używamy późniejszych godzin do wyjaśniania wcześniejszych warunków.
- „Teraz” oznacza bieżącą godzinę prognozy, nie obserwację. `fetchedAt` to czas
  pobrania, a nie czas inicjalizacji modelu; API nie dostarcza tutaj tej ostatniej informacji.

### 2. Konsensus wiatru

Kierunki oznaczają **skąd** wieje / skąd nadchodzą fale. Uśredniamy komponenty
wektora prędkości, a kierunek liczymy przez `atan2`. Siła wiatru to mediana
prędkości modeli, a nie długość uśrednionego wektora — sprzeczne prognozy nie
mogą stworzyć fałszywej „ciszy”. Jeśli długość wypadkowego wektora / średnia
prędkość < 0,3, kierunek jest nieokreślony i nie wystawiamy oceny (poza ciszą).
Pokazujemy rozrzut prędkości, liczbę modeli i poszczególne prognozy.

### 3. Batymetria i fala przy brzegu

Pobieramy głębokości 100, 250, 500, 1000, 2000 i 5000 m od punktu spotu.
Niektóre punkty społecznościowe leżą na wodzie, więc dystans nie jest zawsze
odległością od fizycznej linii brzegu.
Rzędna ujemna WMS jest przekształcana na dodatnią głębokość. Ląd, brak danych
i wartości poza zakresem wyłączają transformację; nie wstawiamy sztucznego dna.

Dla każdego modelu fal osobno:

1. Rozwiązujemy dyspersję liniową `ω² = g k tanh(k h)` bisekcją, używając
   średniego okresu modelowego jako przybliżenia fali reprezentatywnej.
2. Wyznaczamy prędkość fazową `c=ω/k` i grupową
   `Cg = c/2 × (1 + 2kh/sinh(2kh))`.
3. Przy założeniu równoległych izobat prawo Snelliusa daje
   `sin(θ) = c/c_ref × sin(θ_ref)`.
4. Zachowanie strumienia energii normalnie do brzegu daje
   `H = H_ref × sqrt(Cg_ref cos(θ_ref) / (Cg cos(θ)))`.
5. Przechodzimy od morza w stronę plaży, interpolując liniowo między próbkami.
   Przy pierwszym `H >= 0,78 h` oznaczamy modelowe załamanie. Jeśli go nie ma,
   podajemy wartość z ostatniego punktu profilu wraz z głębokością.

Wynik to **orientacyjne Hs**, nie wysokość ściany fali i nie informacja o
rzeczywistej jakości breaku. Progi i przybliżenie fali reprezentatywnej nie są
skalibrowane dla Bałtyku. Nie modelujemy pełnego widma, tarcia dennego,
dyfrakcji, prądów, odbić, lodu, osłony falochronów i półwyspów ani zmian poziomu
morza. LAT nie jest aktualnym poziomem wody; w sztormie to istotne ograniczenie.
Piaszczyste rewy przemieszczają się znacznie szybciej niż aktualizuje się DTM.

### 4. Wynik surfingowy 0–100

To jawna heurystyka dla rekreacyjnego surfingu, nie model nauczony na danych.

- Wysokość: rosnąca użyteczność do 0,4 m, optimum 0,4–1,6 m, spadek do zera
  przy 3,5 m. Jeśli jest profil, używamy Hs po transformacji; inaczej Hs na morzu.
- Okres: liniowe skalowanie `(T - 2) / 5`, ograniczone do 0–1.
- Ekspozycja: `sqrt(max(0,cos(θ)))`, gdzie θ to kąt nadejścia względem normalnej.
  Fala pod kątem ≥85° jest poza przyjętym sektorem — ocena 0. To uproszczona
  ekspozycja, nie numeryczny fetch ani model cienia falowego.
- Wiatr: cisza / słaby <1,5 m/s; offshore gdy kąt ≥135°, onshore ≤45°,
  pomiędzy cross-shore. Słaby offshore jest korzystniejszy, silny jest karany.
- `score = 100 × ekspozycja × użyteczność_wysokości ×
  (0,55 × jakość_okresu + 0,45 × jakość_wiatru)`.
- Wiatr ≥12 m/s, porywy ≥17 m/s lub Hs na morzu ≥3 m ograniczają ocenę do 25.
- Końcowa ocena to mediana wyników modeli fal, z tym samym konsensusem wiatru.
  Nie uśredniamy Hs/okresów/kierunków przed transformacją — zachowujemy spójne
  trójki parametrów każdego modelu.

„Modele zbliżone” nie oznacza wysokiej trafności. Duża niepewność jest sygnalizowana
m.in. po 72 h, przy rozrzucie Hs >0,6 m, wiatru >4 m/s, ocen >25 pkt lub
rozbieżnych kierunkach wiatru. Brak drugiego modelu jest oznaczany oddzielnie.
To rozrzut deterministycznych prognoz, **nie przedział ufności**. ECMWF jest
w obu grupach, a modele mają wspólne źródła i błędy; nie są niezależnymi głosami.

### 5. Sekwencja „nawiało → wywiewka”

W Sobieszewie normalna wynosi w przybliżeniu 0°: N jest onshore, S offshore.
Na plaży skierowanej na E ten sam wiatr N/S jest boczny. Kierunki zawsze
porównujemy z konkretnym spotem, a nie z jedną regułą dla całego wybrzeża.

Detektor `detectCleanup` analizuje ostatnie 24 h przed daną godziną:

1. Szuka co najmniej **4 kolejnych godzin** wiatru ≥5 m/s, w sektorze ±60° od
   normalnej i ze składową do brzegu ≥4 m/s. To wskaźnik lokalnej fazy nawiania,
   nie obliczenie energii wiatru nad całym akwenem.
2. Wymaga ciągłych danych od tej fazy do ocenianej godziny. Brak danych nie
   oznacza ciszy. Przy braku takiej sekwencji i niepełnej historii wynik jest
   „niepełna historia”, a nie „nie było nawiania”.
3. Słaby offshore (sektor ±45° wokół kierunku od lądu, prędkość ≤7 m/s, znane
   porywy <12 m/s) albo cisza / słaby wiatr <1,5 m/s rozpoczynają zmianę fazy.
   Pierwsza godzina jest „świeżą zmianą”; dwie kolejne mogą utworzyć okno.
4. **Oba modele fal** muszą nadal pokazywać Hs ≥0,4 m i ≥35% swojego maksimum
   z fazy nawiania, okres ≥4 s i kierunek w sektorze ekspozycji plaży.
   Wcześniejsze maksimum musi wynosić ≥0,6 m. Parametry sprawdzamy osobno
   dla każdego modelu. Brak / sprzeczność jednego z nich oznacza niepewność.
5. Silny offshore albo porywy nie otrzymują etykiety dobrego okna. Hs ≥3 m
   nadal oznacza trudne warunki, także po zmianie kierunku wiatru.

Te progi są eksperymentalne i wymagają kalibracji, nie są uniwersalną fizyczną
stałą „wygładzenia po dwóch godzinach”. Fale mogą zaniknąć wcześniej lub
dochodzić z dalszej części Bałtyku bez lokalnego onshore. Model fal już uwzględnia
ewolucję wymuszenia — **nie generujemy dodatkowej wysokości z historii wiatru
ani nie dodajemy drugiej premii punktowej za offshore**. Detektor opisuje fazę,
umożliwia filtr „Tylko wywiewka po nawianiu” i rozstrzyga remis ocen okien.
Filtr wymaga trzech kolejnych dziennych godzin ze zgodnie potwierdzoną sekwencją.
Bez filtra ranking nadal uwzględnia dobre okna bez lokalnego nawiania.

## Architektura i utrzymanie

- GitHub Pages pozostaje statyczne. Przeglądarka pobiera dane wybranego spotu;
  zmiana plaży nie pobiera całego wybrzeża. Żadnych kluczy w kodzie.
- `surf-api.js`: timeout 18 s, deduplikacja równoległych zapytań, pamięć RAM
  i localStorage. Prognozy: TTL 30 min; przy awarii jawnie oznaczony cache do 6 h,
  starsze dane odrzucane. Przycisk odświeżenia ma minimalny odstęp 60 s.
- Widoczna zakładka próbuje aktualizacji co 30 min; ukryta nie odpytuje API.
  Profil dna: 30 dni dla pełnego wyniku, 10 min dla niepełnego. Zmiana geometrii
  spotu zmienia klucz pamięci. Profil nie wymaga pobierania co zmianę prognozy.
- Odpowiedź po zmianie spotu nie nadpisuje nowego wyboru; osobny licznik generacji.
- `surf-app.js`: nawigacja, stany braku danych, tabela, wykres, mapy i kamera ↔ spot.
- `surf-community.js`: źródłowe pozycje i streszczenia WestCoast; ładowane przed
  `surf-spots.js`. Cache prognoz ma nową przestrzeń `surf-v2`, aby wymusić pobranie
  historii wymaganej przez detektor.
- `surf.css`: osobny arkusz, spójny z wyglądem istniejącej strony.

### Testy

```sh
node --test tests/*.test.cjs
python3 -m http.server 8000
# Otwórz http://localhost:8000/#surf/wladyslawowo
```

Testy obejmują kierunki 359°/1°, przeciwne wiatry, brak danych vs zero,
dyspersję, limit załamania, energię na płaskim dnie, okna dzienne,
łączenie UTC, dopasowanie kamer, cache, awarie dostawców i punkty na lądzie.

20.10.2026: oba modele fal zwróciły dane dla wszystkich 43 punktów; EMODnet
potwierdził ujemną rzędną dna w każdym punkcie wejściowym 5 km od plaży.
To sprawdzenie dostępności i geometrii, **nie walidacja trafności**. W Chrome
sprawdzono rzeczywistą prognozę Władysławowa, profil dna, tabelę, układ mobilny,
przejście do kamery Nadmorski24 i z powrotem, zatrzymanie HLS, cache,
przełączanie warstw Windy i obsługę zablokowanego API.

W aktualizacji 0.2 oba modele fal zwróciły dane dla 30 pozycji z mapy oraz
Sobieszewa; EMODnet potwierdził morskie położenie ich punktów wejściowych.
24 testy automatyczne obejmują również N→S w Sobieszewie, plażę skierowaną na E,
brak historii, zanik fali, silny offshore, niezgodność modeli, brak podglądania
przyszłości oraz kompletność importu mapy. Chrome: 71 opcji spotów, pobieranie
historii, filtr wywiewki, Sobieszewo, opis PalikPoint, kamery „w okolicy” i mobile.

## Jak dojść do wiarygodnego modelu lokalnego

### Etap 1 — pomiary i ocena błędu (najważniejszy)

Zacząć od 3–5 spotów, np. Władysławowo, Dębki, Ustka, Kołobrzeg i Brzeźno.
Archiwizować **każde wydanie prognozy przed terminem jej ważności** oraz lokalne
raporty: czas UTC, pozycja, orientacyjna wysokość ściany fali, okres, jakość,
wiatr, obserwator / kamera. Nie utożsamiać wysokości ściany z Hs modelowym.

Podział trening/walidacja według dat i całych sztormów, nie losowych godzin.
Porównać MAE/RMSE i bias Hs (tam, gdzie jest porównywalny pomiar), błąd kołowy
kierunku, trafność dobrych okien; osobno 0–24, 24–48 i 48–120 h oraz sezony.
Najpierw prosta korekcja biasu i kalibracja wag, dopiero potem gradient boosting
lub model probabilistyczny. Archiwalne analizy nie zastępują archiwalnych prognoz
przy uczciwym backteście.

### Etap 2 — regionalne dane i backend

Dołączyć [Copernicus Baltic Sea Wave Analysis and Forecast](https://data.marine.copernicus.eu/product/BALTICSEA_ANALYSISFORECAST_WAV_003_010/description):
WAM cycle 4.7, siatka około 1 mili morskiej, produkt FMI. Dokumentacja deklaruje
brak asymilacji — nie należy przedstawiać tego produktu jako pomiaru satelitarnego.
To bardzo sensowny kandydat do porównania na Bałtyku, ale o przewadze ma zdecydować
walidacja lokalna, nie sama nazwa lub rozdzielczość.

Backend (np. Python + harmonogram + object storage) pobiera i archiwizuje dane,
udostępnia małe pliki JSON dla spotów, limituje zapytania i zapisuje `run_time`,
`valid_time`, model, siatkę, jednostki i status QC. Frontend nadal może być na
GitHub Pages. Windy Point Forecast API wymaga własnego planu / klucza; bez niego
korzystamy z oficjalnego embedu, a nie scrapowania aplikacji Windy.

### Etap 3 — satelity i obserwacje

Do walidacji można użyć produktów **Copernicus Marine WAVE_GLO_PHY_SWH_L3_NRT_014_001**
(altimetryczna wysokość znacząca, po weryfikacji aktualnego identyfikatora i zasad
dostępu), Sentinel-3 / Sentinel-6, boi oraz danych IMGW i instytutów regionalnych.
Trzeba filtrować flagi jakości, ląd, odległość od brzegu oraz dopasować pozycję
i czas do modelu. Brak przelotu to brak obserwacji, nie zgoda z prognozą.

Altimetria jest rzadka w czasie i przestrzeni i zwykle nie opisuje strefy
łamania. Sentinel-1 SAR może dostarczyć informacji o widmie w odpowiednich
warunkach, ale nie jest gotowym odczytem fal przy każdej polskiej plaży.
Optyczna batymetria Sentinel-2 bywa ograniczana przez mętność Bałtyku i chmury.
W v0.2 **nie ma asymilacji ani odczytu satelitów**; nie pokazujemy fikcyjnych pomiarów.

### Etap 4 — własny SWAN i lokalny downscaling

SWAN to oprogramowanie modelu spektralnego rozwijane na TU Delft, a nie
automatycznie dostępny feed prognozy wszystkich polskich plaż. Do własnego
uruchomienia potrzebne są widma na granicy domeny, wiatr, batymetria, poziom
morza i ewentualnie prądy. Wymaga to maszyny obliczeniowej poza GitHub Pages.

Zagnieżdżone domeny: Bałtyk → region → 50–150 m przy wybrzeżu, ewentualnie
drobniej przy wybranych spotach po pozyskaniu odpowiedniego dna. Siatka 20 m
z interpolowanego rastra 115 m nie tworzy nowych informacji o rewach.
Wprowadzić osłonę półwyspu i portów, kierunkową refrakcję, dyssypację, poziom
wody oraz lokalne pomiary batymetryczne. Porównywać wynik SWAN z prostym modelem
i obserwacjami; zwiększenie złożoności samo w sobie nie gwarantuje poprawy.

**Największy wzrost jakości da lokalna walidacja i aktualne dno, nie samo
zwiększanie liczby modeli w średniej.**
