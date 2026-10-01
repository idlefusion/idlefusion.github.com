import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import optimizedImages from './integrations/optimized-images.mjs';

// Internal reviews and redirects stay reachable by URL but out of search.
const unlisted = ['/welcome', '/design', '/showcase', '/contact/thanks'];

export default defineConfig({
  site: 'https://idlefusion.com',
  base: '/',
  output: 'static',
  redirects: { '/welcome': '/' },
  integrations: [
    tailwind(),
    sitemap({ filter: (page) => !unlisted.includes(new URL(page).pathname.replace(/\/$/, '')) }),
    optimizedImages(),
  ],
  build: {
    assets: '_assets',
  },
});
