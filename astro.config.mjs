import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://idlefusion.com',
  base: '/',
  output: 'static',
  integrations: [tailwind()],
  build: {
    assets: '_assets'
  }
});
