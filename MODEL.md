# BS-SWAN 1.2 — pełny przekrój od brzegu do 500 m

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
- Niestacjonarny krok 10 minut, schemat BSBT; 12 godzin rozbiegu przed terminami
  wyświetlanymi użytkownikowi, następnie 120 godzin prognozy.

### Granica od morza

Pełny, ciągły przebieg **DWD EWAM** jest wybierany jako warunek graniczny.
Jeśli nie ma kompletu, używany jest ECMWF WAM. Nie mieszamy wysokości z jednego
modelu z okresem drugiego. Wysokość, średni okres i kierunek są przekształcane
przez SWAN w widmo JONSWAP (`gamma=3.3`, średni okres `MEAN`, rozrzut 30°).
To **zrekonstruowane widmo**, nie pełne widmo pobrane z modelu regionalnego.
SWAN wpuszcza tylko składowe nadchodzące do domeny.

### Wiatr BS Wind 3

- ICON, GFS i ECMWF przez Open-Meteo, w trzech lokalizacjach: punkt spotu,
  2,5 km oraz 5 km w morze. Wybierana jest najbliższa komórka modelu, a nie
  wymuszona komórka lądowa.
- Ten sam algorytm co w tabeli: mediana prędkości i kierunek z uśrednionych
  wektorów. Co najmniej dwa dostępne modele są wymagane.
- **Wektory wiatru są rzeczywistym wejściem SWAN** (`READINP WIND`), aktualizowanym
  co godzinę symulacji i interpolowanym przestrzennie między punktami. Przy
  wydłużeniu profilu w stronę lądu przytrzymujemy ostatni wiatr przybrzeżny.
- Jeśli kierunki są sprzeczne (zgodność wektorów <0,3), do solvera trafia
  oznaczony model zastępczy (pierwszy dostępny, preferowany ICON), zamiast fałszywej
  ciszy. Tabela nadal pokazuje niepewny kierunek konsensusu; opis SWAN wskazuje
  użyty wiatr i informację o zastępstwie.
- BS Wind 3 jest naszym połączeniem danych, **nie wiatrem GTF** innego serwisu.

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

- Wysokość znacząca, okres średni, okres energetyczny, kierunek i moc w morskim
  punkcie możliwie bliskim głębokości 2 m, **wyłącznie w pierwszych 500 m od
  rozpoznanego brzegu**. Gdy punkt bliższy głębokości 2 m leży dalej, wybierany
  jest poprawny płytszy punkt wewnątrz limitu, a nie punkt poza nim.
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
Do diagnozy wywiewki udostępniamy dodatkowo 6 godzin historii modelowej z drugiej
połowy rozbiegu; wykres prognozy pokazuje dopiero bieżącą godzinę i przyszłość.

## Backend i publikacja

Workflow `.github/workflows/forecast-pages.yml`:

1. Uruchamia się po zmianie kodu, ręcznie lub o minucie 17 co 3 godziny (UTC).
2. Pobiera nowe dane wiatrowe dla wszystkich spotów i publikuje `data/wind/ID.json`.
3. Uruchamia SWAN, jeśli zmienił się cykl 00/12 UTC, kod modelu, geometria,
   brakuje dostatecznego horyzontu albo ręcznie wybrano `force`.
4. Publikuje `data/nearshore/ID.json` i `data/status.json`, a potem cały frontend
   przez artefakt GitHub Pages. Wyniki nie trafiają jako automatyczne commity do Git.
5. Zachowuje batymetrię i wyniki w cache. Wejścia i logi solvera są artefaktem
   `swan-inputs-and-logs-RUN_ID`, przechowywanym przez 14 dni.

Harmonogram GitHub Actions jest **best effort**, nie gwarancją startu dokładnie
co trzy godziny. W publicznych repozytoriach GitHub może wyłączać harmonogram
po długim okresie bez aktywności; stan widać w Actions oraz w datach na stronie.
Odświeżenie w przeglądarce tylko pobiera ostatni wynik; nie uruchamia obliczeń.

Jeśli odświeżenie prognoz zawiedzie, publikacja interfejsu może użyć katalogu
`data/` z ostatniego udanego artefaktu Pages. Zachowuje wszystkie oryginalne
daty pobrania i obliczeń, więc limity wieku danych w interfejsie nadal działają.
`data/status.json` oznacza wtedy `lastRefreshFailed`. Stary kod strony nie jest
przywracany. Brak poprawnego poprzedniego pakietu lub błąd testów zatrzymuje publikację.

## Odtworzenie lokalnie

Linux amd64, Node.js, Python 3.10+ i biblioteki systemowe libgfortran5/libgomp1:

```sh
python3 -m venv .venv
.venv/bin/pip install -r model/requirements.txt
.venv/bin/python model/nearshore.py --spots wladyslawowo,sobieszewo --workers 2 --force
.venv/bin/python model/build_site.py
python3 -m http.server 8000 --directory dist
```

Bez `--spots` liczone są wszystkie spoty. `--hours 6` służy wyłącznie do krótkich
testów; publiczny workflow używa 120 h. Numeryczna geometria i wszystkie dane
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
