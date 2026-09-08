import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://idlefusion.com',
  base: '/',
  output: 'static',
  redirects: { '/welcome': '/' },
  integrations: [
    tailwind(),
    sitemap({ filter: (page) => new URL(page).pathname.replace(/\/$/, '') !== '/welcome' }),
  ],
  build: {
    assets: '_assets',
  },
});
