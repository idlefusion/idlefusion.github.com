# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start local dev server (localhost:4321)
npm run build      # Production build → dist/
npm run preview    # Preview the production build locally
npm run deploy     # Build + deploy the Cloudflare Worker (pushes to master also deploy via Workers Builds)
npm run test       # Build, then check routes, links, images, and the contact form; capture screenshots (Puppeteer)
npm run sync:currency-screenshots  # Copy the screenshots listed in src/data/currency.ts from the Pesos Dos export
npm run optimize:images  # Write right-sized WebP copies of large images in public/img
npm run generate:brand-images  # Regenerate social cards (public/img/og) and home-screen icons
```

There is no unit-test framework; `npm test` runs the release checks in `scripts/verify-*.mjs` and `scripts/capture-*.mjs` against a local preview. Puppeteer needs Chrome; set `PUPPETEER_EXECUTABLE_PATH` if it isn't installed.

## Architecture

**Stack:** Astro 5 (static output) + Tailwind CSS 3 + TypeScript. Deployed as a Cloudflare Worker with static assets (`wrangler.toml`, `worker.ts`); Cloudflare Workers Builds deploys `master` on push.

### Key directories

- `src/components/` — Astro components. Interactivity is vanilla JS in inline `<script>` blocks; no client-side framework.
- `src/pages/` — File-based routing. `index.astro` is the welcome screen at `/`; the business site starts at `explore.astro`. Each app has its own folder (`src/pages/<app>/` with `index`, `privacy`, `support`); `apps/` holds the directory and the currency family page.
- `src/content/` — Astro Content Collections: `testimonials` (shown on /explore/ and /contact/) and `portfolio` (not rendered; source material for case studies). All content is Markdown with YAML frontmatter validated by Zod schemas in `src/content/config.ts`.
- `src/layouts/SiteLayout.astro` + `src/styles/site.css` — the business site (explore, work, services, studio, contact, 404).
- `src/layouts/BaseLayout.astro` — app pages, their privacy/support pages, and internal pages (meta, fonts, analytics).
- `src/styles/global.css` — "Midnight Studio" design system via CSS custom properties.
- `src/styles/fonts.css` — self-hosted Work Sans and Crimson Pro (files in `src/assets/fonts/`). Don't add Google Fonts links.
- `worker.ts` — contact form delivery (`/api/contact`) and cookieless analytics events (`/api/event`); see `docs/analytics.md`.
- `public/_headers` — cache rules for static assets.

### Design system

Theming is CSS-variable-based (not Tailwind dark mode classes). Variables are defined on `:root` (light) and `.dark` (dark). The `dark` class is toggled on `<html>` via `ThemeToggle.astro`.

Core palette: `--ink`, `--paper`, `--stone`, `--mist` + Telegram blue accent (`--accent: #0088cc`).
Fonts: Crimson Pro (headings), Work Sans (body), SF Mono (mono) — set via `--font-heading` / `--font-body` / `--font-mono`.

### Adding a new app landing page

1. Create `src/pages/<app-name>/index.astro` (or use `SimpleAppLanding.astro`), plus `privacy.astro` and `support.astro`, and add the app to `src/data/apps.ts`.
2. Add app screenshots/assets to `public/img/<app-name>/`, then run `npm run optimize:images` and commit the generated `.webp` files. Keep referencing the `.png` in source: the `integrations/optimized-images.mjs` build step points `<img>` tags at the WebP, and `npm test` fails if a page shows an image over 250 KB.
Client case studies (`/work/<slug>/`) come from `src/data/projects.ts`, not a content collection.

### Content collections

Defined in `src/content/config.ts` with Zod. To add content, create a `.md` file in the appropriate collection directory with the required frontmatter fields.
