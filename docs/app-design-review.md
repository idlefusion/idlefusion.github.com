# Dedicated app design review

All 28 dedicated app pages, their support/privacy pages, and the separate currency-app family retain their existing product identities in this release.

## What is preserved

The production routes keep each original Astro page. Product headings, layouts, artwork, screenshot galleries, feature sections, product palettes, and light/dark treatments stay with the app. Twenty-three pages have bespoke layouts; five use the existing `SimpleAppLanding` component with individual content, colors, and artwork.

The blue/black/white studio palette applies only to a compact Idle Fusion navigation bar and a shared app-discovery section. Contrast retains its original orange/cyan design. The discovery section presents three stable recommendations and a link to all 27 visible apps, replacing the lengthy randomized cross-promotion grid on app pages.

| App             | Product identity retained                                                           |
| --------------- | ----------------------------------------------------------------------------------- |
| Contrast        | Dark session-focused layout, orange/cyan treatment, multi-screen gallery            |
| Fast Easy       | Centered orange-accented hero and vertical editorial features                       |
| Focus Easy      | Minimal monochrome launcher presentation                                            |
| Run Easy        | Green training identity and iPhone/Watch imagery                                    |
| Check Yourself  | Lavender macOS identity and soft hero treatment                                     |
| Breathe Easy    | Indigo/sky breathing identity                                                       |
| Track Easy      | Green habit-tracking presentation                                                   |
| Mood Easy       | Purple/pink mood identity                                                           |
| Pomo Easy       | Red focus-timer identity                                                            |
| Hydrate         | Sky-blue water-tracking identity                                                    |
| Count Easy      | Purple/pink countdown and widget presentation                                       |
| Cycle Easy      | Rose privacy-led identity and existing coming-soon treatment                        |
| Voice Easy      | Purple recording/transcription presentation                                         |
| Weigh Easy      | Purple weight-tracking identity                                                     |
| Pressure Easy   | Red identity and distinct blood-pressure category colors                            |
| Spend Easy      | Green expense-tracking identity                                                     |
| Rest Easy       | Lavender/nighttime identity                                                         |
| Meds Easy       | Teal medication-tracking identity                                                   |
| Decibel         | Orange sound-meter identity                                                         |
| Caffeine Easy   | Amber/brown caffeine identity                                                       |
| Stretch Easy    | Teal stretching identity                                                            |
| Temp Easy       | Orange temperature identity and reading-category colors                             |
| Tune Easy       | Amber tuning identity                                                               |
| Marta Easy      | Blue transit identity; remains hidden from the directory                            |
| Macro Easy      | Orange nutrition identity                                                           |
| Set Easy        | Purple strength-training identity                                                   |
| Split Easy      | Green bill-splitting identity                                                       |
| Dose Easy       | Teal supplement-tracking identity                                                   |
| Currency family | Existing blue/dark conversion presentation and 20-variant directory; remains hidden |

## Corrections made during review

- Shared navigation consistently returns to the revised studio, app directory, and each app's own support/privacy pages.
- Support and privacy pages have app-specific return navigation. Their policy content is unchanged.
- The five shared-template pages render a real middle-dot separator instead of literal `&middot;` text. Pages without store URLs explicitly show “Coming soon.”
- Currency screenshots were incorrectly treated as missing during static builds because an asset check depended on a compiled module's location. The available screenshots now render.
- Internal screenshot-copying commands and developer filesystem paths were removed from the currency page's customer-facing text.
- The currency page's placeholder App Store link is a noninteractive coming-soon label. Its contact action describes an availability inquiry rather than implying an implemented waitlist.

## Review and verification

The app gallery includes full-page desktop/mobile screenshots in both themes and original desktop views when a pre-change build is supplied. Each card also links to desktop/mobile screenshots of its support and privacy pages. When a pre-change build is supplied with `APP_BASELINE_ORIGIN`, original and updated hero colors, typography, backgrounds, and App Store destinations are compared automatically. Rendering checks cover overflow, loaded images, headings, theme switching/persistence, shared navigation, and local links.

The design review uses existing product content and store URLs. It does not independently confirm current external App Store release status. The existing directory visibility flags remain in place. All work is local; nothing has been deployed.
