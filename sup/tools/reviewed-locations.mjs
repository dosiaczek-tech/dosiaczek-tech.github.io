// Location pins cross-checked with the regional directory, not viewport centres
// or settlement geocodes. URLs carry the actual place identifier/coordinates.
import { recoverPlusCode } from './plus-code.mjs';
import { reviewedCrossings } from './reviewed-crossings.mjs';
export const reviewedLocations = [
  ...reviewedCrossings,
  {
    id: 'guide:konradowo-before', name: 'Konradowo — wyjście przed elektrownią', places: [], coordinates: [17.22235, 54.32517], kind: 'portage-access', coordinateAccuracy: 'approximate', coordinateMethod: 'documented-portage-area',
    locationUrl: 'https://www.openstreetmap.org/node/2000680167',
    source: { name: 'Włocławski Klub Wodniaków PTTK · Konradowo, przenoska prawym brzegiem, km 62,8', url: 'https://www.wkw.wloclawek.pttk.pl/kajszlor_slupia.html' },
    landAccess: 'Orientacyjny rejon wyjścia po prawej stronie przed elektrownią Konradowo. Przewodnik opisuje przenoskę prawym brzegiem około 150 m w dół. Wybierz oznaczone wyjście przed urządzeniami elektrowni.',
    conditions: 'Dostęp pieszy na potrzeby przenoski, nie potwierdzenie dojazdu samochodem. Współrzędne przybliżone względem koryta OSM; kieruj się aktualnymi oznaczeniami przenoski.'
  },
  {
    id: 'guide:konradowo-after', name: 'Konradowo — ponowne wodowanie za elektrownią', places: [], coordinates: [17.22510, 54.32541], kind: 'portage-access', coordinateAccuracy: 'approximate', coordinateMethod: 'documented-portage-area',
    locationUrl: 'https://www.openstreetmap.org/node/6396908914',
    source: { name: 'Włocławski Klub Wodniaków PTTK · Konradowo, koniec przenoski prawym brzegiem', url: 'https://www.wkw.wloclawek.pttk.pl/kajszlor_slupia.html' },
    landAccess: 'Orientacyjny rejon powrotu na wodę poniżej elektrowni, po przeniesieniu sprzętu prawym brzegiem. Osobny punkt od wyjścia przed elektrownią; odcinek lądowy nie jest rysowany jako trasa wodna.',
    conditions: 'Dostęp pieszy na potrzeby przenoski, nie potwierdzenie dojazdu samochodem. Konkretne zejście ustal według oznaczeń na miejscu; pinezka nie jest pomiarem pomostu.'
  },
  {
    id: 'place:dolinka-przystan', name: 'Dolinka — przystań przy polu namiotowym', places: ['Dolinka'], coordinates: [17.2069014, 53.7911388], status: 'conditional',
    locationUrl: 'https://www.google.com/maps/place/Pole+Namiotowe+Dolinka/data=!4m7!3m6!1s0x4702248e07a0fc85:0xa18b413c3e1716b8!8m2!3d53.7911388!4d17.2069014!16s%2Fg%2F11g8xhrc1z',
    source: { name: 'PSK · przystań w Dolince, 300 m przed jeziorem Szczytno', url: 'https://kajaki.pomorskie.eu/brda-dolinka-jezioro_szczytno-jezioro_krepsko-przechlewo/' },
    address: 'Dolinka 1/2', landAccess: 'Przystań przy polu namiotowym w Dolince, przed wpływem Brdy do jeziora Szczytno. Opis PSK wskazuje ją jako początek odcinka jeziornego. Pinezka dotyczy terenu obiektu.',
    conditions: 'Dostęp przez teren pola namiotowego. Wodowanie własnego SUP-a, postój i odbiór uzgodnij z zarządcą.'
  },
  {
    id: 'operator:morawica-przystan', name: 'Morawica — przystań przy muszli koncertowej', places: ['Morawica, powiat kielecki'], coordinates: [20.6254946, 50.750938],
    locationUrl: 'https://www.google.com/maps/place/Przysta%C5%84+kajakowa+na+Czarnej+Nidzie/data=!4m7!3m6!1s0x47178f91388dd5cf:0xc166447dedc5506b!8m2!3d50.750938!4d20.6254946!16s%2Fg%2F11hkpz4nt2',
    source: { name: 'KAJARK · wskazane miejsce startu koło muszli koncertowej', url: 'https://www.kajaki-nida.pl/szlaki-kajakowe/' },
    address: 'Spacerowa 6, Morawica', landAccess: 'Przystań na Czarnej Nidzie w rejonie muszli koncertowej — miejsce startu wskazane w ofercie KAJARK.'
  },
  {
    id: 'operator:kajark-nida', name: 'Ostrów / Nida — przystań KAJARK', places: ['Ostrów, gmina Chęciny'], coordinates: [20.532246, 50.759373], status: 'conditional',
    locationUrl: 'https://www.google.com/maps/dir//50.759373,20.532246/',
    source: { name: 'KAJARK · przystań i mapa dojazdu', url: 'https://www.kajaki-nida.pl/szlaki-kajakowe/' },
    address: 'Nida 86, Nida', landAccess: 'Przystań operatora przy odcinku opisywanym jako Morawica–Ostrów. Dokładne położenie z mapy dojazdu podanej przez KAJARK.',
    conditions: 'Obiekt operatora. Wodowanie, odbiór i postój z własną deską po uzgodnieniu.'
  },
  {
    id: 'operator:mackowa-ruda-roxi', name: 'Maćkowa Ruda — baza AS-TOUR / U Roxi', places: ['Maćkowa Ruda'], coordinates: recoverPlusCode('352F+QM', [23.174, 54.052]), status: 'conditional',
    locationUrl: 'https://www.google.com/maps/search/?api=1&query=Pole+Namiotowe+u+Roxi+Ma%C4%87kowa+Ruda',
    source: { name: 'AS-TOUR · baza i pole U Roxi, start odcinka do Frącek', url: 'https://www.splywy.pl/czarna_hancza/' },
    address: 'Maćkowa Ruda 41–42', coordinateNote: 'Pinezka terenu biwaku z kodu 352F+QM (około 14 m), nie indywidualnego pomostu.',
    landAccess: 'Baza i pole U Roxi wskazane przez operatora jako miejsce rozpoczęcia i zakończenia etapów. Zejście do rzeki przez teren bazy.',
    conditions: 'Teren operatora. Korzystanie z własnym SUP-em, parking i odbiór wymagają uzgodnienia z obsługą.'
  },
  {
    id: 'operator:biezany-agro-kajak', name: 'Bieżany — wodowanie przy bazie AGRO-KAJAK', places: ['Bieżany, gmina Radzanów'], coordinates: recoverPlusCode('W5MF+44', [20.173, 52.933]), status: 'conditional',
    projectToRiver: 'Wkra', maxProjectionKm: .2,
    locationUrl: 'https://maps.app.goo.gl/woNn4Ku7QRyc3ZGD9',
    source: { name: 'AGRO-KAJAK · baza i własne pole namiotowe, odcinek Bieżany–Strzegowo', url: 'https://www.kajaki-wkra.pl/splywy-kajakowe-rzeka-wkra-100-km-od-warszawy/' },
    address: 'Bieżany 9',
    landAccess: 'Wodowanie przez bazę AGRO-KAJAK i jej teren nad Wkrą. Pinezka na rzece jest orientacyjna, wyznaczona przy położeniu bazy; konkretne zejście wskaże obsługa.',
    conditions: 'Obiekt operatora. Korzystanie z własną deską i parking po uzgodnieniu.'
  },
  {
    id: 'psk:mrzezino-moscie-blota', name: 'Mrzezino — przystań Moście Błota', places: ['Mrzezino'], coordinates: recoverPlusCode('JCPQ+QG', [18.439, 54.637]),
    directoryId: 'przystan-koncowa-na-szlaku-kajakowym-redy-w-mrzezinie',
    locationUrl: 'https://www.google.com/maps/search/?api=1&query=Przysta%C5%84+kajakowa+Mo%C5%9Bcie+B%C5%82ota+Mrzezino',
    coordinateNote: 'Środek komórki kodu lokalizacyjnego JCPQ+QG, Mrzezino (dokładność około 14 m).',
    landAccess: 'Przystań końcowa nad Redą, w rejonie Mościch Błot. Nie wymaga dopływania do rezerwatu Beka.'
  },
  {
    id: 'place:wieprznica-przystan', name: 'Wieprznica — przystań kajakowa', places: ['Wieprznica'], coordinates: recoverPlusCode('4WWF+83', [17.922, 54.145]),
    locationUrl: 'https://www.google.com/maps/search/?api=1&query=Przysta%C5%84+Kajakowa+Wieprznica',
    address: 'Wieprznica 5, 83-407 Wieprznica', coordinateNote: 'Środek komórki kodu lokalizacyjnego 4WWF+83, Wieprznica (dokładność około 14 m).',
    landAccess: 'Przystań przy Wieprznicy 5, w rejonie wypływu Granicznej. Dojazd i korzystanie z własnym sprzętem ustal z zarządcą.'
  },
  {
    id: 'place:ostrowo-czarna-woda', name: 'Ostrowo — przystań na Czarnej Wodzie', places: ['Ostrowo, gmina Władysławowo'], coordinates: [18.2347338, 54.8310015],
    directoryId: 'przystan-kajakowa-w-ostrowie',
    locationUrl: 'https://www.google.com/maps/place/Przysta%C5%84+kajakowa+-+Czarna+Woda/data=!4m7!3m6!1s0x46fc35f15f113f2d:0x66abe03ddfd1acf7!8m2!3d54.8310015!4d18.2347338!16s%2Fg%2F11q8t5r5sx',
    landAccess: 'Miejsce przy DW215 i parku linowym, opisane jako przystań na Czarnej Wodzie. Zakończenie przed odcinkiem morskim.'
  },
  {
    id: 'psk:bartoszylas', name: 'Bartoszylas — przystań kajakowa', places: ['Bartoszylas'], coordinates: [18.0996782, 53.9895364],
    directoryId: 'przystan-kajakowa-bartoszylas-w-przygotowaniu',
    locationUrl: 'https://www.google.com/maps/place/Przysta%C5%84+Kajakowa+Bartoszylas/data=!4m7!3m6!1s0x47027d0000ab07ab:0x51b37273855017fb!8m2!3d53.9895364!4d18.0996782!16s%2Fg%2F11zh8_x7j5',
    landAccess: 'Przystań i miejsce biwakowe w rejonie boiska, Bartoszylas 13. Aktualne zasady korzystania ustal z zarządcą.'
  }
];
