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
npm run generate:paintings     # Repaint the watercolor art in public/img/paint (Python 3, numpy, opencv-python-headless)
```

There is no unit-test framework; `npm test` runs the release checks in `scripts/verify-*.mjs` and `scripts/capture-*.mjs` against a local preview. Puppeteer needs Chrome; set `PUPPETEER_EXECUTABLE_PATH` if it isn't installed.

## Architecture

**Stack:** Astro 5 (static output) + Tailwind CSS 3 + TypeScript. Deployed as a Cloudflare Worker with static assets (`wrangler.toml`, `worker.ts`); Cloudflare Workers Builds deploys `master` on push.

### Key directories

- `src/components/` — Astro components. Interactivity is vanilla JS in inline `<script>` blocks; no client-side framework.
- `src/pages/` — File-based routing. `index.astro` is the business home page at `/` (`explore.astro` only redirects old `/explore/` links there, alongside `public/_redirects`). Each app has its own folder (`src/pages/<app>/` with `index`, `privacy`, `support`); `apps/` holds the directory and the currency family page.
- `src/content/` — Astro Content Collections: `testimonials` (shown on the home page and /contact/) and `portfolio` (not rendered; source material for case studies). All content is Markdown with YAML frontmatter validated by Zod schemas in `src/content/config.ts`.
- `src/layouts/SiteLayout.astro` + `src/styles/site.css` — the business site (home, work, services, studio, contact, 404). Shared pieces live in `src/components/site/`.
- `scripts/watercolor/` — the seeded numpy/OpenCV watercolor renderer and the script that paints every image in `public/img/paint`; see `docs/watercolor.md`.
- `src/layouts/AppLayout.astro`, `AppDocLayout.astro` + `src/styles/app.css` — every app page, support page, and privacy page (see App pages below).
- `src/layouts/BaseLayout.astro` + `src/styles/global.css` — internal pages only (design, showcase, HealthKit Run Generator): the older "Midnight Studio" design system.
- `src/styles/fonts.css` — self-hosted Work Sans and Crimson Pro (files in `src/assets/fonts/`). Don't add Google Fonts links.
- `worker.ts` — contact form delivery (`/api/contact`) and cookieless analytics events (`/api/event`); see `docs/analytics.md`.
- `public/_headers` — cache rules for static assets.

### Business site design ("wet ink, hard pixel")

Stark editorial structure (ink rules, mono labels, strict grid) on warm paper (`--paper: #f5f0e6`), with watercolor paintings as the only color: cerulean `--cerulean`, rose `--rose`, and the violet where they glaze. Paintings are rendered on white and shown with `mix-blend-mode: multiply` (`.paint`), so never put `transform`, `opacity`, `filter`, or `isolation` on an ancestor of a `.paint` image. Light only. Photographs are shown as taken; only illustrations are painted. Primary CTAs go to `/contact/`; service CTAs use `/contact/?service=mobile|web|strategy|coaching` to preselect the project type.

### Internal pages design system

`global.css` still styles the internal pages on `BaseLayout` (design, showcase, HealthKit Run Generator docs). Theming is CSS-variable-based (not Tailwind dark mode classes). Variables are defined on `:root` (light) and `.dark` (dark). The `dark` class is toggled on `<html>` via `ThemeToggle.astro`.

Core palette: `--ink`, `--paper`, `--stone`, `--mist` + Telegram blue accent (`--accent: #0088cc`).
Fonts: Crimson Pro (headings), Work Sans (body), SF Mono (mono) — set via `--font-heading` / `--font-body` / `--font-mono`.

### App pages

All app pages share the studio design: `AppLayout.astro` (header with breadcrumb and store badge, studio footer), `components/app/AppLanding.astro` (landing template), and `AppDocLayout.astro` (support and privacy). Styles are in `src/styles/app.css`. Each app's copy, store link, and two watercolor pigments live in `src/data/app-pages/<slug>.json`; washes are shared masks tinted with those pigments. Icons and screenshots are shown exactly as supplied, never painted over. Apps without a store URL (`"store": null`) show "Coming soon" instead of a badge.

### Adding a new app

1. Add the app to `src/data/apps.ts`, and write `src/data/app-pages/<slug>.json` (copy an existing file; pick two pigments from the icon's hues and set `ink` to the first darkened to 4.5:1 on `#f5f0e6`).
2. Create `src/pages/<slug>/index.astro` rendering `<AppLanding page={appPageData['<slug>']} />`, plus `support.astro` and `privacy.astro` wrapped in `AppDocLayout`.
3. Add the icon and screenshots to `public/img/<slug>/`, record each screenshot's `w`/`h` in the JSON, then run `npm run optimize:images` and commit the generated `.webp` files. Keep referencing the `.png` in source: the `integrations/optimized-images.mjs` build step points `<img>` tags at the WebP, and `npm test` fails if a page shows an image over 250 KB.

Client case studies (`/work/<slug>/`) come from `src/data/projects.ts`, not a content collection.

### Content collections

Defined in `src/content/config.ts` with Zod. To add content, create a `.md` file in the appropriate collection directory with the required frontmatter fields.
