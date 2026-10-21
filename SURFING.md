# Bałtyk Surf 1.2 — pełny profil 0–500 m przy spocie

Główny wykres jest teraz od razu widocznym **przekrojem od 0 do 500 m co 50 m**,
z wyborem godziny i liczbowymi wynikami pod wykresem. Wartość w punkcie np.
150 m jest tylko zaznaczeniem na krzywej. Węzły wodne pochodzą z nowej siatki
SWAN co 50 m; granica lądu i suche/płytkie komórki są wyraźnie odróżnione.
Wykres zmian w czasie dla punktu podsumowania jest osobną, rozwijaną sekcją.

**Aktualna prezentacja:** wartości podsumowania, wykres czasowy i ocena sesji
dotyczą punktu w strefie do 500 m od brzegu oszacowanego z DTM. Wysokość,
okres, kierunek, moc i energia pochodzą z tego samego wyniku SWAN. Dane offshore
służą tylko jako warunek wejściowy backendu; przeglądarka nie pobiera ich do
głównego widoku ani nie używa jako zastępstwa przy braku prognozy przy brzegu.
Zasady wyznaczania brzegu i granicy 500 m: [MODEL.md](MODEL.md).

**Aktualny silnik przybrzeżny: SWAN 41.51AB, niestacjonarny przekrój 1D.**
Konfiguracja, harmonogram, wejścia i sposób odtworzenia: [MODEL.md](MODEL.md).
Poniższe wzory liniowe pozostają narzędziami pomocniczymi do porównania danych;
główny kafelek przybrzeżny i ocena sesji korzystają z aktualnego wyniku SWAN.

## Co już działa

- Osobne zakładki **Kamery** i **Prognozy surfingowe**; wejście bezpośrednie:
  `/#surf/wladyslawowo`. Po przejściu do prognozy odtwarzacz kamery jest zatrzymywany.
- 71 spotów / odcinków w 43 miejscowościach, 70 bezpośrednio powiązanych kamer.
  Rejestr w `surf-spots.js`: współrzędne, normalna brzegu, region i jawne ID kamer.
- Pięć kolejnych dób, wartości godzinowe, porównanie modeli, trzy najlepsze
  niepokrywające się okna dzienne po trzy godziny dla wybranej plaży.
- Fale przy spocie: **SWAN, strefa 0–500 m**. Dane wejściowe backendu:
  DWD EWAM / ECMWF WAM. Wiatr: **DWD ICON + NOAA GFS + ECMWF IFS**.
- Raster dna **EMODnet WCS**, niestacjonarny model SWAN z rzeczywistym wymuszeniem
  wiatrowym w trzech punktach przekroju, transportem widma, tarciem i załamywaniem.
- Osadzana mapa **fal Windy**, ładowana automatycznie po otwarciu prognozy; link do Windy
  i lokalizacji na OpenStreetMap. Dane z iframe nie są wejściem modelu.
- Osobna **mapa wyboru spotów** (Leaflet + OpenStreetMap): znaczniki otwierają
  prognozę, grupy rozwijają się przy zbliżeniu, wybór i filtr regionu są
  synchronizowane z listą. Pokazujemy także spoty bez kamery.
- Brak danych nie jest zerem. Awaria wiatru nie usuwa prognozy fal, ale wyłącza
  ocenę. Niepełny profil dna wyłącza transformację, a nie całą prognozę.
- Wykrywanie sekwencji onshore → słaby offshore / cisza przy utrzymującej się
  fali. Historia poprzednich 24 h jest analizowana także dla pierwszej godziny
  prognozy; API pobiera dodatkowo dwa poprzednie dni modelowe.
- 30 opisów społecznościowej mapy WestCoast i dodatkowo Sobieszewo. 28 spotów
  nie ma kamery konkretnego peaku; kamery sąsiednich plaż są oznaczone jako pobliskie.

To działający model lokalny oparty o uruchomiony solver **SWAN**, ale nie
zwalidowany odpowiednik LOTUS. Nie znamy jeszcze jego błędu względem obserwacji.
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

## Źródła danych

