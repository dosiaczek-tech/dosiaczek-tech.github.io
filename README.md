# Nad morzem — kamery Bałtyku na żywo

**Strona:** https://dosiaczek-tech.github.io/

Statyczna strona ze **128 źródłami kamer polskiego wybrzeża**, od Świnoujścia
po Krynicę Morską. Katalog obejmuje plaże, mola, porty, promenady oraz centra
nadmorskich miejscowości.

Wyróżniono Kołobrzeg, Brzeźno, Sopot oraz Mierzeję Wiślaną: dwa ujęcia ze Stegny,
Jantar, Kąty Rybackie i dwa widoki z Krynicy Morskiej.

## Funkcje

- Jeden odtwarzacz na żywo z przełączaniem kamer.
- Wyszukiwanie miejsc i filtrowanie pięciu regionów, w tym Mierzei Wiślanej.
- Ulubione zapisywane lokalnie w przeglądarce.
- Pełny ekran i pobieranie playlisty `.m3u` do VLC.
- Układ dostosowany do komputera i telefonu.
- Ponawianie połączenia po utracie internetu.
- Osobna zakładka **Prognozy surfingowe**: 91 spotów / odcinków w 59 miejscowościach,
  69 powiązanych kamer morskich, 14 dni prognozy (dni 8–14 orientacyjne), ranking okien dziennych.
  Katalog obejmuje również miejsca bez kamery, m.in. Górki Zachodnie i Sztutowo.
  Zakres uzupełnienia i kontrola punktów: [SPOTY.md](SPOTY.md).
- **Porównanie uruchamiane na żądanie**: po wejściu pięć list pokazuje „Wybierz”,
  także gdy wcześniej używano zapisanych wyborów. „Pokaż najlepsze” wyszukuje spoty,
  a „Porównaj wybrane” wczytuje od jednego do pięciu wskazanych miejsc. Sama zmiana
  list przygotowuje wybór; dane są pobierane dopiero po kliknięciu przycisku.
  Wczytany zestaw jest wykorzystywany przy kolejnych zmianach dnia. Ponowne pobranie
  i wyszukiwanie spotów uruchamiają wyłącznie przyciski „Pokaż najlepsze” i „Porównaj wybrane”.
  Podczas pobierania w miejscu wykresu pojawia się duży napis **Loading** i wskaźnik ładowania.
- **Pięć najlepszych spotów na wybrany dzień**: w trybie automatycznym każda data dobiera własną piątkę
  z całego katalogu według oceny pełnego trzygodzinnego okna dziennego.
  Wykres porównuje te wybrane spoty w kolejnych dniach; wybrany dzień obramowują czarne przerywane linie.
  Podpisy dni pod wykresem stoją na środku całego dnia i przesuwają się razem z wykresem; przy krawędzi
  chowają się pod nią, zamiast przesuwać się wolniej i nagle znikać.
  Kliknięcie spotu w legendzie wykresu otwiera jego „Prognozę godzinową” w dniu wybranym przyciskiem
  pod wykresem, od godziny 00:00 (`#surf/<id>?time=…`, jak link z heat mapy). Legenda jest w ramce,
  a mówi o tym dymek znaczka „i” po lewej stronie ramki (na telefonie nad jej lewym rogiem, żeby ramka miała
  całą szerokość): otwiera się po dotknięciu, zamyka po ponownym dotknięciu,
  dotknięciu w innym miejscu albo klawiszem Esc.
- **Gdzie warto jechać**: po jednym kafelku na każdy porównywany spot w dniu wybranym przyciskiem pod
  wykresem — jego najlepsze trzygodzinne okno dzienne, od najwyższej oceny. Okno zostaje na liście, dopóki
  nie minie jego górna godzina, także gdy już trwa; żadne nie przechodzi przez północ (dla minionego dnia
  nie ma propozycji). Spot bez okna dostaje szary kafelek „Wybierz kolejny dzień”. Przy „Pokaż najlepsze” są to spoty
  dobrane na ten dzień, przy „Porównaj wybrane” — wskazane spoty, także dodane ponad pięć list. Karty prowadzą do sesji.
  Nad kafelkami jest jeden wspólny znaczek „i” (widoczny, gdy choć jeden kafelek prowadzi do prognozy) z dymkiem:
  „Kliknij spot poniżej, żeby przejść do szczegółowej prognozy godzinowej podanego zakresu godzinowego wybranego dnia.”
  Naraz otwarty jest tylko jeden dymek „i”.
  Zmiana dnia korzysta z już pobranych danych; wybór spośród remisów pozostaje stały
  do odświeżenia. „Porównaj wybrane” zatwierdza własny zestaw do porównywania między dniami;
  „Pokaż najlepsze” uruchamia ranking automatyczny dla aktualnie wskazanej daty.
