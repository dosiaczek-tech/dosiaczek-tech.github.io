// All distinct named itineraries on wierzyca-opis.html, read 2026-10-23 (Poland).
// Repeated names in the two lists are aliases, not additional routes.
export const KAJAKODAJNIA_URL = 'https://www.kajakodajnia.pl/wierzyca-opis.html';
const source = { name: 'Kajakodajnia · opis i odcinki Wierzycy', url: KAJAKODAJNIA_URL };
const tour = slug => ({ name: 'Kajaki.Pomorskie.PL · oferta podlinkowana przez Kajakodajnię', url: `https://kajaki.pomorskie.pl/tour/splyw-wierzyca-${slug}/` });
const points = {
  pogodki: { name: 'Pogódki — przystań', coordinates: [18.3174795, 54.0228403], source: 'https://maps.app.goo.gl/kpWbEjr2specnRjt7' },
  czarnocin: { name: 'Czarnocin — przystań', coordinates: [18.4185341, 54.0416726], source: 'https://maps.app.goo.gl/Hd3b8hki9fy7GQHW6' },
  kreg: { name: 'Kręgski Młyn — most', coordinates: [18.47198, 53.990581], source: 'https://maps.app.goo.gl/1rmpQpwZyZaL8Pgc7' },
  starogard: { name: 'Starogard Gdański — stanica ZHP', coordinates: [18.525058, 53.969782], source: 'https://maps.app.goo.gl/c3UT5gaABYoGErCU7' },
  zabno: { name: 'Żabno — przystań', coordinates: [18.4797986, 53.9717508], source: 'https://www.openstreetmap.org/way/1135631607' },
  nowaWies: { name: 'Nowa Wieś Rzeczna — tama na Wierzycy, punkt zwrotu', coordinates: [18.4856252, 53.970565], source: 'https://www.openstreetmap.org/way/710684650' },
  owidz: { name: 'Grodzisko Owidz', coordinates: [18.5751223, 53.9551655], source: 'https://www.openstreetmap.org/node/7801992230' },
  kolincz: { name: 'Kolincki Młyn — przystań Kolincz', coordinates: [18.6262076, 53.9628084], source: 'https://maps.app.goo.gl/gRr3GZbsVqgvBpWQ6' },
  klonowka: { name: 'Klonówka — przystań', coordinates: [18.643972, 53.9771533], source: 'https://www.openstreetmap.org/node/8617613662' },
  rajkowski: { name: 'Rajkowski Młyn — przystań', coordinates: [18.6718669, 53.9682072], source: 'https://maps.app.goo.gl/k3dfyeBtEKFhyVmt9' },
  baczek: { name: 'Bączek', query: 'Bączek, gmina Skarszewy' },
  pelplin: { name: 'Pelplin', query: 'Pelplin' },
  stocki: { name: 'Stocki Młyn', query: 'Stocki Młyn, gmina Pelplin' },
  brody: { name: 'Brody Pomorskie', query: 'Brody Pomorskie, gmina Gniew' },
  gniew: { name: 'Gniew', query: 'Gniew' },
  klincz: { name: 'Wielki Klincz', query: 'Wielki Klincz, gmina Kościerzyna' },
  podles: { name: 'Wielki Podleś', query: 'Wielki Podleś' },
  bartoszylas: { name: 'Bartoszylas', query: 'Bartoszylas, gmina Stara Kiszewa' },
  maliki: { name: 'Maliki Dolne', query: 'Maliki Dolne, gmina Stara Kiszewa' }
};
const notes = {
  easy: 'Łagodniejszy charakter opisany dla kajaków sprzyja turystycznemu SUP. Uwzględnij płycizny i zanurzenie statecznika; punkty na mapie są orientacyjne.',
  moderate: 'Na SUP potrzebne są sprawne manewry i możliwość przenoszenia deski przy budowlach wodnych. Ocena wynika z opisu kajakowego, nie z terenowego przeglądu dla SUP.',
  advanced: 'Techniczny odcinek na SUP: powalone drzewa i szybszy nurt wymagają doświadczenia na wodzie płynącej oraz rozpoznania możliwości obejścia przeszkód.',
  unknown: 'Na wskazanej stronie podano ten odcinek i kilometraż, ale brakuje szczegółowej charakterystyki. Brak danych do rzetelnej oceny poziomu SUP.'
};
const records = [];
function add(r) {
  records.push({
    id: `wierzyca-${r.id}`, river: 'Wierzyca', from: r.from, to: r.to,
    region: r.region ?? 'Kociewie', province: 'pomorskie', areas: ['pomorze'],
    collection: 'kajakodajnia-wierzyca', aliases: r.aliases ?? [], sourceReferences: r.refs,
    lengthKm: r.km, ...(r.estimated ? { lengthEstimated: true } : {}),
    lengthNote: r.lengthNote ?? `Około ${r.km} km według Kajakodajni; odległość zależy od dokładnego miejsca wodowania i zakończenia.`,
    difficulty: r.level, sourceDifficulty: r.grade, type: 'river', obstacles: r.logs,
    character: r.character, description: r.description,
    current: r.current ?? 'Brak szczegółowej informacji o nurcie tego odcinka w zestawieniu źródłowym.',
    obstacleNote: r.hazards, portages: r.portages, supNote: r.sup ?? notes[r.level],
    source, additionalSources: r.tour ? [tour(r.tour)] : [], accessedAt: '2026-10-23',
    ...(r.duration ? { sourceDuration: `${r.duration} kajakiem`, tripKind: 'day' } : {}),
    ...(r.accessNote ? { accessNote: r.accessNote } : {}),
    map: { rivers: ['Wierzyca rzeka, pomorskie'], places: r.points.map(key => points[key]), bounds: [16.2, 53.25, 19, 54.9], ...(r.via ? { followWaypoints: true } : {}) }
  });
}

