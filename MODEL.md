# BS-SWAN 1.3 — punkt prognozy od strony morza i pełny przekrój 0–500 m

**Główny wykres pokazuje cały przekrój 0–500 m co 50 m**, z wyborem godziny.
Podsumowanie i ocena sesji dotyczą oznaczonego punktu w tej strefie, a dodatkowy
wykres czasowy jest schowany w rozwijanej sekcji. Parametry na zewnętrznej
granicy modelu są danymi wejściowymi i nie zastępują wyniku przy plaży.

## Co jest liczone

Backend uruchamia **SWAN 41.51AB**, oficjalny solver TU Delft, w trybie
**niestacjonarnym 1D**. Nie jest to przemianowana heurystyka JS. Własną częścią
systemu są dobór domen, batymetria, konsensus wiatru, przygotowanie granicy,
automatyzacja, kontrola kompletności oraz interpretacja dla surferów.

Obliczenia obejmują transport działania fal w przestrzeni, częstotliwości
i kierunku, dopływ energii od wiatru, whitecapping, tarcie denne, interakcje
czwórkowe i triady oraz głębokościowe załamywanie. Nie mierzymy fali kamerą.

### Domena i widmo

- Granica morska: 5 km w kierunku normalnym od punktu spotu.
- Pobierany raster sięga do 1 km za punkt spotu w stronę lądu, żeby rozpoznać
  przejście ląd–woda. Domena obliczeniowa kończy się na oszacowanej linii brzegu.
- Raster EMODnet DTM jest pobierany przez WCS jako GeoTIFF w natywnej rozdzielczości
  około 1/16 minuty. Próbkowanie rastra co 100 m i liniowe przeniesienie głębokości
  na siatkę obliczeniową SWAN co 50 m. Nie tworzy to pomiarów dna ani rew co 50 m.
- Do obliczeń wchodzi tylko ciągła morska część profilu połączona z granicą.
  Nie ekstrapolujemy brakujących głębokości. Jeśli nie ma rozpoznanej strefy
  płytszej niż 4 m, wynik jest niedostępny zamiast fikcyjnej prognozy surfbreaku.
- 36 kierunków (co 10°), 32 częstotliwości logarytmicznych 0,05–1 Hz.
- Niestacjonarny krok 10 minut, schemat BSBT; 12 godzin rozbiegu modelu,
  następnie 24 godziny historii i do 336 godzin (14 dni) prognozy. Symulacja zaczyna się
  36 godzin przed bieżącą godziną, żeby także historia miała pełny rozbieg.
- Koniec prognozy wyznaczają rzeczywiste dane wejściowe, nie ich dopełnienie pustymi
  wartościami: Open-Meteo zwraca 16 dni, ale DWD EWAM kończy się po ok. 3 dniach,
  regionalny DMI HARMONIE po ok. 2,3, ICON i UKMO po ok. 7, GEM po ok. 9,5, JMA po ok. 11, a ECMWF WAM, ECMWF IFS i ECMWF AIFS
  po ok. 14,5. Brzeg fali wyznacza najdłuższy kompletny model fal (w praktyce ECMWF WAM),
  a wiatr wymaga co najmniej dwóch modeli; po 11. dniu konsensus tworzą GFS, ECMWF IFS
  i ECMWF AIFS. Godziny po 7. dniu są oznaczone w tabeli jako orientacyjne, a ich pewność
  jako niska.
- SWAN przyjmuje najwyżej 300 poleceń COMPUTE w jednym uruchomieniu, a wymuszenie
  zmienia się co godzinę. Dłuższy okres liczymy w częściach po 240 godzin połączonych
  binarnym plikiem stanu (HOTFILE / INIT HOTSTART). Pierwsza godzina kolejnej części
  pochodzi z poprzedniej, bo przy wznowieniu granica nie ma jeszcze nałożonego
  wymuszenia. Test integracyjny porównuje wynik dzielony z ciągłym — są identyczne.
