# Katalog kamer polskiego wybrzeża

Ostatnie uzupełnienie i porównanie źródeł: **20.10.2026**.

## Aktualizacja 20.10.2026

Katalog zawiera **128 źródeł transmisji**: 88 WebCamera i 40 Nadmorski24.
Porównano trzy poniższe kategorie WebCamera z aktualnym katalogiem
[Nadmorski24](https://nadmorski24.pl/kamery). Identyczne identyfikatory
transmisji WebCamera pominięto; niezależne źródła obu dostawców zachowano
i oznaczono nazwą dostawcy. Różne źródła mogą pokazywać to samo miejsce.

- Dodano 40 źródeł Nadmorski24 z miejscowości nad Bałtykiem i Zatoką Pucką:
  Białogóra, Chałupy, Chłapowo, Dębki, Gdańsk, Gdynia, Hel, Jastarnia,
  Jastrzębia Góra, Jurata, Karwia, Kołobrzeg, Puck, Rewa, Sopot,
  Świnoujście i Władysławowo.
- Przywrócono trzy działające źródła WebCamera: Gdynia — plaża i marina,
  Krynica Morska — panorama plaży oraz Ustka — port i plaża z pylonu.
- Darłowo — plaża w Darłówku było już dostępne pod `#darlowo-plaza-darlowko`.
- Dla wszystkich 43 dodanych źródeł pobrano playlistę HLS, listę segmentów
  i segment obrazu (HTTP 200); sprawdzono CORS dla playlisty i segmentu.
- Serwer `ls.tkchopin.pl` nie przesyła pełnego łańcucha certyfikatu TLS.
  W narzędziu kontrolnym dołączono certyfikaty pośrednie z oficjalnego
  repozytorium Certum, zachowując weryfikację TLS. Aplikacja nie wyłącza
  weryfikacji certyfikatów; dostępność zależy również od przeglądarki.
- W Chrome potwierdzono ruchomy obraz z Pucka — Zatoki Puckiej, Chałup —
  Solar EASY/SURF, Darłowa — portu oraz trzech przywróconych kamer WebCamera,
  bez wyłączania weryfikacji TLS. Sprawdzono wyszukiwanie po dostawcy,
  ulubione, układ mobilny i unikalność identyfikatorów oraz adresów HLS.
- Wolin — Dziwna: odtwarzacz wskazuje serwer `kamera.smslowianin.pl:8181`,
  którego certyfikatu nie udało się zweryfikować; źródła nie dodano.
- Świnoujście — plaża w Nadmorski24: oznaczone przerwą techniczną.
- Pominięto kamery śródlądowe, transmisje kościelne, płatne oraz zbiorcze
  playlisty zmieniające widoki. Zakres dotyczy publicznych kamer wybrzeża
  znalezionych w wymienionych katalogach, nie wszystkich kamer w internecie.

| Region | Źródła |
| --- | ---: |
| Mierzeja Wiślana | 7 |
| Trójmiasto | 20 |
| Półwysep Helski i okolice | 43 |
| Środkowe wybrzeże | 18 |
| Zachodnie wybrzeże | 40 |

## Poprzednia weryfikacja — 21.09.2026

Przejrzano katalogi WebCamera:

- [Plaże i morze](https://www.webcamera.pl/kategoria,plaze-i-morze)
- [Pomorze zachodnie](https://www.webcamera.pl/kategoria,pomorze-zachodnie)
- [Pomorze gdańskie / wschodnie](https://www.webcamera.pl/kategoria,pomorze-gdanskie-wschodnie)
- mapę witryny oraz nadmorskie kamery polecane na stronach poszczególnych transmisji.

Do katalogu trafiło **85 różnych transmisji**. Dla każdej sprawdzono dostępność
publicznej listy HLS, listy segmentów, fragmentu obrazu i nagłówków CORS
umożliwiających odtwarzanie na domenie GitHub Pages. Pięć alternatywnych adresów
prowadziło do już uwzględnionych transmisji; zostały połączone z tymi kamerami.

| Region | Kamery |
| --- | ---: |
| Mierzeja Wiślana | 6 |
| Trójmiasto | 10 |
| Półwysep Helski i okolice | 14 |
| Środkowe wybrzeże | 17 |
| Zachodnie wybrzeże | 38 |

### Stegna i okolice

- [Stegna — plaża, bulwar i morze](https://dosiaczek-tech.github.io/#stegna-plaza)
- [Stegna — drugie ujęcie](https://dosiaczek-tech.github.io/#kamera-stegna-plaza)
- [Jantar — plaża](https://dosiaczek-tech.github.io/#jantar)
- [Kąty Rybackie — plaża](https://dosiaczek-tech.github.io/#katyrybackie)
- [Krynica Morska — plaża](https://dosiaczek-tech.github.io/#krynica-morska-plaza)
- [Krynica Morska — wejście nr 30](https://dosiaczek-tech.github.io/#krynica-morska-kamera)

## Strumienie niedostępne podczas sprawdzania 21.09.2026

Poniższe 20 źródeł dwukrotnie zwróciło HTTP 404 przy pobieraniu transmisji.
Trzy z nich przywrócono 20.10.2026, zgodnie z opisem powyżej.
Pozostałe nadal wymagają ponownej weryfikacji przed dodaniem:

- [Chałupy — Kite.pl](https://chalupy-kitepl.webcamera.pl/)
- [Chałupy — Surf People](https://chalupy-surf-people.webcamera.pl/)
- [Chałupy — Easy Surf](https://chalupy.webcamera.pl/)
- [Chłapowo — plaża](https://chlapowo-plaza.webcamera.pl/)
- [Darłowo — panorama miasta](https://darlowo-panorama-miasto.webcamera.pl/)
- [Darłowo — panorama portu](https://darlowo-panorama-port.webcamera.pl/)
- [Dziwnów — deptak i przystań](https://dziwnow-3.webcamera.pl/)
- [Dziwnówek — deptak](https://www.webcamera.pl/kamera/dziwnowek-deptak/)
- [Gdynia — plaża i marina](https://gdynia-plaza.webcamera.pl/)
- [Gdynia — wejście do portu](https://port-gdynia.webcamera.pl/)
- [Krynica Morska — starszy widok na plażę](https://krynicamorska.webcamera.pl/)
- [Krynica Morska — Zalew Wiślany](https://krynica-morska-mierzeja-wislana.webcamera.pl/)
- [Niechorze — panorama](https://niechorze.webcamera.pl/)
- [Pobierowo — plaża](https://pobierowo.webcamera.pl/)
- [Rewal — deptak](https://rewal.webcamera.pl/)
- [Rowy — port](https://rowy.webcamera.pl/)
- [Sianożęty — plaża](https://sianozety.webcamera.pl/)
- [Sopot — dodatkowy widok na plażę](https://sopot-plaza.webcamera.pl/)
- [Ustka — widok z pylonu](https://ustka-panorama.webcamera.pl/)
- [Władysławowo — widok na półwysep](https://wladyslawowo-polwysep.webcamera.pl/)

Pomijane są też pozycje oznaczone przez dostawcę jako płatne: kamera plaży
w Kuźnicy i dwie zbiorcze playlisty Premium. Katalog dotyczy wybrzeża,
więc rekomendacje z jezior śródlądowych, gór i miast w głębi kraju
nie są uwzględniane.

Dostępność kamer jest zmienna. Datę i wyniki należy odświeżyć przy kolejnej
weryfikacji; strona nie wykonuje automatycznego skanowania serwisu WebCamera.