// 11 itineraries in the "Lista obsługiwanych przez nas odcinków" section.
add({ id: 'pogodki-czarnocin', from: 'Pogódki', to: 'Czarnocin', points: ['pogodki', 'czarnocin'], km: 11, duration: 'około 3 h', level: 'easy', grade: 'Łatwy (podlinkowana oferta)', logs: 'some', refs: ['obsługiwane-1'], tour: 'pogodki-czarnocin',
  character: 'Łagodny, meandrujący odcinek',
  description: 'Od przystani w Pogódkach przez łąki, pola i fragmenty lasu do przystani w Czarnocinie. Źródło poleca odcinek również początkującym kajakarzom.',
  current: 'Spokojny nurt', hazards: 'Pojedyncze powalone drzewa opisane jako niewielkie urozmaicenie.', portages: 'Brak stałych przenosek wskazanych w opisie tego wariantu.' });
add({ id: 'czarnocin-kregski-mlyn', from: 'Czarnocin', to: 'Kręgski Młyn', points: ['czarnocin', 'kreg'], km: 15, duration: '4–6 h (różne części źródła)', level: 'advanced', grade: 'Trudny; dla zaawansowanych', logs: 'many', refs: ['obsługiwane-2', 'odcinki-5', 'opis-czarnocin-kregski'], aliases: ['Czarnocin – Krąg'], tour: 'czarnocin-kregski-mlyn',
  character: 'Silny nurt i leśne zwałki',
  description: 'Przez Czarnocińskie Piece, Zapowiednik i Bączek do Kręgskiego Młyna. Za Zapowiednikiem nurt przyspiesza, a najbardziej wymagający fragment zaczyna się w okolicy Bączka.',
  current: 'Miejscami silny, z bystrzem przy Bączku', hazards: 'Mnóstwo zwalonych drzew i ciasne przejścia w nurcie.', portages: 'Elektrownia Czarnocińskie Piece; dodatkowe obejścia przy drzewach zależnie od warunków.', lengthNote: 'Około 15 km. Druga lista na tej samej stronie nazywa metę „Krąg”; szczegółowy opis i oferta wskazują Kręgski Młyn.' });
add({ id: 'baczek-starogard', from: 'Bączek', to: 'Starogard Gdański', points: ['baczek', 'starogard'], km: 15, duration: '5–6 h', level: 'advanced', grade: 'Trudny (podlinkowana oferta)', logs: 'many', refs: ['obsługiwane-3', 'odcinki-6'], tour: 'baczek-starogard',
  character: 'Zwałkowy początek, spokojniejszy finał',
  description: 'Pierwszy fragment do Kręgskiego Młyna jest techniczny i pełen przeszkód. Dalej rzeka łagodnieje, przechodzi w rozlewisko i ponownie w leśne koryto za Nową Wsią. Meta przy stanicy ZHP.',
  current: 'Silniejszy przed Kręgskim Młynem, dalej zmienny', hazards: 'Powalone drzewa, bystrza i wąskie przejścia.', portages: 'Nowa Wieś Rzeczna — około 120 m według oferty; możliwe obejścia zwałek.', lengthNote: 'Pierwsza lista i podlinkowana oferta podają około 15 km, druga lista 14 km. Zachowano 15 km dla wariantu do stanicy ZHP.' });