- Pełny przekrój 0–500 m (`profile`) publikujemy dla całego okresu prognozy
  (`profileHours`). Kopia offline w pamięci przeglądarki zachowuje go tylko
  dla pierwszych 120 godzin, bo `localStorage` mieści niewiele pełnych plików.

### Granica od morza

Pełny, ciągły przebieg **DWD EWAM** jest wybierany jako warunek graniczny.
Jeśli nie ma kompletu, używany jest ECMWF WAM. Nie mieszamy wysokości z jednego
modelu z okresem drugiego. Wysokość, średni okres i kierunek są przekształcane
przez SWAN w widmo JONSWAP (`gamma=3.3`, średni okres `MEAN`, rozrzut 30°).
To **zrekonstruowane widmo**, nie pełne widmo pobrane z modelu regionalnego.
SWAN wpuszcza tylko składowe nadchodzące do domeny.

### Wiatr BS Wind 8

- Osiem modeli przez Open-Meteo: siedem globalnych — DWD ICON, NOAA GFS, ECMWF IFS,
  ECMWF AIFS (model uczenia maszynowego), UK Met Office, JMA i ECCC GEM — oraz regionalny
  DMI HARMONIE AROME z siatką ok. 2 km, który przez pierwsze ok. 2,3 doby lepiej oddaje
  wiatr przy samym brzegu (jest jednym z głosów konsensusu, nie ma większej wagi) — w trzech lokalizacjach:
  punkt spotu, 2,5 km oraz 5 km w morze. Wybierana jest najbliższa komórka modelu,
  a nie wymuszona komórka lądowa. ICON i UKMO sięgają ok. 7 dni, GEM ok. 9,5, JMA ok. 11,
  a GFS, ECMWF IFS i AIFS cały horyzont 14 dni; w drugim tygodniu przy sprzecznych
  kierunkach rozstrzyga więc większość trzech modeli zamiast dwóch.
- Pobieramy prędkość, kierunek i porywy wiatru oraz porę dnia; temperatura nie jest używana.
  AIFS i JMA nie podają porywów — ich mediana pochodzi z pozostałych modeli.
- Ten sam algorytm co w tabeli: mediana prędkości i kierunek z uśrednionych
  wektorów. Co najmniej dwa dostępne modele są wymagane. Rozrzut prędkości do oceny
  pewności liczymy bez skrajnego modelu z każdej strony, gdy modeli jest co najmniej pięć.
- **Wektory wiatru są rzeczywistym wejściem SWAN** (`READINP WIND`), aktualizowanym
  co godzinę symulacji i interpolowanym przestrzennie między punktami. Przy
  wydłużeniu profilu w stronę lądu przytrzymujemy ostatni wiatr przybrzeżny.
- Jeśli kierunki są sprzeczne (zgodność wektorów <0,3), do solvera trafia
  oznaczony model zastępczy (pierwszy dostępny, preferowany ICON), zamiast fałszywej
  ciszy. Tabela nadal pokazuje niepewny kierunek konsensusu; opis SWAN wskazuje
  użyty wiatr i informację o zastępstwie.
- Ocena takiej godziny nie jest pomijana: liczymy ją osobno dla wiatru z każdego modelu
  (przy tej samej fali z SWAN) i pokazujemy medianę tych ocen z niską pewnością. Uśrednianie
  sprzecznych kierunków nie ma sensu, uśrednienie skutków — tak.
- Open-Meteo liczy osobno każdy punkt zapytania, a więcej niż 10 zmiennych lub 14 dni
  jako kilka zapytań (osiem modeli × 4 zmienne × 18 dni ≈ 4,1 na punkt). Pakiety
  są więc wysyłane w odstępach, do ok. 400 na minutę, poniżej darmowego limitu 600.
  Wszystkie pakiety jednego pobrania idą jednym połączeniem: na serwerach GitHuba nowe
  połączenie TLS z Open-Meteo potrafi zawisnąć na 15 s, więc ponowne użycie otwartego
  skraca pobieranie wiatru z ok. 9 do ok. 3–4 minut.
- BS Wind 8 jest naszym połączeniem danych, **nie wiatrem GTF** innego serwisu.

