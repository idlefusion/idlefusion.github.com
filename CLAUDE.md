# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start local dev server (localhost:4321)
npm run build      # Production build → dist/
npm run preview    # Preview the production build locally
npm run deploy     # Build + deploy to Cloudflare Pages
npm run sync:currency-screenshots  # Sync app screenshots via Puppeteer
```

No test framework is configured — this is a content/marketing site.

## Architecture

**Stack:** Astro 5 (static output) + Tailwind CSS 3 + TypeScript. Deployed to Cloudflare Pages via `wrangler`.

### Key directories

- `src/components/` — Astro components. Interactivity is vanilla JS in inline `<script>` blocks; no client-side framework.
- `src/pages/` — File-based routing. `index.astro` is the main landing page. `apps/` contains individual app landing pages (one per iOS app).
- `src/content/` — Astro Content Collections (benefits, portfolio, testimonials, team, faq, process). All content is Markdown with YAML frontmatter validated by Zod schemas in `src/content/config.ts`.
- `src/layouts/BaseLayout.astro` — Single base layout wrapping all pages (meta, fonts, analytics).
- `src/styles/global.css` — "Midnight Studio" design system via CSS custom properties.

### Design system

Theming is CSS-variable-based (not Tailwind dark mode classes). Variables are defined on `:root` (light) and `.dark` (dark). The `dark` class is toggled on `<html>` via `ThemeToggle.astro`.

Core palette: `--ink`, `--paper`, `--stone`, `--mist` + Telegram blue accent (`--accent: #0088cc`).
Fonts: Crimson Pro (headings), Work Sans (body), SF Mono (mono) — set via `--font-heading` / `--font-body` / `--font-mono`.

### Adding a new app landing page

1. Create `src/pages/apps/<app-name>/index.astro` (or use `SimpleAppLanding.astro` as a template).
2. Add app screenshots/assets to `public/`.
3. Optionally add a portfolio entry in `src/content/portfolio/`.

### Content collections

Defined in `src/content/config.ts` with Zod. To add content, create a `.md` file in the appropriate collection directory with the required frontmatter fields.
