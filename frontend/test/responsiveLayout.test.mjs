import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.join(testDirectory, relativePath), 'utf8');

test('exposes a mobile-safe viewport and shared overflow guards', () => {
  const html = read('../index.html');
  const styles = read('../src/styles.css');

  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.match(styles, /html, body, #root \{ width: 100%; max-width: 100%; min-width: 0; \}/);
  assert.match(styles, /overflow-x: hidden/);
  assert.match(styles, /@media \(max-width: 639px\)/);
  assert.match(styles, /\.page-header-action \{ width: 100%; \}/);
});

test('keeps public store cards and try-on controls mobile-first', () => {
  const store = read('../src/pages/PublicStore.jsx');
  const product = read('../src/pages/PublicProduct.jsx');

  assert.match(store, /grid grid-cols-1 gap-6 pb-4 sm:grid-cols-2 lg:grid-cols-4/);
  assert.match(product, /className="grid gap-3 sm:grid-cols-2"/);
  assert.match(product, /playsInline/);
  assert.match(product, /aria-label=\{cameraFacingMode === 'environment'/);
});
