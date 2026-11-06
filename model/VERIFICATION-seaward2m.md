# Weryfikacja poprawki wyboru punktu prognozy — 6 listopada 2026

Wersja: `BS-SWAN-1.3-seaward2m`. Poprawka dotyczy interpretacji wyników SWAN,
nie jego parametrów fizycznych ani współrzędnych spotów. W Jantarze stara reguła
wybierała zagłębienie za modelową rewą, ponieważ jego głębokość była o 6 cm
bliższa wartości 2 m niż głębokość odpowiedniego punktu od strony morza.

Nowa reguła przeszukuje profil od morza do pierwszego zejścia do 2 m, w granicach
potwierdzonej strefy do 500 m. Nie wybiera maksimum wysokości ani oceny. Punkt
jest stały w całym horyzoncie; brak wyniku lub cisza nie przenoszą go do innego węzła.

## Osobna kontrola na archiwach

Uruchomiono [verify_nearshore_selection.py](verify_nearshore_selection.py) na kopii
archiwów sprzed poprawki. Sprawdzono zgodność hashy wejść, surowe tabele solvera
i wszystkie godziny, bez ponownego pobierania prognoz.

- 86 spotów i 11 438 godzin (12 historii + 121 prognozy na spot).
- Pełne profile fal i rozpoznane strefy załamania są identyczne przed i po zmianie.
- Wszystkie parametry podsumowania pochodzą z jednego rzeczywistego węzła SWAN.
- Każdy główny punkt spełnia limit 500 m także względem lądowej granicy
  niepewności położenia brzegu. Żaden nie przeskakuje wcześniejszej izobaty 2 m.
- Punkt zmienił się w 9 spotach: Jantar, Jastarnia, Władysławowo, Lubiatowo,
  Poddąbie, Mrzeżyno, Trzęsacz, Rurociąg, Archies Point. W 77 pozostał taki sam;
  ich wartości fal i oceny pozostały identyczne.
- Nie wykryto błędów zgodności. W godzinach z brakiem wiatru nie tworzono oceny;
  rzeczywiste zerowe wysokości w wybranym węźle zachowują ocenę zero.

Porównanie dla 6.11.2026, 09:00 czasu polskiego, przy tych samych wejściach
z porannego obliczenia (wiatr/granica pobrane około 05:18):

| Spot | Punkt przed → po | Wysokość przed → po | Okres przed → po | Ocena przed → po |
| --- | --- | --- | --- | --- |
| Jantar | 50 → 350 m od modelowego brzegu | 0,244 → 1,188 m | 2,186 → 5,516 s | 0,2 → 6,6 / 10 |
| Stegna | 250 → 250 m | 1,242 → 1,242 m | 5,562 → 5,562 s | 6,7 → 6,7 / 10 |

W Jantarze fala za rewą nadal ma 0,244 m na pełnym wykresie. Poprawka zmienia
punkt podsumowania; nie usuwa tłumienia. Pewność prognozy pozostaje niska,
zgodnie z istniejącą regułą dla punktów oddalonych o ponad 300 m.

## Testy i świeże obliczenie

- 169 testów JavaScript oraz 30 testów Pythona przeszło pomyślnie.
- Test integracyjny rzeczywiście uruchomił SWAN z wiatrem i bez wiatru:
  dla tego samego dna i granicy dał odpowiednio 0,593 m i 0,412 m.
- Testy regresyjne używają [oryginalnych tabel Jantaru i Stegny](fixtures/seaward2m/README.md).
  Obejmują również rewę i zagłębienie za nią, płaski profil, równe głębokości,
  punkt katalogowy na lądzie, limit odległości, suchy węzeł, spokojną wodę
  i brak wyniku w wybranym mokrym punkcie.
- Kontrola przeglądarkowa na stałych danych potwierdziła zgodność ocen w karcie
  spotu, wykresie i tabeli porównawczej oraz heat mapie. Wybrany punkt jest
  zaznaczony na przekroju. Nie wystąpiły błędy JavaScript; sprawdzono też szerokość 390 px.
- Osobne klucze cache i historii oraz kontrola wersji blokują przywracanie
  ocen starej metody. Zapisanych wcześniej danych nie usuwamy, ale nie mieszamy
  ich z nową metodą. Surowe, zgodne obliczenia dostarczają historii dla nowej wersji.
- Następnie wykonano nowe pełne obliczenia dla całego katalogu, na świeżo pobranych
  wejściach. Dostępne są 86/91 spotów, tyle samo co przed zmianą, każdy z pełnym
  profilem i horyzontem. Sprawdzone dane wgrano do obu lokalnych podglądów.
  Odpowiedzi `/data/nearshore/jantar.json` i `stegna.json` na portach 8766 i 8769
  potwierdziły nową wersję i właściwe punkty.

Nowy cykl wejść daje dla 09:00 wysokości 1,147 m w Jantarze i 1,208 m w Stegnie,
z ocenami 6,6 i 6,7. Nie należy mieszać tych wysokości z powyższym porównaniem
metody: różnią się także prognozy wejściowe. W 12 godzinach nowego zestawu
kierunki modeli wiatrowych są sprzeczne; ocena pozostaje niedostępna zamiast
otrzymywać wymyślony kierunek wiatru.

Bez zmian pozostają wcześniejsze problemy z geometrią/batymetrią dla Grzybowa,
Łazów, Warszowa/Gazoportu, Mielno Channel i Kołobrzeg Port — mielizny.

## Granice weryfikacji

To kontrola działania oprogramowania i spójności obliczeń, nie walidacja
trafności na pomiarach rzeczywistego morza. Nie ma podstaw do deklarowania
procentowej poprawy trafności. Dla dalszej kalibracji potrzebne są aktualne
pomiary rew, poziomu wody i obserwacje fal. Punkt przy pierwszej izobacie 2 m
jest spójnym punktem odniesienia, nie gwarantowanym miejscem łamania się fali.

Znaczenie `HSIGN`, `TM01`, `QB` i `TRANSP` sprawdzono w
[oficjalnej dokumentacji SWAN](https://swanmodel.sourceforge.io/online_doc/swanuse/node35.html).
Definicja punktu odniesienia jest regułą tej aplikacji, nie zaleceniem SWAN.

Zmiana jest dostępna lokalnie. Nie wykonano commita ani publikacji GitHub Pages/APK.
