# Falki — uzupełnienie katalogu spotów

## Stegna — aktualizacja 5 listopada 2026

Na ponowne polecenie użytkowniczki ustawiono punktowi `stegna`
współrzędne: **54.347136, 19.113608**, również w wejściach modelu fal:
przekroju batymetrii, granicy morskiej i punktach pobierania wiatru.
Normalna brzegu pozostaje 350°. Klucz geometrii modelu oraz cache przeglądarki
uwzględniają współrzędne, więc wyniki niezgodne z aktualnym punktem są odrzucane.

## Sobieszewo — Hotel Orle

Osobny punkt `sobieszewo-hotel-orle` w Gdańsku, dodany na wskazanie użytkowniczki:
**54°20'55.5"N 18°52'31.0"E** = **54.34875, 18.87527777777778**.
Przybliżona normalna brzegu: 0° (morze na północ). Punkt zachowuje dokładne
podane współrzędne i nie zastępuje istniejącego `sobieszewo`.
Katalog po tym uzupełnieniu zawiera 92 punkty w 59 miejscowościach.

## Przegląd 3 listopada 2026

Katalog był oparty głównie na powiązanych kamerach morskich oraz społecznościowej
mapie WestCoast. Brak kamery nie oznacza braku możliwości obliczenia prognozy.
Górek Zachodnich i Sztutowa nie było w `surf-spots.js`, więc proces obliczeń
nie generował dla nich plików fal ani wiatru.

Dodano 20 reprezentatywnych odcinków plaży; katalog zawiera teraz 91 punktów
w 59 miejscowościach. Jest to katalog punktów prognozy na polskim wybrzeżu,
nie zamknięta lista wszystkich lokalnych peaków ani zweryfikowanych miejsc sesji.

| Obszar | Dodane punkty |
| --- | --- |
| Zachodnie wybrzeże | Dziwnówek, Łukęcin, Pobierowo, Pustkowo, Pogorzelica, Gąski |
| Środkowe wybrzeże | Poddąbie, Dębina, Czołpino, Stilo (Sasino), Kopalino |
| Półwysep i okolice | Rozewie, Rurociąg (Władysławowo), Chałupy, Kuźnica, Hel |
| Gdańsk | Jelitkowo, Górki Zachodnie |
| Mierzeja | Sztutowo, Piaski (Krynica Morska) |

Istniejące 30 opisów WestCoast pozostaje przypisane do dotychczasowych punktów.
Nowe odcinki nie mają dopisanych opinii o jakości fal, poziomie trudności czy
lokalnej osłonie. Brak przypisanej kamery nie blokuje prognozy.

## Położenie i źródła

- Nazwy i granice istniejącego katalogu sprawdzono w `surf-spots.js`,
  `surf-community.js`, `KATALOG.md` i opisach kamer w `index.html`.
- [Surf-Forecast — Polska](https://www.surf-forecast.com/countries/Poland/breaks)
  wskazuje Dąbki (już obecne),
  [Chałupy](https://www.surf-forecast.com/breaks/Chalupy) i
  [Rurociąg](https://www.surf-forecast.com/breaks/Rurociag).
  Współrzędne tego źródła są przybliżone; nie przenosimy ich bez sprawdzenia
  strony akwenu i przekroju modelowego.
- [Górki Zachodnie](https://pl.wikipedia.org/wiki/G%C3%B3rki_Zachodnie):
  zachodnia strona Wisły Śmiałej. Punkt prognozy wybrano na plaży morskiej,
  poza kanałem i mariną, której dotyczy istniejąca kamera NCŻ.
- Współrzędne nowych odcinków i azymuty brzegu są przybliżeniami roboczymi,
  nie pomiarem geodezyjnym ani dokładną pozycją konkretnej rewy.
- Dla wszystkich 20 końcowych punktów pobrano rzeczywisty raster
  [EMODnet DTM](https://ows.emodnet-bathymetry.eu/wcs) i wykonano
  `model.nearshore.bathymetry`. Każdy przekrój przeszedł kontrolę morskiej
  granicy, ciągłości mokrej części, płytkiej strefy i rozpoznania brzegu.
  Kilka początkowych punktów przesunięto po tej kontroli. To weryfikacja
  użyteczności przekroju w obecnym modelu, nie kalibracja prognoz.

Morskie plaże Helu, Kuźnicy i Chałup nie korzystają z kamer zatokowych.
Nowym punktom nie przypisano automatycznie kamer z tej samej miejscowości.
Puck, Rewa, jeziora i wnętrza portów pozostają poza morskim katalogiem.

## Jak powstają dane dla nowych punktów

Wyszukiwarka, mapa, porównanie i `model/nearshore.py` czytają wspólny
`surf-spots.js`. Nowe punkty są uwzględniane w pełnym uruchomieniu modelu;
nie wymagają osobnej listy w Pythonie ani kopii prognozy sąsiedniej plaży.

Samo odświeżenie strony udostępnia nowe nazwy w lokalnym podglądzie. Liczby
pojawiają się dopiero po obliczeniu i udostępnieniu plików
`data/nearshore/<id>.json` oraz `data/wind/<id>.json`.
Lokalny `scripts/dev-server.cjs` wczytuje katalog przy uruchomieniu, więc
działający wcześniej proces wymaga uzgodnionego restartu, aby rozpoznawał
nowe identyfikatory w swoim mechanizmie odświeżania danych.
Publikacja strony wymaga osobnego wdrożenia aktualnego katalogu i wyników.

Dla `gorki-zachodnie` i `sztutowo` wykonano również rzeczywiste obliczenia SWAN:
oba zakończyły się powodzeniem. Wyniki kontrolne zapisano osobno w
`.dev-preview/catalog-audit-data/`, a cache w `.dev-preview/catalog-audit-cache/`.
Nie są to automatycznie wyniki opublikowane pod `/data/`.