Model lokalny nie oblicza od zera całego Bałtyku. Fala wchodząca do domeny niesie
historię generacji z regionalnego modelu; własny wiatr wpływa na jej dalszą
ewolucję i generuje lokalne składowe na ostatnich kilometrach.

### Procesy i parametry

`GEN3 KOMEN`, `BREAKING CONSTANT 1.0 0.73`, `FRICTION JONSWAP 0.038`, `TRIAD`.
Głębokości względem LAT, poziom wody 0 w tym układzie. Brak prądów, lodu,
osłony i dyfrakcji wokół falochronów oraz zmian poziomu morza. Przekrój 1D
zakłada niezmienność wzdłuż brzegu; nie jest domeną portową 2D. Parametry nie
były dostrajane do lokalnych pomiarów. Nie deklarujemy niezmierzonej trafności.

## Wyniki dla surferów

- Wysokość znacząca, okres średni, okres energetyczny, kierunek i moc pochodzą
  z **jednego, stałego w czasie węzła SWAN**, wybranego z głębokości dna.
  Od zewnętrznej krawędzi potwierdzonej strefy do 500 m idziemy w stronę lądu
  do pierwszego węzła o głębokości ≤2 m, włącznie. Tylko na tym morskim odcinku
  wybieramy punkt z zakresu 0,3–4 m najbliższy głębokości 2 m; remis rozstrzygamy
  na korzyść punktu bardziej morskiego. Nie przeskakujemy pierwszego wypłycenia
  w poszukiwaniu kolejnej głębokości 2 m w zagłębieniu za rewą.
  Gdy cały odcinek jest głębszy niż 2 m, bierzemy najbliższą dopuszczalną
  głębokość w limicie. Gdy już zewnętrzny węzeł jest płytszy niż 2 m, wybieramy
  ten węzeł, o ile ma co najmniej 0,3 m. Brak dopuszczalnego punktu oznacza
  niedostępny wynik. Limit uwzględnia także niepewność położenia brzegu.
- To definicja punktu odniesienia dla porównania spotów, **nie wybór najwyższej
  fali ani najlepszej oceny**. Nie zmieniamy współczynników fizyki SWAN,
  obliczonych widm, współrzędnych spotów ani skali ocen. Spokojna woda w wybranym
  punkcie pozostaje spokojna; błędny wynik nie przenosi punktu do innej komórki.
  Cały profil nadal pokazuje tłumienie za rewą. Pierwsza izobata 2 m nie zawsze
  jest miejscem surfowania; rozdzielczość dna i poziom LAT nadal ograniczają model.
- Pierwsze od morza miejsce w tej strefie, gdzie SWAN przewiduje `QB >= 0.1`
  (co najmniej 10% fal załamujących się), z wysokością, głębokością i odległością.
  Brak takiego punktu oznacza brak rozpoznanego załamania, nie arbitralnie wyznaczony break.
- Profil ma dokładnie 11 punktów: 0, 50, …, 500 m od przyjętej linii brzegu.
  Siatka solvera jest wyrównana do tej linii, więc 500 m jest rzeczywistym węzłem
  SWAN, a nie ekstrapolacją ostatniej wartości z 450 m. Wybór godziny działa
  bezpośrednio nad wykresem i przez kliknięcie przedziału w tabeli.
- Punkt 0 m to sucha granica modelu z zerem energii, oznaczona `land-boundary`,
  **nie pomiar ani rozwiązanie napływu fali na piasek**. Jeśli SWAN wyłącza
  dalszą komórkę o głębokości do 0,05 m, pokazujemy `dry-model-node` (płytko/sucho),
  odróżnione od obliczonych mokrych węzłów `swan-node`. Błędnego lub brakującego
  wyniku w mokrej komórce nie zamieniamy na zero. Szare, przerywane odcinki wykresu
  odróżniają granicę/suche komórki od zielonej krzywej obliczonych fal.
- Moc przy brzegu pochodzi z wektora spektralnego transportu energii `TRANSP`
  przy `INRHOG=1` (W/m → kW/m); nie jest tylko wzorem głębokiej wody z okresem średnim.