- **Prognoza godzinowa i pogoda na spocie** tworzą jedną tabelę. Pod oceną warunków,
  falami i wiatrem znajdują się temperatura wody, temperatura powietrza
  i zachmurzenie, dopasowane do tych samych godzin. Punkt prognozy (odległość od brzegu
  i głębokość) jest opisany raz nad tabelą; gdy zmienia się w czasie, opis podaje zakres
  wartości. Przy braku poprawnych danych punktu opis jest ukryty. Większe kafelki dni mają pod sobą
  godziny wschodu i zachodu słońca dla danej daty; na start widać 5 dni od dzisiaj, a „Pokaż kolejne…”
  i „Pokaż mniej” działają jak pod wykresem porównania. Dzień przewinięty w tabeli zawsze ma swój kafelek.
  Czasy pobrania pogody i wody oraz opis źródeł są pod tabelą w zwiniętych „Dodatkowych informacjach”.
  Błędy są zawsze po polsku (np. „brak połączenia z serwerem — sprawdź internet” zamiast „Failed to fetch”)
  i razem z informacją o danych z pamięci po nieudanym odświeżeniu są schowane w zwiniętych „Dodatkowych
  informacjach” przy miejscu, którego dotyczą: pogoda i woda pod tabelą, wiatr pod linijką statusu nad prognozą,
  fale pod przekrojem, porównanie pod jego statusem.
  Gdy nie da się wczytać żadnych danych o falach, pod przekrojem i w miejscu tabeli jest „Brak danych o falach.”;
  opublikowany powód braku prognozy dla spotu (np. geometria) nadal jest podawany.
  Ikony przy zachmurzeniu korzystają
  z kodu pogody WMO Open-Meteo: rozróżniają pogodę, chmury, deszcz, śnieg i burze;
  uwzględniają również noc. Samo duże zachmurzenie nie jest oznaczane jako deszcz.
  Domyślnie dostępne są **ostatnie 24 godziny oraz prognoza**. Początek tabeli pokazuje
  wcześniejsze dostępne godziny z oznaczeniem „historia”.
  To historia modelowa, a nie pomiary. SWAN oblicza ją po osobnym 12-godzinnym rozbiegu,
  więc nowy spot otrzymuje cały wcześniejszy zakres przy pierwszym przeliczeniu.
  Kolejne dni tworzą jedną ciągłą tabelę: kolumny mają
  stałą, kompaktową szerokość i datę nad godziną. Mniejsze odstępy oraz miniaturki
  kierunków pozwalają pokazać więcej godzin naraz. Tabelę można przesuwać w bok myszką lub palcem;
  nazwy parametrów zawijają się w wąskiej kolumnie przyklejonej po lewej. Kafelki dni przewijają do daty, a turkusowe
  podświetlenie przechodzi na następny dzień dopiero po zniknięciu poprzedniego z widoku.
  Pod dniami są małe przyciski **Rano**, **Po południu** i **Wieczór**, przewijające
  wybrany dzień od 06:00, 12:00 lub 18:00. Gdy brakuje początku danej pory, używana
  jest jej pierwsza dostępna godzina. Pory bez prognozy są nieaktywne. Przewijanie
  ręczne aktualizuje wyróżnienie pory dnia. Każda dostępna godzina ma własną kolumnę,
  z nagłówkiem „Godzina” po lewej. Godziny wybranej sesji są wyróżnione.
  **Bladożółte tło danych oznacza dzień, niebieskie noc**, według początku przedziału; zachmurzenie
  jest osobnym parametrem. Turkusowa obwódka wyróżnia wybraną godzinę. Godziny są podawane
  w czasie polskim, także przy zmianie czasu.
  Tabela pokazuje tylko godziny z poprawną prognozą wysokości fal przy spocie i kończy się
  na ostatniej dostępnej prognozie fal. Sama pogoda nie dodaje kolejnych godzin ani dni.
  Luki w falach są pomijane; dni bez fal nie mają kafelków.
  Wiatr, temperatury i zachmurzenie pozostają dopasowane do zachowanych godzin.
  Brakujące dane dodatkowe zostawiają puste komórki; całkowicie puste wiersze są pomijane.
  W wierszu ocen cała komórka ma kolor jakości warunków: od czerwonego przez pomarańczowy
  i mocniejszy żółty po zielony. Czarna czcionka jest czytelna na każdym z tych teł;
  kolor oceny jest niezależny od pory dnia. Wartości zerowe są wyświetlane jako dane.
  Wiersze „Fale nadchodzą z” i „Wiatr przy brzegu” mają miniaturki morza i plaży
  ze strzałką ruchu. Kierunek, prędkość oraz opis wiatru względem brzegu są w jednej
  komórce z jedną miniaturką. Morze jest u góry, ląd na dole — widok osoby patrzącej
  z plaży na morze. Strzałki uwzględniają orientację danego spotu i pokazują kierunek
  od źródła do celu; obok są opisy „do brzegu”, „od brzegu” lub „wzdłuż brzegu”.
  Przy ciszy i zerowej fali nie ma strzałki; brak kierunku nie jest zastępowany domyślnym.
  Dane Open-Meteo są pobierane tylko dla otwartego spotu. Temperatura wody pochodzi
  z morskiej siatki około 8 km. Przy braku poprawnej prognozy fal tabela jest ukryta.
