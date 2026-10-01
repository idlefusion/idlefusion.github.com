#!/usr/bin/env node
// Copies the screenshots /apps/currency/ shows (src/data/currency.ts) from the
// Pesos Dos export. The export has every variant; only the listed ones ship.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currencyScreenshots } from '../src/data/currency.ts';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceDir = process.env.PESOS_DOS_SCREENSHOTS_DIR
  ? resolve(process.env.PESOS_DOS_SCREENSHOTS_DIR)
  : resolve(projectRoot, '../pesos-dos/generated/currency-variants/screenshots');
const prefix = 'img/currency/screenshots/';

if (!existsSync(sourceDir)) {
  console.error('[sync-currency-screenshots] Source not found:', sourceDir);
  console.error(
    '[sync-currency-screenshots] Set PESOS_DOS_SCREENSHOTS_DIR or update scripts/sync-currency-screenshots.mjs with the finalized export path.',
  );
  process.exit(1);
}

let copied = 0;
for (const { path } of currencyScreenshots) {
  const source = resolve(sourceDir, path.slice(prefix.length));
  const destination = resolve(projectRoot, 'public', path);
  if (!existsSync(source)) {
    console.warn('[sync-currency-screenshots] Missing in export:', source);
    continue;
  }
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  copied++;
}

console.log(
  `[sync-currency-screenshots] Copied ${copied} of ${currencyScreenshots.length} screenshot(s) listed in src/data/currency.ts.`,
);