- Świeży wynik SWAN zastępuje podstawę oceny sesji; nie jest drugi raz
  transformowany prostym wzorem shoalingu. Najnowszy wiatr może już pochodzić
  z późniejszego pobrania niż wiatr użyty w symulacji — obie daty są widoczne.
- Ranking wybiera tylko okna z poprawnym wynikiem SWAN w strefie 0–500 m.
  Przy braku symulacji nie wystawiamy oceny ani nie podstawiamy wysokości
  z dalszego morza. Starsze niż 18 h wyniki nie są
  używane do oceny, nawet jeśli ich horyzont nadal obejmuje dany termin.

Wiatr ma pięć klas: onshore, cross-on, cross, cross-off i offshore. Pod komórkami
fal odnosimy go do kierunku nadchodzącej fali SWAN przy spocie;
osobna kolumna odnosi wiatr do normalnej plaży. Dlatego
te dwie informacje mogą się różnić przy ukośnie nadchodzących falach.

### Jak wyznaczamy brzeg i egzekwujemy limit 500 m

Punkt z katalogu nie jest automatycznie linią brzegu: może leżeć na wydmie,
na lądzie lub na wodzie. Na przekroju EMODnet identyfikujemy ciągłą część morską
połączoną z granicą modelu. Brzeg modelowy jest pomiędzy ostatnią komórką
o nieujemnej rzędnej a pierwszą ujemną komórką morską. Brak takiego przecięcia
lub brak rzędnej nie pozwala potwierdzić odległości i wyłącza publikację wyniku.

Przy kroku 100 m przedział położenia brzegu ma szerokość do 100 m. W JSON
zapisujemy jego końce, środek, współrzędne oraz dla każdego punktu wyniku:
`shoreDistance`, `shoreDistanceMin`, `shoreDistanceMax`. **Nawet maksymalna
odległość głównego punktu podsumowania względem rozpoznanego przedziału nie może
przekraczać 500 m.** Pełny profil i położenie załamania obejmują nominalne
0–500 m względem środka przedziału brzegu. Zatem węzeł 500 m ma niepewność
położenia brzegu (np. przedział 450–550 m), a nie geodezyjną gwarancję położenia.
Frontend sprawdza odległości i kompletność 11 punktów niezależnie od backendu.

To odległość względem **brzegu szacowanego z mapy dna przy LAT**, nie obietnica
dokładności geodezyjnej względem bieżącej linii wody. Błąd DTM, aktualny poziom
morza i zmiany plaży pozostają ograniczeniem. Na stronie odległości są oznaczone
jako przybliżone. W przykładzie punktu katalogowego leżącego 750 m w głębi lądu
wynik 900 m od tego punktu może być 150 m od brzegu — nie odrzucamy ani nie
zatwierdzamy go wyłącznie na podstawie odległości od pinezki.

Wyniki mają schemat JSON **2**, `maxShoreDistanceM: 500`, a pełny profil jest
oznaczony `profileGridM: 50` i `profileReference: estimated-shoreline`.
Niepełny profil nie jest sztucznie przedłużany na wykresie. Publikacja wymaga zgodnej
wersji pakietu danych, dzięki czemu awaryjne przywrócenie starego artefaktu
nie podmieni nowych wyników na dawne wartości z innego zakresu przestrzennego.
Frontend przyjmuje wyłącznie `BS-SWAN-1.3-seaward2m`. Cache prognoz oraz historia
ocen tabeli porównawczej są rozdzielone według wersji metody i geometrii.
Heat mapa nie przechowuje historii — pokazuje godziny od bieżącej do końca prognozy.
Stare oceny nie są domieszane do poprawionych wyników; archiwalny kolor pojawi się
tylko dla godzin dostępnych w zgodnych obliczeniach lub zapisanej historii tej wersji.
Udostępniamy 24 godziny historii modelowej po zakończeniu pełnego rozbiegu.
Wynik zawiera `historyHours: 24`, 24 próbki w `history` oraz osobne `hourly`
z bieżącą godziną i prognozą. Tabela, przekrój i wykres czasowy domyślnie obejmują
ostatnie 24 godziny liczone od początku bieżącej godziny oraz przyszłość.
Historia jest wcześniejszym wynikiem modelowym, nie pomiarem.

