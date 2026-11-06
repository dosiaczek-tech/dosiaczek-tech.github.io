# Jantar i Stegna — przypadek regresyjny

Surowe tabele SWAN 41.51AB z 6 listopada 2026, 08:00 UTC (09:00 w Polsce),
wyjęte z lokalnych archiwów `reproducibility/jantar.tar.gz` i `stegna.tar.gz`.
Powtórzone wiersze tej samej godziny na granicach kroków COMPUTE usunięto tak
jak w parserze: zachowano ostatni wiersz dla danego XP. Wartości nie były zmieniane.

Pliki JSON zawierają geometrię i oryginalny przekrój EMODnet z `sources.json`.
Źródło: EMODnet Bathymetry Consortium, DTM 2024, `emodnet:mean` WCS,
[DOI](https://doi.org/10.12770/cf51df64-56f9-4a99-b1aa-36b8d7b743a1).
Daty pobrania oraz hash rastra są zachowane w JSON.

To wyniki modelowe, nie pomiary walidacyjne. Test chroni przed wyborem
wewnętrznego zagłębienia za rewą w Jantarze i zmianą poprawnego punktu Stegny.