add({ id: 'kregski-mlyn-starogard', from: 'Kręgski Młyn', to: 'Starogard Gdański', points: ['kreg', 'starogard'], km: 8, duration: 'około 3 h', level: 'moderate', grade: 'Łatwy kajakowo, z przenoską i naturalnymi przeszkodami', logs: 'some', refs: ['obsługiwane-4', 'odcinki-7'], aliases: ['Krąg – Starogard'], tour: 'kregski-mlyn-starogard',
  character: 'Rozlewisko, elektrownia i park',
  description: 'Od Kręgskiego Młyna przez rozlewisko koło Żabna i elektrownię w Nowej Wsi Rzecznej do harcówki w Starogardzie. Za elektrownią rzeka zwęża się i płynie lasem.',
  current: 'Leniwy na rozlewisku, szybszy za tamą', hazards: 'Możliwe drzewa w nurcie za elektrownią.', portages: 'Nowa Wieś Rzeczna — około 100–150 m według opisów.', lengthNote: 'Lista obsługiwanych tras i oferta podają 8 km. Druga lista używa nazwy „Krąg–Starogard” i 10 km; różnicę zachowano jako informację o wariancie.', accessNote: 'Meta przy stanicy ZHP przed dalszą częścią miejskiego odcinka. Kontynuacja przez centrum wymaga kolejnej przenoski.' });
add({ id: 'kregski-mlyn-zabno', from: 'Kręgski Młyn', to: 'Żabno', points: ['kreg', 'zabno', 'nowaWies', 'zabno'], via: true, km: 4, duration: 'około 1 h', level: 'easy', grade: 'Łatwy', logs: 'low', refs: ['obsługiwane-5'], aliases: ['Krąg – Żabno'], tour: 'krag-zabno',
  character: 'Rozlewisko z częściowym powrotem',
  description: 'Spokojny wariant przez rozlewisko przed elektrownią Nowa Wieś Rzeczna. Podlinkowana oferta prowadzi najpierw w stronę tamy, a następnie około 500 m z powrotem do przystani w Żabnie.',
  current: 'Leniwy nurt na rozlewisku', hazards: 'Brak opisanych trudnych przeszkód na tym wariancie.', portages: 'Brak — trasa zawraca przed tamą.', lengthNote: 'Około 4 km obejmuje dopłynięcie w okolice tamy i częściowy powrót. Nie jest to wyłącznie najkrótszy odcinek Kręgski Młyn–Żabno.', accessNote: 'Zawrócenie przed tamą, bez jej przekraczania. Mapa uwzględnia odcinek powrotny; kotwica zwrotu jest orientacyjna.' });
add({ id: 'owidz-kolincki-mlyn', from: 'Owidz', to: 'Kolincki Młyn', points: ['owidz', 'kolincz'], km: 14, duration: '5–6 h', level: 'advanced', grade: 'Średni / średnio trudny', logs: 'many', refs: ['obsługiwane-6', 'odcinki-9', 'opis-owidz-kolincki'], aliases: ['Kajakodajnia', 'Grodzisko Owidz', 'Kolincz'], tour: 'owidz-kolincki-mlyn',
  character: 'Leśne meandry i pnie',
  description: 'Z okolic Grodziska Owidz przez Barchnowy do rozlewiska przed elektrownią Kolincz. Rzeka prowadzi przez lasy i liczne naturalne przeszkody.',
  current: 'Zmienny, zależny także od pracy elektrowni w Owidzu', hazards: 'Dużo zwalonych drzew i konarów wymagających manewrów.', portages: 'Elektrownia Owidz po prawej stronie; niektóre warianty startują już za nią.', lengthNote: 'Lista obsługiwanych tras i oferta: około 14 km. Druga lista i opis Kajakodajni: około 16 km. Mapa wskazuje wariant z rejonu Grodziska Owidz.', accessNote: 'Możliwy także start z bazy Kajakodajni, kilkaset metrów powyżej Grodziska. Meta przed elektrownią Kolincki Młyn.' });
