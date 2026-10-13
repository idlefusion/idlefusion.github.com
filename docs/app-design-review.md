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
- Pages are light only, matching the studio site; the per-app dark themes and theme toggles are gone.
- Apps without a store listing say "Coming soon to the App Store" instead of showing a badge that linked to `#`. These pages' copy still says "Free on the App Store" in places, and Focus Easy and Meds Easy have store links but "coming soon" copy; that copy is unchanged and worth reviewing.
- Every landing page has `SoftwareApplication` structured data and a "Made by Idle Fusion" line linking to the contact form (`cta_app_page`).

## Review

`npm test` runs `scripts/capture-apps.mjs`: every landing, support, and privacy page at desktop and phone width, checking status, overflow, a single `h1`, images, indexing, the home and directory links, in-page anchors, and that each landing page offers a real store badge or the coming-soon label. Screenshots and a gallery are written to `artifacts/redesign/app-pages/` (set `APP_BASELINE_ORIGIN` to include the previous build's views for comparison).
