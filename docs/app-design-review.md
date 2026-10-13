# App pages

All 28 dedicated app pages, their 56 support and privacy pages, and the currency-app family use the studio's design: warm paper, ink type, mono labels, ruled grids, and watercolor. What makes each page its own is what belongs to the app: its icon, its screenshots, its copy, and two pigments taken from the icon.

## What stays exactly as it was

- **Icons and screenshots** are shown as supplied. Nothing is painted over, filtered, or cropped (screenshots keep their own frames and backgrounds; icons get the iOS corner rounding only).
- **Copy** was migrated verbatim from the previous pages into `src/data/app-pages/<slug>.json`. A text diff of every page's visible content against the previous build found nothing missing apart from intentional label changes (below).
- **Support and privacy text** is untouched; only the layout around it changed.
- **Meaning-bearing colors** (blood pressure and temperature categories) keep the exact colors the apps use.
- Store links, canonical URLs, titles, descriptions, and social images.

## What changed

- One template (`components/app/AppLanding.astro`) replaces 23 bespoke pages and the shared `SimpleAppLanding`. Sections keep their original order: hero, screenshots, features, statements, scales, privacy, call to action.
- The hero shows the Idle Fusion mark painted in the app's two pigments, with the app icon in the overlap. Washes are shared alpha masks (`public/img/paint/app-*.webp`) tinted per app in CSS, so a new app needs only colors.
- Pages follow the visitor's light or dark setting, like the studio site; the per-app theme toggles are gone. At night the washes are screened onto near-black paper in each app's pigments, lightened in OKLab (`src/data/app-pages/colours.ts`) so even Rest Easy's navy glows, and the app's text colour is lightened to 4.5:1. By day, an app whose pigment is too dark for ink to read on (Rest Easy, Focus Easy, and a few others) gets a lighter highlighter under its headline word, in the same hue.
- Apps without a store listing say "Coming soon to the App Store" instead of showing a badge that linked to `#`. These pages' copy still says "Free on the App Store" in places, and Focus Easy and Meds Easy have store links but "coming soon" copy; that copy is unchanged and worth reviewing.
- Every landing page has `SoftwareApplication` structured data and a "Made by Idle Fusion" line linking to the contact form (`cta_app_page`).

## Review

`npm test` runs `scripts/capture-apps.mjs`: every landing, support, and privacy page at desktop and phone width, checking status, overflow, a single `h1`, images, indexing, the home and directory links, in-page anchors, and that each landing page offers a real store badge or the coming-soon label. Screenshots (light and dark) and a gallery are written to `artifacts/redesign/app-pages/` (set `APP_BASELINE_ORIGIN` to include the previous build's views for comparison). `scripts/verify-themes.mjs` checks every page's text contrast, paper, and paintings in both themes.