add({ id: 'owidz-klonowka', from: 'Owidz', to: 'Klonówka', points: ['owidz', 'klonowka'], km: 17, duration: 'około 7 h', level: 'advanced', grade: 'Trudny; końcówka tylko dla bardzo wprawnych', logs: 'many', refs: ['obsługiwane-7'], aliases: ['Grodzisko Owidz', 'Kajakodajnia'], tour: 'owidz-klonowka',
  character: 'Długi techniczny odcinek',
  description: 'Wariant przez Barchnowy i Kolincki Młyn, z kontynuacją do Klonówki. Za Kolinczem zaczyna się jeden z najbardziej wymagających fragmentów Wierzycy opisanych przez operatora.',
  current: 'Miejscami mocny, silnie meandrujący', hazards: 'Liczne pnie, szybki nurt i betonowy uskok za elektrownią Kolincz.', portages: 'Elektrownie Owidz i Kolincz oraz jaz za Kolinczem; zakres pierwszej przenoski zależy od startu.' });
add({ id: 'kolincki-rajkowski-mlyn', from: 'Kolincki Młyn', to: 'Rajkowski Młyn', points: ['kolincz', 'rajkowski'], km: 8, duration: 'około 4 h', level: 'advanced', grade: 'Trudny (podlinkowana oferta)', logs: 'many', refs: ['obsługiwane-8'], aliases: ['Kolincz – Rajkowski Młyn'], tour: 'kolincz-rajkowski-mlyn',
  character: 'Techniczny przełom przez Klonówkę',
  description: 'Z Kolincza przez wymagający fragment do Klonówki, dalej do przystani w Rajkowskim Młynie. Krótki dystans nie oddaje liczby przeszkód.',
  current: 'Wartki, liczne zakola i bystrza', hazards: 'Gęste zwałki, drzewa w nurcie i wysoki jaz za Kolinczem.', portages: 'Jaz około 100 m za elektrownią Kolincz oraz tama w Klonówce; start zależnie od strony elektrowni.' });
add({ id: 'klonowka-pelplin', from: 'Klonówka', to: 'Pelplin', points: ['klonowka', 'pelplin'], km: 18, duration: 'około 7 h', level: 'advanced', grade: 'Średni w opisie Kajakodajni, trudny w podlinkowanej ofercie', logs: 'many', refs: ['obsługiwane-9', 'odcinki-10', 'opis-klonowka-pelplin'], tour: 'klonowka-pelplin',
  character: 'Zwałki i meandry Kociewia',
  description: 'Przez Rajkowski Młyn w stronę Pelplina. Źródła opisują wartki nurt, drzewa i utrudnione wychodzenie na brzeg. Kajakodajnia kończy wariant jednodniowy przy Mostku Miłości.',
  current: 'Wartki i silnie meandrujący', hazards: 'Powalone drzewa, zarośnięte brzegi, miejscami ciasne przejścia.', portages: 'Przy zakończeniu przed miejskimi tamami nie trzeba pokonywać dwóch dalszych piętrzeń w Pelplinie.', accessNote: 'Dokładna meta różni się między opisami: Mostek Miłości albo miejsce przed tamą. Dalszy spływ przez Pelplin wymaga przenosek.' });
add({ id: 'klonowka-rajkowski-mlyn', from: 'Klonówka', to: 'Rajkowski Młyn', points: ['klonowka', 'rajkowski'], km: 5, duration: 'około 2 h', level: 'advanced', grade: 'Średnio trudny (podlinkowana oferta)', logs: 'many', refs: ['obsługiwane-10'], tour: 'klonowka-rajkowski-mlyn',
  character: 'Krótko, ale ze zwałkami',
  description: 'Od przystani przy elektrowni w Klonówce do pomostu Rajkowskiego Młyna. Las, łąki i pola towarzyszą krętej rzece.',
  current: 'Wartki', hazards: 'Liczne zwalone drzewa wymagające manewrowania.', portages: 'Źródło nie podaje stałych przenosek po rozpoczęciu spływu poniżej elektrowni; możliwe obejścia drzew.' });
