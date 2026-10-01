import { z, defineCollection } from 'astro:content';

const testimonialsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    company: z.string(),
    quote: z.string(),
    image: z.string(),
    rating: z.number().min(1).max(5).default(5),
  }),
});

// Not rendered on the site yet: write-ups for all past projects, kept as
// source material for case studies (src/data/projects.ts).
const portfolioCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    image: z.string(),
    url: z.string(),
    order: z.number().optional(),
  }),
});

export const collections = {
  'testimonials': testimonialsCollection,
  'portfolio': portfolioCollection,
};
