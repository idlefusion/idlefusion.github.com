# Website redesign release

## Scope

The business website uses the original blue (#0088CC), black (#0A0A0A), and white palette with Work Sans headings and selective Crimson Pro italic accents. The reviewed layout now lives at the public URLs:

- `/`: simple welcome, name and contact details, light/dark control, and an invitation to explore.
- `/explore/`: featured work, services, and founder introduction, including the uncropped portrait.
- `/work/` and the five existing `/work/<slug>/` URLs: portfolio and case studies.
- `/services/` and `/studio/`: capabilities, process, and founder story.
- `/apps/`: searchable directory with category filters.
- `/open-source/`: developer tools and a link to the existing project documentation.
- `/contact/`: inquiry form using the original direct-send service.
- All 28 existing dedicated app pages, their 56 support/privacy pages, and `/apps/currency/`: product identities preserved, with shared navigation and discovery.

Marta Easy and the currency family retain their existing hidden-directory status. The welcome screen follows the saved or system theme and remembers manual changes. `/welcome/` redirects to `/`. Existing links to `/#our-work`, `/#how-it-works`, and `/#leadership` forward to the corresponding section on `/explore/`.

## Implementation

Business pages use `SiteLayout.astro` and `site.css`; product pages retain `BaseLayout.astro` and their original scoped styles. A single app registry drives listing, visibility, shared navigation, and discovery. The five case studies use one template with project data.

The temporary `/redesign/` routes, forwarding pages, and preview HTML-rewriting middleware are removed. Public pages have canonical URLs, sharing metadata, and normal indexing. Screenshots stay outside the shipped site and are ignored by Git.

The contact form submits to the existing `/api/contact` endpoint with the same recipient, reply-to address, success/error handling, and honeypot. Company and project type are appended to the message. Duplicate submissions are suppressed while a request is in flight. The Worker and email-provider configuration are unchanged.

## Verification

Run `npm test` with Node.js 24. It builds the site, opens a temporary local preview server, and checks:

- Generated pages, existing routes, local assets, internal links, anchors, canonical URLs, and sitemap inclusion.
- Contact validation, success/reset, duplicate-submit prevention, delivery and network failures, retries, and bot filtering, using simulated email delivery through the existing Worker.
- Business pages at desktop/mobile sizes, navigation, portfolio filters, and app search.
- Every app's desktop/mobile light and dark views, theme persistence, shared navigation, and support/privacy pages.

The app capture script optionally accepts `APP_BASELINE_ORIGIN` pointing at a separately served pre-change build. With that set, it compares app hero colors, typography, backgrounds, and App Store URLs in both themes and includes original screenshots in the review gallery. It never treats the current page as its own baseline.

Reports and screenshots are saved under `artifacts/redesign/`. `release-audit.json`, `contact-audit.json`, `audit.json`, and `app-pages/audit.json` record the checks. Set `REVIEW_ORIGIN` to change the site links in the generated gallery; otherwise the test suite uses `http://127.0.0.1:4323`.

Real inbox delivery is not part of the automated checks. It requires the existing deployed Worker and Resend secret. No changes have been deployed as part of this preparation.