add({ id: 'rajkowski-mlyn-pelplin', from: 'Rajkowski Młyn', to: 'Pelplin', points: ['rajkowski', 'pelplin'], km: 13, duration: 'około 5 h', level: 'advanced', grade: 'Trudny (podlinkowana oferta)', logs: 'many', refs: ['obsługiwane-11'], tour: 'rajkowski-mlyn-pelplin',
  character: 'Leśna dolina i Diabelski Kamień',
  description: 'Meandrujący odcinek przez lasy, łąki i pola, z ograniczonym dostępem z lądu. Po drodze okolice Diabelskiego Kamienia, na końcu Pelplin.',
  current: 'Wartki', hazards: 'Liczne powalone drzewa oraz roślinność ograniczająca koryto.', portages: 'Meta przed tamą w Pelplinie; opis nie podaje stałych przenosek po drodze, możliwe obejścia pni.' });

// Nine additional itineraries from the second list; its five repetitions are
// represented above, with the alternate distances and place names retained.
add({ id: 'wielki-klincz-wielki-podles', from: 'Wielki Klincz', to: 'Wielki Podleś', points: ['klincz', 'podles'], km: 13, duration: 'około 4 h', level: 'unknown', grade: 'Nie podano osobnej oceny w zestawieniu', logs: 'unknown', refs: ['odcinki-1'], aliases: ['Wlk. Klincz – Wlk. Podleś'], region: 'Kaszuby / Kociewie',
  character: 'Górna Wierzyca — do rozpoznania',
  description: 'Pierwszy etap wymieniony w liście Kajakodajni. Strona podaje punkty, około 13 km i 4 godziny, ale nie rozwija charakterystyki tego fragmentu.',
  hazards: 'Brak danych o ilości zwałek i rodzaju przeszkód dla tego odcinka.', portages: 'Nie podano liczby ani lokalizacji.', accessNote: 'W źródle brak dokładnego miejsca startu w okolicy Wielkiego Klincza; punkty mapy mają charakter orientacyjny.' });
add({ id: 'wielki-podles-bartoszylas', from: 'Wielki Podleś', to: 'Bartoszylas', points: ['podles', 'bartoszylas'], km: 19, duration: 'około 6 h', level: 'unknown', grade: 'Nie podano osobnej oceny w zestawieniu', logs: 'unknown', refs: ['odcinki-2'], aliases: ['Wlk. Podleś – Bartoszylas'], region: 'Kaszuby / Kociewie',
  character: 'Górny etap Wierzycy',
  description: 'Drugi etap listy źródłowej, łączący Wielki Podleś z Bartoszym Lasem. Dostępny opis ogranicza się do punktów, dystansu i orientacyjnego czasu.',
  hazards: 'Brak szczegółowych danych o przeszkodach na tym etapie.', portages: 'Nie podano liczby ani lokalizacji.' });
add({ id: 'bartoszylas-maliki', from: 'Bartoszylas', to: 'Maliki', points: ['bartoszylas', 'maliki'], km: 16, duration: 'około 5 h', level: 'unknown', grade: 'Nie podano osobnej oceny w zestawieniu', logs: 'unknown', refs: ['odcinki-3'], aliases: ['Bartoszy Las', 'Maliki Dolne', 'Maliki Górne'],
  character: 'Etap w stronę Malików',
  description: 'Trzeci odcinek wskazany przez Kajakodajnię. Lista podaje około 16 km i 5 godzin; szczegółowy opis na stronie zaczyna się dopiero od Malików.',
  hazards: 'Brak osobnego opisu zwałek i nurtu tego odcinka.', portages: 'Nie podano liczby ani lokalizacji.', accessNote: 'Mapa wskazuje okolice Malików Dolnych; w źródle ogólna nazwa Maliki.' });
add({ id: 'maliki-czarnocin', from: 'Maliki (Górne / Dolne)', to: 'Czarnocin', points: ['maliki', 'czarnocin'], km: 16, duration: '4–5 h', level: 'easy', grade: 'Łatwy', logs: 'unknown', refs: ['odcinki-4', 'opis-maliki-czarnocin'],
  character: 'Łagodny odcinek bez przenosek',
  description: 'Kajakodajnia opisuje go jako jeden z najłatwiejszych fragmentów Wierzycy. Możliwy start w Malikach Dolnych albo Górnych; meta przy pomoście za mostem w Czarnocinie.',
  current: 'Łagodny charakter według opisu', hazards: 'Źródło nie podaje liczby zwałek ani szczegółowej inwentaryzacji przeszkód.', portages: 'Brak według Kajakodajni.', lengthNote: 'Około 16 km dla wariantu Maliki–Czarnocin. W źródle dwa możliwe miejsca startu; mapa przyjmuje Maliki Dolne.' });
