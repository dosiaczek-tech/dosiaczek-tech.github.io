// Pair-code decoding/recovery from the public Open Location Code specification.
// Used for a displayed facility address, never for a map camera position.
const alphabet = '23456789CFGHJMPQRVWX';
const resolutions = [20, 1, .05, .0025, .000125];
export function recoverPlusCode(code, reference) {
  code = code.toUpperCase();
  const separator = code.indexOf('+');
  if (![2, 4, 6, 8].includes(separator) || !/^[23456789CFGHJMPQRVWX]+\+[23456789CFGHJMPQRVWX]{2}$/.test(code)) throw new Error('Nieobsługiwany kod lokalizacyjny.');
  const missing = 8 - separator;
  if (missing) {
    if (!Array.isArray(reference) || reference.length !== 2 || !reference.every(Number.isFinite)) throw new Error('Skrócony kod wymaga lokalizacji odniesienia.');
    let lat = Math.min(89.999999, Math.max(-90, reference[1])) + 90, lon = ((reference[0] + 180) % 360 + 360) % 360, prefix = '';
    for (const resolution of resolutions) {
      const y = Math.floor((lat + 1e-10) / resolution), x = Math.floor((lon + 1e-10) / resolution);
      prefix += alphabet[y] + alphabet[x]; lat -= y * resolution; lon -= x * resolution;
    }
    code = prefix.slice(0, missing) + code;
  }
  const digits = code.replace('+', ''); let lat = -90, lon = -180;
  for (let i = 0; i < 5; i++) { lat += alphabet.indexOf(digits[i * 2]) * resolutions[i]; lon += alphabet.indexOf(digits[i * 2 + 1]) * resolutions[i]; }
  lat += resolutions[4] / 2; lon += resolutions[4] / 2;
  if (missing) {
    const resolution = 20 ** (2 - missing / 2);
    if (reference[1] - lat > resolution / 2) lat += resolution;
    else if (lat - reference[1] > resolution / 2) lat -= resolution;
    if (reference[0] - lon > resolution / 2) lon += resolution;
    else if (lon - reference[0] > resolution / 2) lon -= resolution;
  }
  return [+lon.toFixed(7), +lat.toFixed(7)];
}
