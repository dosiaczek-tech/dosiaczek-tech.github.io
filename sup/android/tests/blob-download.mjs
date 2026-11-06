// Desktop Chromium integration test of the actual script shipped in the APK.
// Does not claim to test Android's WebView or native document picker.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const expression = await readFile(new URL('../res/raw/read_blob.js', import.meta.url), 'utf8');
const browser = await chromium.launch({
  executablePath: process.env.SUP_CHROMIUM || '/run/current-system/sw/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.goto('http://zuffie.test:8766/sup/#moje-trasy');
  await page.waitForFunction(() => document.querySelector('#trip-date')?.value);
  const sample = JSON.stringify({ notes: 'Zażółć gęślą jaźń 🛶', text: 'fala\n'.repeat(25000) });
  const url = await page.evaluate(text => URL.createObjectURL(new Blob([text], { type: 'application/json' })), sample);
  assert.equal(await page.evaluate(expression.replace('__BLOB_URL__', JSON.stringify(url))), sample);
  await page.evaluate(url => URL.revokeObjectURL(url), url);
  assert.equal(await page.evaluate(expression.replace('__BLOB_URL__', JSON.stringify(url))), null);

  // Read the real website export before its 1-second Blob URL revocation.
  const downloaded = page.waitForEvent('download');
  await page.locator('#export-trips').click();
  const download = await downloaded;
  const exported = await page.evaluate(expression.replace('__BLOB_URL__', JSON.stringify(download.url())));
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  assert.equal(exported, Buffer.concat(chunks).toString('utf8'));
  assert.equal(JSON.parse(exported).version, 1);
  assert.deepEqual(JSON.parse(exported).trips, []);
  console.log('PASS: Unicode/large Blob, revoked Blob, and actual SUP JSON export match.');
} finally {
  await browser.close();
}