add({ id: 'starogard-owidz', from: 'Starogard Gdański', to: 'Owidz', points: ['starogard', 'owidz'], km: 7, duration: 'około 1 h w liście źródłowej', level: 'moderate', grade: 'Fragment łatwego odcinka Kręgski Młyn–Owidz; brak osobnej oceny', logs: 'some', refs: ['odcinki-8'], aliases: ['Grodzisko Owidz', 'Kajakodajnia'],
  character: 'Z miasta do grodziska',
  description: 'Z rejonu parku miejskiego i stanicy ZHP przez Starogard do Grodziska Owidz. Źródło opisuje także możliwość wodowania niżej, przy pomoście za jazem poniżej stadionu.',
  current: 'Zmienny, lokalne bystrza i płycizny', hazards: 'Miejskie piętrzenie, płycizny przy stadionie, skalne bystrze i jaz.', portages: 'Przy starcie z parku — miejskie piętrzenie; przy starcie poniżej jazu część przeszkód zostaje pominięta.', lengthNote: 'Około 7 km w liście. Długość zależy od miejsca startu w Starogardzie oraz mety w bazie Kajakodajni albo przy Grodzisku Owidz.' });
add({ id: 'pelplin-stocki-mlyn', from: 'Pelplin', to: 'Stocki Młyn', points: ['pelplin', 'stocki'], km: 9, duration: 'około 2 h', level: 'easy', grade: 'Spokojny fragment w opisie Pelplin–Gniew; całość oceniona jako średnia', logs: 'unknown', refs: ['odcinki-11'],
  character: 'Spokojniejsza dolna Wierzyca',
  description: 'Od pola biwakowego w pobliżu bazyliki do Stockiego Młyna. Według Kajakodajni przed Stockim Młynem rzeka nie sprawia większych trudności.',
  current: 'Raczej spokojny', hazards: 'Brak osobnej informacji o ilości zwałek; na końcu elektrownia Stocki Młyn.', portages: 'Zakończenie przed Stockim Młynem omija tamtejszą przenoskę; dalszy spływ jej wymaga.' });
add({ id: 'pelplin-brody', from: 'Pelplin', to: 'Brody Pomorskie', points: ['pelplin', 'brody'], km: 18, duration: 'około 6 h', level: 'moderate', grade: 'Średni w opisie obejmującego go odcinka Pelplin–Gniew', logs: 'some', refs: ['odcinki-12'], aliases: ['Pelplin – Brody'],
  character: 'Przez Stocki Młyn',
  description: 'Spokojniejszy początek do Stockiego Młyna, następnie trudniejszy fragment do biwaku w Brodach Pomorskich. Wyjście na biwak znajduje się przed mostem.',
  current: 'Zmienny, trudniejszy za Stockim Młynem', hazards: 'Piętrzenie w Stockim Młynie i możliwe płycizny poniżej tamy.', portages: 'Stocki Młyn, prawym brzegiem przez drogę.' });
add({ id: 'stocki-mlyn-gniew', from: 'Stocki Młyn', to: 'Gniew', points: ['stocki', 'gniew'], km: 20, duration: 'około 7 h', level: 'moderate', grade: 'Średni w opisie obejmującego go odcinka Pelplin–Gniew', logs: 'some', refs: ['odcinki-13'],
  character: 'Dolna Wierzyca pod zamek',
  description: 'Przez Brody Pomorskie i Brodzkie Młyny do Gniewu. Końcówka prowadzi przez bystrze pod drogą w rejon zamku i ujścia do Wisły.',
  current: 'Zmienny, bystrze przy wjeździe do Gniewu', hazards: 'Niska woda poniżej Stockiego Młyna, zapora w Brodzkich Młynach i stromy brzeg niektórych wyjść w Gniewie.', portages: 'Stocki Młyn zależnie od miejsca startu oraz Brodzkie Młyny.', accessNote: 'W Gniewie źródło opisuje różne miejsca zakończenia, w tym port przez krótki fragment Wisły. Mapa pokazuje orientacyjną metę nad Wierzycą.' });