## Backend i publikacja

Workflow `.github/workflows/forecast-pages.yml`:

1. Uruchamia się po zmianie kodu, ręcznie lub o minucie 17 co 3 godziny (UTC).
2. Pobiera nowe dane wiatrowe dla wszystkich spotów i publikuje `data/wind/ID.json`.
3. Uruchamia SWAN, jeśli zmienił się cykl 00/12 UTC, kod modelu, geometria,
   brakuje dostatecznego horyzontu albo ręcznie wybrano `force`.
4. Publikuje `data/nearshore/ID.json` i `data/status.json`, a potem cały frontend
   przez artefakt GitHub Pages. Wyniki nie trafiają jako automatyczne commity do Git.
   `model/build_site.py` składa też `data/coast.json`: wiatr i fale wszystkich spotów w jednym
   pliku, bez przekrojów 0–500 m. Czytają go „Pokaż najlepsze” i heat mapa zamiast dwóch plików na spot;
   lokalny podgląd (`scripts/dev-server.cjs`) buduje go z tych samych danych spotów
   (`scripts/coast-bundle.cjs`) i, jak GitHub Pages, wysyła dane skompresowane gzipem.
5. Zachowuje batymetrię i wyniki w cache. Wejścia i logi solvera są artefaktem
   `swan-inputs-and-logs-RUN_ID`, przechowywanym przez 14 dni.

Harmonogram GitHub Actions jest **best effort**, nie gwarancją startu dokładnie
co trzy godziny. W publicznych repozytoriach GitHub może wyłączać harmonogram
po długim okresie bez aktywności; stan widać w Actions oraz w datach na stronie.
Odświeżenie w przeglądarce tylko pobiera ostatni wynik; nie uruchamia obliczeń.

Jeśli serwer prognoz jest niedostępny, SWAN może przeliczyć nową siatkę na
rzeczywistych danych wejściowych z archiwum, pod warunkiem zgodności geometrii
i wieku źródeł do 6 h. Zachowujemy oryginalne `windFetchedAt` / `boundaryFetchedAt`
i oznaczamy `reusedInputs`. Nie ekstrapolujemy danych poza dostępny horyzont;
w takim przypadku liczba godzin może być mniejsza. Brak zgodnego archiwum
oznacza brak nowego wyniku, a nie sztuczny wiatr czy falę.

Przy błędzie zestawienia połączenia do Open-Meteo backend może odświeżyć rekord A
przez publiczny DNS-over-HTTPS. Adres URL, nazwa hosta TLS i sprawdzanie certyfikatu
pozostają niezmienione. Nie stosuje tego przy ograniczeniu liczby zapytań (HTTP 429)
ani błędach autoryzacji; zmiana dotyczy tylko procesu pobierającego prognozy.

Jeśli odświeżenie prognoz zawiedzie, publikacja interfejsu może użyć katalogu
`data/` z ostatniego udanego artefaktu Pages. Zachowuje wszystkie oryginalne
daty pobrania i obliczeń, więc limity wieku danych w interfejsie nadal działają.
`data/status.json` oznacza wtedy `lastRefreshFailed`. Stary kod strony nie jest
przywracany. Brak poprawnego poprzedniego pakietu lub błąd testów zatrzymuje publikację.

## Odtworzenie lokalnie

Podgląd przez `nix-shell --run 'node scripts/dev-server.cjs'` automatycznie uruchamia
ten sam solver, gdy opublikowanych fal brakuje lub najstarsze dane mają co najmniej
12 godzin. Wyniki lokalne są zapisywane w `.dev-preview/swan-data/`, z oryginalnymi
czasami rzeczywistego pobrania wejść i zakończenia obliczeń. Nie wydłuża to limitu
18 godzin w walidatorze. NixOS wymaga ustawienia interpretera ELF i ścieżek bibliotek
w pobranym pliku wykonywalnym; `shell.nix` i `configure_engine` robią to przez
`patchelf`, po sprawdzeniu SHA256 oficjalnego archiwum, bez zmiany kodu solvera.
Podgląd przechowuje cache i archiwa w `.dev-preview/swan-cache/`; nie uruchamia publikacji Pages.