- **Heat map spotów** (`#heatmap`) to jedna siatka dla całego wybrzeża: wiersz to spot (u góry
  najdalej na zachód, na dole najdalej na wschód), kolumna to godzina — od bieżącej do ostatniej
  z oceną któregokolwiek spotu. Kolor oznacza ocenę z początku godziny, bez uśredniania. Gdy modele wiatru wskazują różne kierunki,
  ocena jest medianą ocen dla wiatru z każdego modelu, a karta pola zaznacza niską pewność. Pola są tak
  małe, że cała siatka mieści się na ekranie telefonu; podpisane są tylko końce osi (pierwszy
  i ostatni spot, pierwsza i ostatnia godzina z datą). Nazwy miejscowości na osi spotów są pisane
  kapitalikami i stoją pionowo, litera pod literą. Nazwy nigdy nie są ucinane: gdy obie nie mieszczą się
  przy mapie (np. przy większej czcionce systemowej telefonu), dostają wspólny, mniejszy rozmiar liter,
  dobrany na urządzeniu. Kliknięte pole ciemnieje, a pod siatką
  pojawia się jego ocena, dzień, godzina i spot. Kliknięcie tej informacji otwiera spot
  (`#surf/<spot>?time=<unix>`) z wybraną godziną i przewija do „Prognozy godzinowej”.
  Rozsunięcie dwóch palców przybliża mapę wokół palców, a przesuwanie dwoma palcami ją przesuwa
  (jak mapy spotów); jeden palec nadal przewija stronę i wybiera pole, a po przybliżeniu przesuwa mapę w bok.
  Kafelki rosną najwyżej do 44 px i dostają cienkie odstępy; podpisy osi pokazują wtedy pierwszy i ostatni
  widoczny spot oraz godzinę, a przycisk „Pokaż całą mapę” na końcu paska z legendą (na telefonie obok
  „Ocena warunków”) wraca do całości. Bez przybliżenia przycisk jest niewidoczny, ale zachowuje swoje
  miejsce, więc mapa nie przesuwa się, gdy się pojawia. Na komputerze samo kółko
  myszy (bez Ctrl; także szczypanie na touchpadzie) przybliża i oddala wokół kursora, a przeciąganie
  myszą lub przesunięcie w bok na touchpadzie przesuwa mapę. Gdy widać całą mapę, kręcenie w dół
  przewija stronę, więc da się ją minąć bez zatrzymywania na mapie.
  Klawiatura: strzałki wybierają pole, Page Up/Page Down przesuwają o dobę, Enter otwiera prognozę;
  przybliżony widok podąża za wybranym polem.
