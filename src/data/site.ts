export const siteOrigin = 'https://idlefusion.com';
export const defaultSocialImage = '/img/og/default.png';

// schema.org description of the studio, shared by every business page.
export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${siteOrigin}/#organization`,
  name: 'Idle Fusion',
  legalName: 'Idle Fusion LLC',
  url: `${siteOrigin}/`,
  logo: `${siteOrigin}/img/logo.png`,
  image: `${siteOrigin}${defaultSocialImage}`,
  email: 'hello@idlefusion.com',
  description:
    'Independent studio designing and building iOS apps, websites, and web platforms, led by founder Matthew Strickland.',
  founder: { '@id': `${siteOrigin}/studio/#matthew` },
  knowsAbout: [
    'iOS app development',
    'Apple Watch apps',
    'Web development',
    'Web platforms',
    'Technical strategy',
  ],
  sameAs: ['https://github.com/idlefusion'],
};

export const founderSchema = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  '@id': `${siteOrigin}/studio/#matthew`,
  name: 'Matthew Strickland',
  jobTitle: 'Founder',
  worksFor: { '@id': `${siteOrigin}/#organization` },
  image: `${siteOrigin}/img/us/matthew.jpg`,
  url: `${siteOrigin}/studio/`,
  sameAs: ['https://linkedin.com/in/mps'],
};
