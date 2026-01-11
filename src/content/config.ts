import { z, defineCollection } from 'astro:content';

const benefitsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    icon: z.string(),
    order: z.number(),
  }),
});

const processCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    step: z.number(),
  }),
});

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

const teamCollection = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    role: z.string(),
    image: z.string(),
    bio: z.string(),
    socialLinks: z.object({
      linkedin: z.string().optional(),
      github: z.string().optional(),
    }).optional(),
  }),
});

const faqCollection = defineCollection({
  type: 'content',
  schema: z.object({
    question: z.string(),
    answer: z.string(),
    order: z.number(),
  }),
});

export const collections = {
  'benefits': benefitsCollection,
  'process': processCollection,
  'testimonials': testimonialsCollection,
  'portfolio': portfolioCollection,
  'team': teamCollection,
  'faq': faqCollection,
};