- **Szybsze ładowanie całego wybrzeża**: „Pokaż najlepsze” i heat mapa pobierają cztery części
  `data/coast-1.json` … `coast-4.json` (wiatr i fale wszystkich spotów od zachodu na wschód, bez przekrojów
  0–500 m, razem ok. 2,7 MB po kompresji) zamiast 182 osobnych plików. Części przychodzą jedna po drugiej,
  a spoty z już pobranej części liczą się, zanim dotrze następna. Dane są sprawdzane tak samo jak pliki spotu;
  gdy części brak, jej spoty wracają do własnych plików. Oceny całego wybrzeża policzone przez heat mapę albo
  „Pokaż najlepsze” są pamiętane przez 15 minut w pamięci sesji przeglądarki, więc heat mapa po rankingu
  i po przeładowaniu strony pojawia się od razu. Ranking nie zapisuje już kopii offline wiatru wszystkich spotów
  (robi to tylko otwarty spot), a historia porównania w pamięci przeglądarki obejmuje tylko ostatnie i najbliższe
  24 godziny (ok. 20 kB na spot zamiast ok. 160 kB), więc nie zapełnia pamięci wspólnej z ulubionymi kamerami i SUP.
- Zakładka „Prognozy surf” (`#surf`) otwiera się bez wybranego spotu: widać porównanie spotów,
  wyszukiwarkę, listę („Wybierz spot…”) i mapę bez zaznaczenia, a prognoza spotu pojawia się dopiero
  po wyborze. Odświeżenie strony zawsze zaczyna od `#surf`, także gdy wcześniej był wybrany spot;
  otwarcie linku do spotu (np. z heat mapy, porównania lub zakładki) nadal go pokazuje.
  Nieznany adres spotu również prowadzi do `#surf`, zamiast otwierać spot domyślny.
- Wyszukiwarka miejscowości i spotów po lewej, lista plaż po prawej i przycisk
  „Pokaż prognozę”. Wyszukiwanie toleruje literówki, przestawione litery i brak
  polskich znaków. Podpowiedzi działają też z klawiatury.
- Lista grupuje spoty miejscowościami od zachodu do wschodu; wewnątrz grupy
  również obowiązuje kolejność geograficzna. Kliknięcie znacznika mapy otwiera spot od razu.
  Na górze listy jest „Wybierz spot…”: wybranie tej pozycji zamyka listę bez wyboru spotu
  i cofa wybór, który czekał na „Pokaż prognozę”.
- **Bałtyk Surf 1.2 / SWAN**: rzeczywista, niestacjonarna symulacja widma fal
  przy brzegu, z regionalną falą na granicy, wiatrem BS Wind 8 (osiem modeli) i rastrem EMODnet.
  Wykres przekroju, fala w okolicy głębokości 2 m, okres, moc i strefa załamania.
- Główny wykres pokazuje **pełny przekrój 0, 50, 100, …, 500 m** i jest od razu
  widoczny. Wybór godziny zmienia przekrój oraz podsumowanie. Punkt podsumowania
  jest zaznaczeniem na całej krzywej, nie początkiem wykresu.
  Panel **„Wybierz porę”** najpierw pokazuje dni, a po rozwinięciu dnia — jego godziny.
  Na start widać 5 dni od dzisiaj, łącznie do 14; „Pokaż kolejne…” i „Pokaż mniej” działają jak pod wykresem porównania.
  Jest otwarty do użycia „Zwiń” lub Escape; wybranie godziny i kliknięcie poza panelem
  go nie zamykają. Można przewijać zawartość pionowo kółkiem myszy lub dotykiem.
  Dni i godziny pozostają chronologiczne. Wybrana godzina jest turkusowa, oznaczona ✓
  i przewijana do widocznej części listy pod nagłówkiem swojego dnia. Wysokość panelu
  dopasowuje się do zawartości, bez pustego obszaru pod ostatnią pozycją. Wcześniejsze dni
  są powyżej, dostępne po przewinięciu. Panel pokazuje CEST/CET i obsługuje klawiaturę.
- Podsumowanie, tabela, wykres czasowy i ranking dotyczą
  **tego samego punktu w strefie do 500 m od oszacowanego brzegu**. Podajemy
  odległość, głębokość oraz link do punktu prognozy na mapie. Brak wyniku
  przybrzeżnego nie jest zastępowany prognozą z dalszego morza.
- Automatyczny backend GitHub Actions: wiatr co 3 h, nowe obliczenia SWAN
  w cyklach 00/12 UTC. W tabeli wiatr pod komórkami fal i pięć klas kierunku:
  onshore, cross-on, cross, cross-off, offshore.