Linux amd64, Node.js, Python 3.10+ i biblioteki systemowe libgfortran5/libgomp1:

```sh
python3 -m venv .venv
.venv/bin/pip install -r model/requirements.txt
.venv/bin/python model/nearshore.py --spots wladyslawowo,sobieszewo --workers 2 --force
.venv/bin/python model/build_site.py
python3 -m http.server 8000 --directory dist
```

Bez `--spots` liczone są wszystkie spoty. `--hours 6` służy wyłącznie do krótkich
testów; domyślnie i w publicznym workflow liczone jest 336 h (14 dni). Numeryczna geometria i wszystkie dane
wejściowe są w archiwach. `inputHash`, hash rastra, SHA256 paczki solvera i SHA
commitu umożliwiają sprawdzenie pochodzenia wyniku. Niedokończony plik wyjściowy,
błąd solvera, niepełny wiatr lub granica nie są publikowane jako nowa prognoza.

```sh
node --test tests/*.test.cjs
SWAN_INTEGRATION=1 .venv/bin/python -m unittest discover -s model -p 'test_*.py' -v
```

Test integracyjny naprawdę wykonuje SWAN dwa razy: przy tym samym dnie i fali
granicznej zmienia wyłącznie wiatr. Sprawdza zmianę obliczonej wysokości, pełny
horyzont, wielkości fizyczne i archiwum wejść. Testy frontendu sprawdzają odrzucanie
przeterminowanych wyników oraz pięć kategorii kierunków. To weryfikacja działania
oprogramowania, nie walidacja prognoz na rzeczywistych obserwacjach surferów.

Osobna kontrola wyboru punktu jest dostępna w `model/verify_nearshore_selection.py`.
Odtwarza podsumowania z zapisanych surowych tabel solvera, bez nowych pobrań
prognoz. Porównuje cały profil, strefę załamania i poszczególne wielkości z tabelą
SWAN, kontroluje limit odległości oraz stałość punktu w czasie. Wskazuje wszystkie
spoty ze zmianą, zamiast sprawdzać wyłącznie Jantar. Zestaw testów zawiera również
oryginalne tabele Jantaru i Stegny z 6.11.2026 09:00 czasu polskiego.

```sh
python model/verify_nearshore_selection.py --cache .dev-preview/swan-cache --output .dev-preview/selection-audit
```

Do porównania przed/po należy podać zachowaną kopię cache sprzed zmiany metody.
Pliki powstające z audytu służą kontroli, nie publikacji. Takie odtworzenie
wykrywa błędy algorytmu, ale nie mierzy trafności względem rzeczywistego morza.

## Źródła i uznanie autorstwa

- [SWAN / TU Delft](https://swanmodel.sourceforge.io/) — oficjalny solver,
  [instrukcja](https://swanmodel.sourceforge.io/online_doc/swanuse/swanuse.html)
  i [dokumentacja fizyki](https://swanmodel.sourceforge.io/online_doc/swantech/swantech.html).
  Pobieramy oficjalną paczkę binarną 41.51 i weryfikujemy jej SHA256. Nie
  przedstawiamy kodu fizyki SWAN jako własnego wynalazku.
- DWD EWAM / ECMWF WAM oraz ICON / NOAA GFS / ECMWF IFS przez Open-Meteo.
- EMODnet Bathymetry Consortium, DTM 2024, warstwa `emodnet:mean` WCS,
  [DOI](https://doi.org/10.12770/cf51df64-56f9-4a99-b1aa-36b8d7b743a1).

Najważniejszy kolejny krok jakościowy: pomiary rew, poziom morza i walidacja
na raportach lokalnych, następnie domeny SWAN 2D dla portów i skomplikowanego brzegu.
