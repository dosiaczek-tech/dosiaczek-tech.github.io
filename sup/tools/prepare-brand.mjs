// The large SVG is the artwork source. Icons use a thicker outline for small
// sizes, and the Android foreground stays within the adaptive-icon safe zone.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = new URL('../assets/logo.svg', import.meta.url);
const svg = await readFile(source, 'utf8');
const icon = svg.replace('viewBox="0 0 1254 1254"', 'viewBox="115 115 1024 1024"')
  .replace('<rect width="1254" height="1254"', '<rect x="115" y="115" width="1024" height="1024" rx="240"')
  .replace('stroke-width="14"', 'stroke-width="24"');
await writeFile(new URL('../assets/mark.svg', import.meta.url), icon);

const paths = [...svg.matchAll(/<path\b([^>]+)\/>/g)].map(([, text]) => {
  const attrs = Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
  const fill = attrs.fill ?? 'none', stroke = attrs.stroke ?? '#FAFCF4';
  return `        <path android:fillColor="${fill === 'none' ? '#00000000' : fill}"${stroke === 'none' ? '' : ` android:strokeColor="${stroke}" android:strokeWidth="24" android:strokeLineCap="round" android:strokeLineJoin="round"`}\n            android:pathData="${attrs.d}" />`;
});
if (paths.length !== 5) throw new Error('Nieoczekiwana struktura źródłowego logo.');
await writeFile(new URL('../android/res/drawable/ic_sup.xml', import.meta.url), `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated from assets/logo.svg by tools/prepare-brand.mjs. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
    <group android:scaleX="0.058" android:scaleY="0.058" android:translateX="17.634" android:translateY="17.634">
${paths.join('\n')}
    </group>
</vector>
`);
console.log('Logo SVG → znak strony / favicon i adaptacyjna ikona Androida.');
if (process.argv.includes('--png')) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ executablePath: process.env.SUP_CHROMIUM || '/run/current-system/sw/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
    await page.goto(source.href);
    await page.screenshot({ path: fileURLToPath(new URL('../assets/logo.png', import.meta.url)) });
    console.log('Logo PNG: 1024 × 1024.');
  } finally { await browser.close(); }
}