- Automatycznie widoczna mapa Windy z zakładkami **Fale** i **Wiatr**, godziny polskie,
  oznaczanie brakujących i nieaktualnych danych. Wybrana warstwa podąża za lokalizacją spotu;
  odnośnik „Otwórz Windy” otwiera tę samą warstwę. Zakładki obsługują również klawiaturę.
  Mapa nie przeładowuje się przy ponownym wybraniu aktywnej zakładki ani przy odświeżaniu tego samego spotu.
- „Źródła prognozy przy spocie” (fala SWAN i wiatr z każdego modelu) są zwinięte na samym dole zakładki
  i rozwijają się po kliknięciu. „Dno przy spocie” zajmuje całą szerokość.
- Szacowana **moc fal przy spocie (kW/m)** i **energia fal (kJ/m²)** w podsumowaniu,
  z objaśnieniem jednostek. Tabela godzinowa pokazuje energię, a opis sekwencji
  wiatru znajduje się w osobnej sekcji.
- Interaktywna mapa wyboru wszystkich spotów: kliknięcie znacznika otwiera
  prognozę, pobliskie punkty są grupowane, a mapa synchronizuje się z listą.
  Na ekranie dotykowym tę mapę i mapę wiatru przesuwa się i przybliża dwoma palcami; jeden palec
  przewija stronę, a próba przesunięcia nim mapy pokazuje podpowiedź.
  Znaczniki mają stałe nazwy; grupy pokazują miejscowość, a po przybliżeniu
  widać nazwy poszczególnych spotów. Kolory odróżniają spoty z kamerą od pozostałych.
  Wybrany spot jest większy i pomarańczowy; ten sam kolor wyróżnia jego grupę po oddaleniu mapy.
- Historia onshore → offshore / cisza z potwierdzeniem utrzymania fal:
  opis fazy i filtr „Tylko wywiewka po nawianiu”.
- Sobieszewo oraz 30 opisów spotów z mapy WestCoast (3 scalone z istniejącymi,
  27 nowych punktów). Pochodzenie, lokalne kierunki, charakter i poziom wg autora;
  bez przypisywania ocen kitesurfingowych do surfingu.
  Punkt odniesienia Sobieszewa: **54.34652508378602, 18.91065779954801**.
  Nowe współrzędne wyznaczają pobieranie danych i przekrój SWAN; archiwalne wyniki
  poprzedniej lokalizacji nie są ponownie używane. Pakiety wiatru dla przeniesionego
  spotu muszą zawierać zgodne współrzędne, a nie tylko ten sam identyfikator.

Prognozy: https://dosiaczek-tech.github.io/#surf
Przykładowe nowe spoty: `#surf/sobieszewo`, `#surf/kolobrzeg-palikpoint`,
`#surf/darlowko-zachod`.

To model eksperymentalny, bez walidacji na lokalnych pomiarach i bez asymilacji
satelitów. Konfiguracja solvera i odtwarzanie obliczeń: [MODEL.md](MODEL.md).
Opis oceny surfingu, ograniczeń i źródeł: [SURFING.md](SURFING.md).

## Uruchomienie i publikacja

### Szybki podgląd lokalny — NixOS

#### Stała usługa dla dotychczasowych APK

Od 4.11.2026 port 8766 obsługuje jednostka użytkownika `falki-apps.service`,
zdefiniowana w `scripts/falki-apps.service`. Jest włączona przy starcie; konto
ma `Linger=yes`, a `Restart=always` przywraca proces po awarii. Nie zależy to
od otwartej sesji narzędzia programistycznego. Stan i logi:

```sh
systemctl --user status falki-apps.service
journalctl --user -u falki-apps.service
```

To nadal usługa na domowym komputerze: wymaga jego zasilania oraz dostępu
telefonu do domowej sieci/VPN. Nowe APK Falki 1.0.2 i supy 1.0.6 przygotowano
pod publiczne HTTPS `https://dosiaczek-tech.github.io/` i `/sup/`.
**Nie instalować ich jako gotowego wdrożenia przed publikacją obu stron.**
Paczki i sumy SHA-256 są w `downloads/` oraz `sup/android/releases/`.
Migracja zapisów Androida używa lokalnego dokumentu o starym originie,
bez kontaktu z dawnym serwerem; zachowuje oryginały i nie nadpisuje konfliktów.

