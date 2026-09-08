import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { glob, readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { appPages } from '../src/data/apps.ts';
import { projects } from '../src/data/projects.ts';

// Use a free local port so the checks do not interrupt an open design review.
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['node_modules/astro/astro.js', 'preview', '--host', '127.0.0.1', '--port', String(port)],
  { stdio: 'pipe' },
);
let serverLog = '';
server.stdout.on('data', (chunk) => {
  serverLog += chunk;
});
server.stderr.on('data', (chunk) => {
  serverLog += chunk;
});
const env = {
  ...process.env,
  SITE_ORIGIN: origin,
  REVIEW_ORIGIN: process.env.REVIEW_ORIGIN || 'http://127.0.0.1:4323',
};

async function run(script) {
  const child = spawn(process.execPath, [script], { stdio: 'inherit', env });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, `${script} failed`);
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Preview server exited: ${serverLog}`);
    try {
      ready = (await fetch(origin)).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready, `Preview server did not start: ${serverLog}`);

  const files = new Set();
  for await (const file of glob('**/*', { cwd: 'dist' })) files.add(file.split(path.sep).join('/'));
  assert.ok(
    ![...files].some((file) => file.startsWith('redesign/')),
    'Preview routes must not ship',
  );
  const htmlFiles = [...files].filter((file) => file.endsWith('.html'));
  const browser = await puppeteer.launch({ headless: true });
  let documents;
  try {
    const page = await browser.newPage();
    documents = await Promise.all(
      htmlFiles.map(async (file) => ({
        file,
        html: await readFile(path.join('dist', file), 'utf8'),
      })),
    );
    documents = await page.evaluate(
      (documents) =>
        documents.map(({ file, html }) => {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          return {
            file,
            ids: [...doc.querySelectorAll('[id]')].map((element) => element.id),
            references: [
              ...doc.querySelectorAll('a[href],link[href]:not([rel="canonical"]),[src]'),
            ].flatMap((element) =>
              ['href', 'src'].map((attribute) => element.getAttribute(attribute)).filter(Boolean),
            ),
            canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href'),
            robots: doc.querySelector('meta[name="robots"]')?.getAttribute('content'),
          };
        }),
      documents,
    );
  } finally {
    await browser.close();
  }

  const errors = [];
  const documentMap = new Map(documents.map((doc) => [doc.file, doc]));
  const resolveFile = (pathname) => {
    const name = decodeURIComponent(pathname).replace(/^\//, '');
    return [name, `${name.replace(/\/$/, '')}/index.html`.replace(/^\//, '')].find(
      (file) => files.has(file) && !file.endsWith('/'),
    );
  };
  for (const doc of documents) {
    const pathname = `/${doc.file.replace(/index\.html$/, '')}`;
    for (const reference of doc.references) {
      const url = new URL(reference, `https://idlefusion.com${pathname}`);
      if (url.origin !== 'https://idlefusion.com') continue;
      if (url.pathname.startsWith('/redesign/'))
        errors.push(`${doc.file}: preview reference ${reference}`);
      // Some paths are directories in the file inventory; resolve HTML routes first.
      const routeFile = `${url.pathname.replace(/^\//, '').replace(/\/$/, '')}/index.html`.replace(
        /^\//,
        '',
      );
      const target = documentMap.has(routeFile) ? routeFile : resolveFile(url.pathname);
      if (!target) errors.push(`${doc.file}: missing ${reference}`);
      else if (
        url.hash &&
        documentMap.has(target) &&
        !documentMap.get(target).ids.includes(decodeURIComponent(url.hash.slice(1)))
      )
        errors.push(`${doc.file}: missing anchor ${reference}`);
    }
  }
  const expectedRoutes = [
    '/',
    '/apps/',
    '/contact/',
    '/services/',
    '/studio/',
    '/work/',
    '/open-source/',
    ...projects.map((project) => `/work/${project.slug}/`),
    ...appPages.flatMap((app) => [
      app.route,
      ...(app.hasPolicies ? [`${app.route}support/`, `${app.route}privacy/`] : []),
    ]),
  ];
  const sitemap = await readFile('dist/sitemap-0.xml', 'utf8');
  for (const route of expectedRoutes) {
    const file = `${route.slice(1)}index.html`;
    const doc = documentMap.get(file);
    if (!doc) {
      errors.push(`Missing public page ${route}`);
      continue;
    }
    if (doc.robots?.includes('noindex')) errors.push(`${route} unexpectedly blocks indexing`);
    if (
      !doc.canonical ||
      new URL(doc.canonical).origin !== 'https://idlefusion.com' ||
      new URL(doc.canonical).pathname.replace(/\/$/, '') !== route.replace(/\/$/, '')
    )
      errors.push(`${route}: incorrect canonical URL`);
    if (!sitemap.includes(`https://idlefusion.com${route}`))
      errors.push(`${route}: absent from sitemap`);
  }
  await mkdir('artifacts/redesign', { recursive: true });
  await writeFile(
    'artifacts/redesign/release-audit.json',
    JSON.stringify(
      { pages: documents.length, expectedRoutes: expectedRoutes.length, errors },
      null,
      2,
    ),
  );
  assert.deepEqual(
    errors,
    [],
    'Published routes, metadata, assets, or anchors failed verification',
  );
  console.log(
    `Checked ${documents.length} generated pages and ${expectedRoutes.length} release routes: links, assets, anchors, canonical URLs, and indexing.`,
  );
  await run('scripts/verify-contact.mjs');
  await run('scripts/capture-site.mjs');
  await run('scripts/capture-apps.mjs');
} finally {
  if (server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
  }
}
