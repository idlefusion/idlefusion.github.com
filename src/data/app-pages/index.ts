// Copy for each app's landing page, one JSON file per app (migrated verbatim
// from the original pages). Rendered by src/components/app/AppLanding.astro.
// Rich fields (titles, text) may contain <em> and HTML entities.

export interface AppFeature {
  title: string;
  text: string;
}

export type AppSection =
  | { type: 'screenshots'; label: string; title: string }
  | {
      type: 'features';
      label: string;
      title: string;
      intro?: string[];
      link?: { href: string; text: string };
      items: AppFeature[];
    }
  | {
      type: 'statement' | 'privacy';
      label: string;
      title: string;
      text: string[];
      link?: { href: string; text: string };
    }
  | { type: 'list'; label: string; title: string; text: string[]; items: string[] }
  | {
      type: 'scale';
      label: string;
      title: string;
      text: string[];
      /** Colors carry each category's meaning in the app; keep them as the app uses them. */
      items: { label: string; range: string; color: string }[];
    }
  | { type: 'strip'; items: { emoji: string; label: string }[] };

export interface AppPageData {
  slug: string;
  name: string;
  category: string;
  icon: string;
  seo: { title: string; description: string; ogImage: string; canonical: string };
  platform: 'iOS' | 'macOS';
  /** null until the app has a store listing; the page then says "Coming soon". */
  store: { url: string; mac: boolean } | null;
  note: string;
  /** Two watercolor pigments for the page's washes, led by the icon's own hue. */
  pigments: [string, string];
  /** The first pigment darkened to pass 4.5:1 as text on the paper background. */
  ink: string;
  hero: { label: string; title: string; text: string[] };
  screenshots: { src: string; alt: string; label: string; w: number; h: number }[];
  sections: AppSection[];
  cta: { title: string; text: string } | null;
}

const modules = import.meta.glob<AppPageData>('./*.json', { eager: true, import: 'default' });

export const appPageData: Record<string, AppPageData> = Object.fromEntries(
  Object.values(modules).map((page) => [page.slug, page]),
);
