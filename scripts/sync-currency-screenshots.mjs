#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceDir = process.env.PESOS_DOS_SCREENSHOTS_DIR
  ? resolve(process.env.PESOS_DOS_SCREENSHOTS_DIR)
  : resolve(projectRoot, '../pesos-dos/generated/currency-variants/screenshots');
const destinationDir = resolve(projectRoot, 'public/img/currency/screenshots');

if (!existsSync(sourceDir)) {
  console.error('[sync-currency-screenshots] Source not found:', sourceDir);
  console.error(
    '[sync-currency-screenshots] Set PESOS_DOS_SCREENSHOTS_DIR or update scripts/sync-currency-screenshots.mjs with the finalized export path.'
  );
  process.exit(1);
}

mkdirSync(destinationDir, { recursive: true });
cpSync(sourceDir, destinationDir, { recursive: true });

const countFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
    const nextPath = resolve(dir, entry.name);
    if (entry.isDirectory()) return total + countFiles(nextPath);
    return /\.(png|jpe?g|webp)$/i.test(entry.name) ? total + 1 : total;
  }, 0);

const fileCount = countFiles(destinationDir);
console.log(`[sync-currency-screenshots] Copied ${fileCount} screenshot file(s) to ${destinationDir}`);