| Dane | Źródło / dostęp | Zastosowanie |
| --- | --- | --- |
| Hs, średni okres, kierunek fal | [Open-Meteo Marine](https://open-meteo.com/en/docs/marine-weather-api), jawne modele `dwd_ewam,ecmwf_wam` | Dwie równoległe prognozy, bez udawania niezależnych obserwacji |
| Wiatr 10 m, porywy, temperatura, dzień/noc | [Open-Meteo Weather](https://open-meteo.com/en/docs), `icon_seamless,gfs_seamless,ecmwf_ifs025` | Konsensus wiatru i wybór okien dziennych |
| Głębokość | [EMODnet Bathymetry WMS](https://ows.emodnet-bathymetry.eu/wms?service=WMS&request=GetCapabilities), warstwa `emodnet:mean`, `GetFeatureInfo` | Sześć próbek profilu poprzecznego do brzegu |
| Dno SWAN | EMODnet WCS `emodnet:mean`, GeoTIFF 1/16 minuty | Pełny przekrój próbkowany co 100 m, a nie tylko sześć punktów |
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

### 4. Wynik surfingowy 0–10

To jawna heurystyka dla średniozaawansowanego surfera na desce do bałtyckich fal,
nie model nauczony na danych. Progi wymagają kalibracji na raportach z sesji.

- Wysokość Hs z SWAN w punkcie do 500 m: interpolacja punktów
  `0,2→0; 0,4→0,25; 0,6→0,55; 0,8→0,8; 1–1,5→1; 1,8→0,85;
  2,2→0,65; 3→0,2; 4→0`. Większa fala nie zawsze lepiej pasuje do profilu.
- Średni okres z SWAN (nie okres szczytowy): interpolacja
  `3 s→0,1; 4→0,35; 5→0,6; 6→0,8; ≥7→1`.
- Ekspozycja: θ to kąt nadejścia względem lokalnej normalnej.
  Fala pod kątem ≥85° jest poza przyjętym sektorem — ocena 0. To uproszczona
  ekspozycja, nie numeryczny fetch ani model cienia falowego.
- Wiatr: cisza / słaby <1,5 m/s; kąt od normalnej 0–22,5°: onshore,
  do 67,5°: cross-on, do 112,5°: cross, poniżej 157,5°: cross-off,
  pozostałe: offshore. Pod komórkami pokazujemy osobno taką relację względem
  kierunku fali. Słaby offshore jest korzystniejszy, silny jest karany.
- `potencjał = jakość_wysokości × (0,55 + 0,45 × jakość_okresu)`.
- `score = 10 × potencjał × (0,45 + 0,35 × jakość_wiatru + 0,20 × uporządkowanie)`.
  Energia i moc nie są ponownie punktowane. Nie ma limitu dla fal poniżej 1 m.
- Wiatr jest interpolowany po kącie (0/45/90/135/180°) i prędkości.
  Przy ≤2 m/s jakość wynosi 0,95; przy 5 m/s odpowiednio
  `0,35/0,45/0,60/0,85/1`; przy 8: `0,1/0,2/0,3/0,55/0,65`;
  przy 12: `0/0,05/0,1/0,2/0,25`; przy ≥17: 0.
  Porywy przekraczające średnią o ponad 3 m/s stopniowo obniżają ten składnik.
- Uporządkowanie to proxy ze stabilności wysokości, okresu i kierunku w trzech
  kolejnych godzinach kończących się ocenianą godziną: `0,3 + 0,4 × stabilność`.
  Potwierdzona wywiewka dodaje 0,25 tylko tutaj; nawianie lub świeża zmiana
  odejmują 0,2. Brak historii daje neutralne 0,5 i niższą pewność.
- Okres poniżej 3,5 s ogranicza ocenę do 3.
- Wiatr ≥12 m/s, porywy ≥17 m/s lub Hs w punkcie prognozy ≥3 m ograniczają ocenę do 2.
- Wynik ma jedno miejsce po przecinku. Pełne dzienne okna trzygodzinne:
  `0,7 × średnia ocen + 0,3 × najniższa ocena`. Brak danych nie oznacza zera.
- Rekomendacje: <3 odpuść specjalny wyjazd; 3–4,9 tylko blisko;
  5–6,4 rozważ sesję; 6,5–7,9 warto jechać; 8–8,9 bardzo dobre; ≥9 wyjątkowe.
- Pewność jest oddzielna od wyniku: uwzględnia historię, zgodność i liczbę modeli
  wiatru, horyzont >72 h, wiek danych >12 h, zastępczy wiatr oraz reprezentatywność
  punktu (głębokość poza 1–4 m lub odległość >300 m). Przy tych ograniczeniach
  jest niska, w pozostałych przypadkach średnia. Pojedyncza symulacja fal
  i przybliżone dno nie uzasadniają etykiety wysokiej pewności.
- Mapa satelitarna przy wietrze ma kołową skalę 0–360° zakotwiczoną na brzegu
  modelu (awaryjnie punkcie spotu). Biała strzałka na obwodzie wskazuje ruch
  powietrza ku środkowi, żółty wycinek wskazuje meteorologiczny kierunek „skąd”.
  Wskaźnik odpowiada wybranej godzinie; znika przy ciszy lub braku kierunku.
  Niebieskie animowane grzbiety pokazują osobno kierunek propagacji fal SWAN
  (przeciwny do kierunku „skąd”), prostopadle do grzbietów. Ich tempo i rozstaw
  są schematyczne. Brak kierunku lub praktycznie zerowa fala wyłącza animację;
  preferencja ograniczonego ruchu pozostawia nieruchome grzbiety i opis liczbowy.
  Podkład Esri World Imagery, awaryjnie OSM, nie jest bieżącym obrazem fal
  ani obliczeniem lokalnej osłony terenu. Północ pozostaje u góry mapy.
- Końcowa ocena widoczna na stronie wykorzystuje spójny zestaw wysokości,
  okresu i kierunku z przybrzeżnego SWAN oraz aktualny konsensus wiatru.
  Brak przybrzeżnego wyniku oznacza brak oceny, nie zastępczą średnią offshore.

„Modele zbliżone” nie oznacza wysokiej trafności. Duża niepewność jest sygnalizowana
m.in. po 72 h, przy rozrzucie Hs >0,6 m, wiatru >4 m/s, ocen >2,5 pkt lub
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
3. Słaby offshore lub bardziej odbrzegowy cross-off (sektor ±45° wokół kierunku od lądu, prędkość ≤7 m/s, znane
   porywy <12 m/s) albo cisza / słaby wiatr <1,5 m/s rozpoczynają zmianę fazy.
   Pierwsza godzina jest „świeżą zmianą”; dwie kolejne mogą utworzyć okno.
4. **Przybrzeżny SWAN** musi nadal pokazywać Hs ≥0,4 m i ≥35% swojego maksimum
   z fazy nawiania, okres ≥4 s i kierunek w sektorze ekspozycji plaży.
   Wcześniejsze maksimum musi wynosić ≥0,6 m. Brak historii SWAN w tej strefie
   nie jest uzupełniany wartościami offshore i nie pozwala potwierdzić wywiewki.
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

### 6. Energia i moc fal — obliczenia pomocnicze i wynik przy spocie

Na stronie energia jest obliczana z wysokości przy spocie, a moc pochodzi
z transportu widma SWAN w tym samym punkcie do 500 m od brzegu. Poniższe
wzory dla danych regionalnych pozostają pomocniczymi funkcjami i testami;
nie są prezentowane zamiast przybrzeżnego wyniku.

Funkcja `waveEnergy` oblicza niezależnie dla każdej prognozy fal:

- Średnią energię fal nieregularnych na powierzchnię: `E = ρ g Hs² / 16`,
  przeliczoną z J/m² na **kJ/m²**. Przyjęto referencyjne `ρ = 1025 kg/m³`
  i `g = 9,81 m/s²`. Gęstość nie jest pomiarem lokalnego zasolenia Bałtyku;
  w słonawym Bałtyku może być mniejsza, co jest dodatkowym błędem przybliżenia.
- Przybliżony strumień energii: `P ≈ E Cg`, w **kW/m** szerokości grzbietu.
  Jeśli jest poprawna próbka EMODnet 5000 m od punktu spotu, prędkość grupową
  liczymy z dyspersji dla tej głębokości. Nie potrzeba pełnego profilu przybrzeżnego.
- Bez głębokości stosujemy jawnie opisane przybliżenie głębokiej wody:
  `Cg = g T / (4π)`, czyli `P ≈ 0,491 Hs² T` kW/m.

`T` to obecnie **średni okres z API**, nie okres energetyczny `Te` ani okres
szczytowy `Tp`. Dla głębokiej wody dokładniejsza relacja wykorzystuje `Te`;
przy skończonej głębokości potrzebna byłaby całka po widmie z `Cg(f,h)`.
Obecny wynik jest wskaźnikiem przybliżonym i tak jest opisany w UI.
Podstawa: [energia i strumień energii fal](https://en.wikipedia.org/wiki/Wave_power#Energy_and_energy_flux)
oraz teoria fal liniowych. Dla Hs=1 m, T=5 s: E≈0,63 kJ/m² i P≈2,45 kW/m
w przybliżeniu głębokiej wody.

Wyświetlamy medianę **obliczonych wartości modeli**, nie energię wyliczoną
z mediany wysokości (podnoszenie do kwadratu nie jest operacją liniową).
Brak okresu pozostawia energię, ale wyłącza moc dla niezerowych fal. Brak
wysokości oznacza brak obu wartości, nie zero. Liczba modeli jest podana
na kafelkach. Wartości mogą się pojawić również przy braku danych wiatru.

To energia i moc **na morzu**, bez projekcji na normalną brzegu. Nie są
siłą uderzenia łamiącej się fali, energią jednej fali w kJ ani miarą jakości
surfingu. Nie można ich bezpośrednio porównywać z nieopisanymi wskaźnikami
„kJ” innych serwisów. Nie dodajemy ich ponownie do punktacji, która już
uwzględnia wysokość i okres fal. Jednostki i objaśnienia są widoczne na stronie.

## Architektura i utrzymanie

- GitHub Pages udostępnia statyczny frontend i JSON z backendu GitHub Actions.
  Harmonogram backendu jest opisany w `MODEL.md`. Przeglądarka pobiera dane wybranego spotu;
  zmiana plaży nie pobiera całego wybrzeża. Żadnych kluczy w kodzie.
- `surf-api.js`: główny widok pobiera pakiet SWAN oraz wiatr, bez zapytania
  do Marine API dla odległego punktu. Timeout 18 s, deduplikacja równoległych zapytań, pamięć RAM
  i localStorage. Prognozy: TTL 30 min; przy awarii jawnie oznaczony cache do 6 h,
  starsze dane odrzucane. Ponowne „Pokaż prognozę” dla tego samego spotu może
  odświeżyć dane, z minimalnym odstępem 60 s dla zapytań prognoz.
- Widoczna zakładka próbuje aktualizacji co 30 min; ukryta nie odpytuje API.
  Profil dna: 30 dni dla pełnego wyniku, 10 min dla niepełnego. Zmiana geometrii
  spotu zmienia klucz pamięci. Profil nie wymaga pobierania co zmianę prognozy.
- Odpowiedź po zmianie spotu nie nadpisuje nowego wyboru; osobny licznik generacji.
- `surf-app.js`: nawigacja, stany braku danych, tabela, wykres, mapy i kamera ↔ spot.
  Formularz działa w kolejności wyszukiwarka → plaża → „Pokaż prognozę”; wybór
  podpowiedzi nie przełącza samoczynnie wyświetlanej prognozy. Mapa spotów wybiera punkt
  bezpośrednio. Windy startuje na warstwie fal i zachowuje działający iframe przy
  odświeżaniu tej samej lokalizacji oraz przełączaniu zakładek strony.
- `surf-search.js`: lokalne wyszukiwanie w katalogu (bez wysyłania wpisywanego
  tekstu do geokodera), normalizacja polskich znaków, dopasowanie słów oraz
  odległość edycyjna z przestawieniami liter. Najlepsza wiarygodna podpowiedź
  ustawia listę, ale prognozę otwiera przycisk. Przy słabym dopasowaniu trzeba
  świadomie wybrać jedną z podobnych nazw; nie tworzymy nieistniejących spotów.
  Lista używa grup miejscowości: pozycja grupy to długość geograficzna jej
  najbardziej zachodniego spotu. W każdej grupie spoty także idą z zachodu na wschód.
  Dzięki temu wszystkie pozycje Kołobrzegu są razem, także gdy zakresy długości
  geograficznych różnych miejscowości częściowo się pokrywają.
- `surf-map.js`: interaktywna mapa wyboru z Leaflet 1.9.4 i MarkerCluster 1.5.3
  (wersje CDN przypięte, kontrola integralności SRI). Podkład © OpenStreetMap
  contributors, ODbL, standardowe kafle OSM. Mapa inicjalizuje się dopiero
  w zakładce prognoz, a kliknięcie pobiera prognozę tylko wybranego spotu.
  Przy awarii biblioteki mapy wybór z listy nadal działa. Mapa spotów jest
  niezależna od iframe Windy; nie dodaje nowych danych do obliczeń prognozy.
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
Mapa wyboru: sprawdzono 71 punktów, widoczny podkład i atrybucję, wybór
lista → mapa i znacznik → prognoza, rozwijanie gęstych grup w Kołobrzegu,
filtr regionu także bez zmiany wybranego spotu, powrót z zakładki kamer,
zmianę rozmiaru na telefonie i działanie listy przy niedostępności CDN mapy.

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
W v1.0 **nie ma asymilacji ani odczytu satelitów**; nie pokazujemy fikcyjnych pomiarów.

### Etap 4 — rozbudowa działającego SWAN 1D do domen 2D

SWAN 1D już działa w backendzie. Poniższe punkty opisują kolejną warstwę:
pełne domeny 2D, osłonę konstrukcji i lepsze warunki brzegowe, a nie wymagania
do uruchomienia obecnej wersji.

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
