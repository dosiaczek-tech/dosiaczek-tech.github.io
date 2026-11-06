// Only crossings explicitly described as a put-in/take-out in a cited guide.
// These are approximate locations of the described access area, not surveyed
// bank landings. A nearby bridge on its own is never sufficient evidence.
const guide = (name, url) => ({ name, url });
export const reviewedCrossings = [
  {
    id: 'guide:strzegowo-kantor', name: 'Strzegowo — rejon wyjścia przy przenosce koło Kantoru', places: ['Strzegowo'], coordinates: [20.2847426, 52.8904637],
    locationUrl: 'https://www.openstreetmap.org/way/374403233', coordinateMethod: 'documented-portage-area',
    source: guide('Kajaki Wkra Arka · przenoska w Strzegowie przy Kantorze Młyńskim', 'https://splywywkra.pl/oferta-splywow-2-dniowych/'),
    landAccess: 'Rejon wyjścia przy przenosce obok Kantoru Młyńskiego, z dojściem od ul. Ciechanowskiej. Lokalizacja orientacyjna według opisu przenoski i kładki OSM. Zakończ przed spiętrzeniem; dokładne miejsce odbioru uzgodnij z operatorem. Nie jest to pinezka wodowania poniżej młyna opisywanego dla trasy do Glinojecka.'
  },
  {
    id: 'psk:chlopowy-most', name: 'Chłopowy — początek szlaku przy przeprawie drogowej', places: ['Chłopowy'], coordinates: [17.8166969, 53.8396002],
    locationUrl: 'https://www.openstreetmap.org/way/146506202',
    source: guide('PSK · wodowanie w Chłopowych, droga Brusy–Czersk', 'https://kajaki.pomorskie.eu/niechwaszcz-chlopowy-debowiec/'),
    landAccess: 'Opis i schemat PSK wskazują start w Chłopowych przy drodze Brusy–Czersk, na km 28 szlaku. Lokalizacja przy przeprawie przez Niechwaszcz, nie przy pobliskim moście na Parzenicy. Dokładnego zejścia i warunków postoju źródło nie precyzuje.'
  },
  {
    id: 'psk:skrzeszewo-dw214', name: 'Skrzeszewo — wodowanie przy moście DW214', places: ['Skrzeszewo, gmina Sierakowice'], coordinates: [17.8417564, 54.4107535],
    locationUrl: 'https://www.openstreetmap.org/way/986278004',
    source: guide('PSK · wskazany start przy moście DW214', 'https://kajaki.pomorskie.eu/bukowina-skrzeszewo-kozin/'),
    landAccess: 'Opis odcinka wskazuje wodowanie przy moście drogi 214 Sierakowice–Bukowina. Pinezka oznacza rejon przeprawy; zejście wybierz według warunków na brzegu, poza konstrukcją mostu.'
  },
  {
    id: 'guide:kuby-mlyny-most', name: 'Kuby-Młyny — zejście przy mostku', places: ['Kuby-Młyny'], coordinates: [20.6733268, 50.7675286],
    locationUrl: 'https://www.google.com/maps/d/viewer?mid=1EPSOJxaKVsK6an7xu_cFuk3LMonCuYs',
    source: guide('Packraft.pl · opis zejścia przy mostku w Kubach-Młynach', 'https://packraft.pl/czarna-nida-packrafting-kuby-mlyny-morawica/'),
    landAccess: 'Relacja opisuje wygodne zejście przy mostku jako miejsce rozpoczęcia spływu. Pinezka z początku linii „Spływ” na mapie autora, w miejscu zakończenia dojścia pieszego. Dojście drogą wiejską.'
  },
  {
    id: 'psk:klanino-dw213', name: 'Kłanino — wodowanie przy DW213', places: ['Kłanino, gmina Krokowa'], coordinates: [18.2272225, 54.7671606],
    locationUrl: 'https://www.openstreetmap.org/way/100275727',
    source: guide('PSK · wskazany start za Kłaninem przy DW213', 'https://kajaki.pomorskie.eu/czarna_woda-czarny_mlyn-ostrowo/'),
    landAccess: 'Wodowanie przy przeprawie DW213 za Kłaninem, zgodnie z opisem szlaku. Górny odcinek jest wąski, latem może zarastać i mieć zbyt mało wody. Dokładne zejście rozpoznaj przy moście.'
  },
  {
    id: 'psk:gac-most', name: 'Gać — zakończenie przy moście drogowym', places: ['Gać'], coordinates: [17.448406, 54.6924553],
    locationUrl: 'https://www.openstreetmap.org/way/84783800',
    source: guide('PSK · zakończenie Łeby przy moście w Gaci', 'https://kajaki.pomorskie.eu/rzeka/leba/'),
    landAccess: 'Opis regionalny wskazuje zakończenie przy moście Gać–Izbica. Pinezka lokalizuje rejon wyjścia, nie dokładny pomost. Zakończ przed Jeziorem Łebsko; opis trasy nie uprawnia do wpłynięcia na jezioro.'
  },
  {
    id: 'psk:stilo-most', name: 'Stilo — wodowanie przy moście na Chełście', places: ['Stilo'], coordinates: [17.7408577, 54.781268],
    locationUrl: 'https://www.openstreetmap.org/way/475446273',
    source: guide('PSK · przewodnik 2024, s. 34–35, Chełst, start Stilo (most, km 12,9)', 'https://kajaki.pomorskie.eu/wp-content/uploads/2024/10/PSK_PRZEWODNIK_20240909_web.pdf#page=19'),
    landAccess: 'Przewodnik wskazuje most w Stilo na km 12,9 jako początek szlaku. Dojście z ul. Cisowej. Pinezka oznacza rejon brzegu przy przeprawie, nie pomiar miejsca postawienia deski.'
  },
  {
    id: 'psk:wolny-dwor-most', name: 'Wolny Dwór — wodowanie przy moście', places: ['Wolny Dwór'], coordinates: [18.42095, 54.0869],
    locationUrl: 'https://www.traseo.pl/trasa/ekajaki-pl-wietcisa-stary-wiec-czysta-woda',
    source: guide('PSK · początek szlaku w Wolnym Dworze; lokalizacja mostu z mapy eKajaki.pl', 'https://kajaki.pomorskie.eu/rzeka/wietcisa/'),
    landAccess: 'Start od Wolnego Dworu zgodnie z opisem PSK, przy moście drogowym oznaczonym na mapie operatora (punkt „Wolny Dwór-most drogowy”). Dojście od ul. Gdańskiej; konkretne zejście sprawdź przy przeprawie.'
  }
].map(record => ({ coordinateAccuracy: 'approximate', coordinateMethod: 'documented-road-crossing',
  conditions: 'Opisane miejsce rozpoczęcia lub zakończenia spływu. Pinezka przybliżona: źródło nie publikuje pomiaru konkretnego zejścia. Warunki dostępu i postoju sprawdź na miejscu.', ...record }));