add({ id: 'brody-gniew', from: 'Brody Pomorskie', to: 'Gniew', points: ['brody', 'gniew'], km: 10, duration: 'około 3 h', level: 'moderate', grade: 'Dla wprawnych kajakarzy; fragment średniego odcinka Pelplin–Gniew', logs: 'some', refs: ['odcinki-14'],
  character: 'Ostatni etap Wierzycy',
  description: 'Od biwaku przed mostem w Brodach przez elektrownię Brodzkie Młyny do Gniewu. W finale widok na zamek i okolice ujścia Wierzycy.',
  current: 'Miejscami bystry', hazards: 'Zapora w Brodzkich Młynach, bystrze pod drogą i wymagające wyjście na brzeg przy kładce w Gniewie.', portages: 'Brodzkie Młyny, prawym brzegiem przez drogę.' });

// Three further named variants in the detailed descriptions.
add({ id: 'kregski-mlyn-owidz', from: 'Kręgski Młyn', to: 'Owidz', points: ['kreg', 'owidz'], km: 15, duration: '4–5 h', level: 'moderate', grade: 'Łatwy w opisie Kajakodajni, z miejskimi przeszkodami', logs: 'some', refs: ['opis-kregski-owidz'], aliases: ['Krąg', 'Kajakodajnia', 'Grodzisko Owidz'],
  character: 'Rozlewisko, Starogard i grodzisko',
  description: 'Dłuższy wariant przez Żabno, Nową Wieś Rzeczną i park w Starogardzie. Po miejskich przeszkodach dalszy spływ do bazy Kajakodajni lub Grodziska Owidz.',
  current: 'Od leniwego rozlewiska po miejscowe bystrza', hazards: 'Drzewa za Nową Wsią, płycizny, bystrze i jaz przy stadionie w Starogardzie.', portages: 'Nowa Wieś Rzeczna oraz piętrzenie w centrum Starogardu; jaz za stadionem wymaga osobnego rozpoznania na SUP.', accessNote: 'Mapa kończy odcinek w rejonie Grodziska Owidz; baza Kajakodajni znajduje się kilkaset metrów wcześniej.' });
add({ id: 'pelplin-gniew', from: 'Pelplin', to: 'Gniew', points: ['pelplin', 'gniew'], km: 30, duration: 'około 10 h; źródło zaleca podział na etapy', level: 'moderate', grade: 'Średni', logs: 'some', refs: ['opis-pelplin-gniew'],
  character: 'Cała dolna Wierzyca',
  description: 'Długi odcinek przez Stocki Młyn, Brody Pomorskie i Brodzkie Młyny. Kajakodajnia proponuje podzielenie go na krótsze etapy z różnymi miejscami startu i zakończenia.',
  current: 'Spokojniejszy przed Stockim Młynem, dalej miejscami szybszy', hazards: 'Piętrzenia, płycizny poniżej Stockiego Młyna i bystrze w Gniewie.', portages: 'Stocki Młyn oraz Brodzkie Młyny. Przy starcie powyżej miejskich piętrzeń w Pelplinie dochodzą tamtejsze przenoski.', lengthNote: 'Cały opis podaje około 30 km. Krótsze etapy na stronie mają orientacyjne wartości, które nie zawsze sumują się do dokładnie 30 km.' });
add({ id: 'stocki-mlyn-brody', from: 'Stocki Młyn', to: 'Brody Pomorskie', points: ['stocki', 'brody'], km: 9, estimated: true, level: 'moderate', grade: 'Fragment średniego odcinka Pelplin–Gniew; brak osobnej oceny', logs: 'unknown', refs: ['wariant-stocki-brody'],
  character: 'Łącznik dwóch dolnych etapów',
  description: 'Wariant wprost wymieniony przez Kajakodajnię w opisie Pelplin–Gniew. Pozwala zakończyć dzień na biwaku w Brodach Pomorskich, przed mostem.',
  current: 'Trudniejszy fragment za Stockim Młynem według opisu całości', hazards: 'Możliwa niska woda bezpośrednio poniżej tamy; brak osobnego opisu zwałek.', portages: 'Stocki Młyn — zależnie od tego, po której stronie tamy zaczyna się spływ.',
  lengthNote: 'SZACUNEK, nie osobny kilometraż opublikowany przez operatora. Wariant został nazwany bez długości. Różnica Pelplin–Brody 18 km minus Pelplin–Stocki Młyn 9 km daje około 9 km; alternatywna różnica 20−10 daje 10 km. W katalogu przyjęto orientacyjnie 9 km.' });

export const kajakodajniaRoutes = records;