Przygotowany workflow sprawdza aktualizację co godzinę, ale dane wejściowe
zachowuje przez trzy godziny, ograniczając zapytania do dostawcy. Każda udana
partia wejść jest zapisywana osobno. Błąd kolejnej partii nie usuwa poprzednich.
Po wdrożeniu osobny etap sprawdza realny wiek wiatru i fal oraz dostępność SUP;
nie utożsamia udanego przesłania plików z działającą prognozą. Harmonogram
GitHub Actions jest [realizowany bez gwarancji punktualności](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
Nie stanowi gwarancji nieprzerwanego dostępu do świeżych danych dostawcy.
W przeglądarce pozostają limity: 6 h dla wiatru, 18 h dla wejść SWAN.

#### Uruchomienie ręczne

W katalogu repozytorium uruchom:

```sh
nix-shell --run 'node scripts/dev-server.cjs'
```

Otwórz http://zuffie.test:8766/#kolobrzeg lub
http://zuffie.test:8766/#surf/kolobrzeg. Zapisz zmiany HTML, CSS albo JavaScript
i odśwież przeglądarkę — serwer czyta pliki bezpośrednio z dysku i wyłącza ich
cache HTTP. Do podglądu nie jest potrzebny build ani publikacja w GitHub Pages.

Serwer udostępnia `/data/` z aktualnej publikacji https://dosiaczek-tech.github.io,
więc lokalnie działają również wykresy i ranking. Odpowiedzi są buforowane przez
60 sekund; podgląd może odświeżyć dane lokalnie przy problemach z publikacją.

Podgląd odświeża fale w tle co sześć godzin, również bez otwartej strony.
Przy starcie sprawdza datę ostatniego zapisanego przeliczenia; potem co minutę
sprawdza termin kolejnej próby. Żądanie brakujących lub starzejących się fal
również może uruchomić przeliczenie. Uruchamiany jest rzeczywisty solver SWAN
lokalnie, dla całego katalogu, z czterema
równoległymi obliczeniami. Pobiera świeże wymuszenie falowe, wiatr w trzech punktach
przekroju i raster EMODnet. Nix zapewnia Python, requests/Pillow oraz biblioteki solvera.
Wyniki są oznaczone jako lokalne i zachowują rzeczywiste daty obliczeń oraz źródeł.
Limit ważności 18 godzin nadal obowiązuje. Tabela pokazuje stan przeliczania i pobiera
gotowe wyniki; przeterminowana odpowiedź nie blokuje jej przez 15-minutowy cache przeglądarki.
Porównanie spotów zachowuje wczytany zestaw — nowe wyniki pobiera się przyciskiem.

Obliczenia są współdzielone przez wszystkie żądania. Po ukończonej aktualizacji
obowiązuje sześciogodzinna przerwa między zadaniami, a po błędzie — 15 minut.
Cache, wyniki i archiwa wejść są w `.dev-preview/swan-cache/` i `.dev-preview/swan-data/`;
log kolejnych zadań: `.dev-preview/swan-refresh.log`. Wyniki przetrwają restart serwera.
Wybierany jest najświeższy poprawny wynik z pełnymi 24 godzinami historii. Starszy
format publikacji z krótszą historią nie wypiera poprawnego kompletnego wyniku lokalnego.

Jeżeli opublikowany wiatr jest niedostępny, ma ponad 6 godzin, nie zawiera wszystkich
modeli aplikacji albo nie sięga tak daleko jak jej prognoza (14 dni, z co najmniej dwoma
modelami; tolerancja 12 godzin), lokalny serwer pobiera aktualny BS Wind 8 z Open-Meteo
partiami do 20 spotów. Zabezpiecza to przed wersją strony online z innym zestawem modeli
lub krótszym horyzontem, która inaczej ucięłaby oceny (tak było, gdy online pobierano wiatr
na 6 dni, a lokalnie na 16); gdy lokalne pobranie się nie uda, serwer nadal poda pakiet
opublikowany. Współdzieli zapytania
między rankingiem i szczegółami, zapisuje rzeczywisty czas pobrania i oznacza źródło
jako „lokalne odświeżenie Open-Meteo”. Cache wiatru trwa 3 godziny, tak jak cykl publikacji:
osiem modeli to cięższe zapytania, które nie mogą wyczerpać darmowych limitów Open-Meteo. Przy awarii może
użyć ostatnio pobranych lokalnych danych do 6 godzin, z oryginalną datą i oznaczeniem
danych z pamięci. Limity wieku fal nadal wynikają z modelu SWAN.

Podgląd wymaga internetu; własne obliczenia SWAN uruchamia się osobno według
[MODEL.md](MODEL.md).

`shell.nix` zapewnia Node.js 22 i środowisko lokalnych obliczeń SWAN. Poza Nix
`node scripts/dev-server.cjs` wymaga także Python 3 z requests/Pillow i bibliotek
solvera opisanych w [MODEL.md](MODEL.md). Zajęty port można zmienić przez `--port 8767`.
Serwer domyślnie nasłuchuje na `0.0.0.0`, aby podgląd był dostępny również
z innego urządzenia przez sieć lokalną lub Tailscale. Domena `zuffie.test`
powinna wskazywać na komputer z projektem; w tym środowisku jest już skonfigurowana.
Używaj pełnego adresu `http://zuffie.test:8766` z portem podglądu.

### Równoległa praca nad aplikacją SUP

Druga aplikacja ma osobny katalog `sup/` i podgląd
http://zuffie.test:8766/sup/. Drugą sesję OpenCode uruchom z katalogiem roboczym
`sup/`; instrukcje współpracy są w głównym `AGENTS.md` oraz `sup/AGENTS.md`.
Sesja Bałtyk zajmuje się główną aplikacją i wspólną infrastrukturą, a sesja SUP
kodem, zależnościami, testami i dokumentacją wewnątrz `sup/`.

### Publikacja i pełne obliczenia

Frontend można uruchomić lokalnie przez `python3 -m http.server 8000`.
Odtwarzanie wymaga internetu; biblioteka hls.js 1.6.13 jest pobierana z jsDelivr
z weryfikacją integralności SRI.
Prognozy pobierają publiczne dane Open-Meteo i EMODnet bez kluczy API;
publiczny endpoint Open-Meteo służy do użytku niekomercyjnego. Wyniki SWAN
generuje backend opisany w `MODEL.md`; bez plików `data/` frontend wyraźnie
oznacza brak prognozy przy brzegu; nie podstawia danych z dalszego morza.
Skrypty i arkusz `surf-*` oraz `surf.css` muszą być publikowane obok `index.html`.

Testy obliczeń i pobierania danych: `node --test tests/*.test.cjs`.

GitHub Pages publikuje artefakt `dist/` przez workflow `forecast-pages.yml`.
Zmiana kodu, harmonogram lub ręczne uruchomienie workflow odświeżają publikację.
Pliki obliczeniowe nie są dopisywane do historii Git; wejścia i logi SWAN
są archiwizowane jako artefakty GitHub Actions.

## Dodawanie kamer

Listy `CAMERAS`, `ADDITIONAL_CAMERAS` i `NADMORSKI_CAMERAS` znajdują się w skrypcie w `index.html`.
Każda pozycja zawiera unikalny identyfikator, nazwę, opis widoku, region,
identyfikator strumienia i numer serwera. Link źródłowy domyślnie powstaje
z identyfikatora kamery; pole `source` pozwala go nadpisać.
Kamery innych dostawców podają bezpośrednio `stream`, `poster`, `source`
i `provider`. `NADMORSKI_CAMERAS` buduje te pola z danych katalogu Nadmorski24.
Wyszukiwarka rozpoznaje również nazwę dostawcy, np. „Nadmorski24”.
Pola `description`, `tags` i `regionLabel` są uzupełniane automatycznie, jeśli
nie podano ich przy kamerze. Liczniki korzystają z rzeczywistej długości katalogu.
Publiczne strumienie HLS muszą udostępniać nagłówki CORS umożliwiające
odtwarzanie na tej stronie. Adresy transmisji mogą zmienić się po stronie dostawcy.

Bezpośredni link do wybranej kamery: `https://dosiaczek-tech.github.io/#brzezno`
lub `https://dosiaczek-tech.github.io/#stegna-plaza`.

Katalog uzupełniono 20.10.2026 o 40 źródeł Nadmorski24 i trzy przywrócone
transmisje WebCamera. Kamera Puck — Zatoka Pucka ma adres
`https://dosiaczek-tech.github.io/#puck-zatoka-pucka`.
[Zakres przeglądu i wyniki weryfikacji](KATALOG.md)
opisują sprawdzone źródła oraz kamery niedostępne podczas aktualizacji.

Obraz pochodzi z WebCamera.pl, Nadmorski24.pl i od właścicieli kamer; linki do źródeł są
dostępne w odtwarzaczu. To repozytorium zawiera stronę odtwarzacza, a nie nagrania.
