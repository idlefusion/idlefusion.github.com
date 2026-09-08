export interface Project {
  slug: string;
  name: string;
  short: string;
  category: string;
  type: string;
  color: string;
  number: string;
  image: string;
  client: string;
  platform: string;
  intro: string;
  challenge: string;
  approach: string[];
  outcome: string;
  note?: string;
}
export const projects: Project[] = [
  {
    slug: 'everybody-everywhere',
    name: 'Everybody Everywhere',
    short: 'A global mission. A more personal connection.',
    category: 'Community & impact',
    type: 'Web',
    color: 'art-mist',
    number: '01',
    image: '/img/clients/ee.png',
    client: 'Everybody Everywhere',
    platform: 'Web & mobile',
    intro: 'Turning a global mission into a personal, participatory digital experience.',
    challenge:
      'Everybody Everywhere needed a platform that could inspire people to pray, give, and share the Gospel with unreached people groups. The experience needed to make a global mission feel personal, trackable, and achievable.',
    approach: [
      'Interactive impact tracking that helps supporters see their part in the mission.',
      'Video stories that connect people with the communities behind the numbers.',
      'Giving and sharing tools that turn interest into participation.',
    ],
    outcome:
      'A connected platform where supporters can follow their impact, share stories, and invite others into the movement.',
  },
  {
    slug: 'radio-disney',
    name: 'Radio Disney',
    short: 'Bringing a beloved broadcast to mobile.',
    category: 'Media & entertainment',
    type: 'Mobile',
    color: 'art-blue',
    number: '02',
    image: '/img/clients/radiodisney.png',
    client: 'The Walt Disney Company',
    platform: 'iOS & Android',
    intro: 'The energy of live radio, in the hands of a new generation of listeners.',
    challenge:
      'Radio Disney’s audience expected interactivity and connection beyond the broadcast. The challenge was to translate the shared experience of live radio into a native mobile product for kids and families.',
    approach: [
      'Live audio streaming with now-playing information and artist details.',
      'A Radio Disney alarm clock that brought favorite music into a daily routine.',
      'Song requests, shoutouts, and connections to the wider Disney ecosystem.',
    ],
    outcome:
      'A native streaming experience that connected young listeners with Radio Disney wherever they were.',
    note: 'Archive project. The app has since been retired as Disney consolidated its digital properties.',
  },
  {
    slug: 'golf-channel-academy',
    name: 'Golf Channel Academy',
    short: 'Better practice, one swing at a time.',
    category: 'Sports & learning',
    type: 'Mobile',
    color: 'art-silver',
    number: '03',
    image: '/img/clients/gca.jpg',
    client: 'Golf Channel',
    platform: 'iOS',
    intro: 'Putting video analysis and professional golf instruction in every player’s pocket.',
    challenge:
      'Golf lessons are difficult to retain without a way to revisit feedback. Golf Channel wanted to help players record their swings, review instruction, and track progress over time.',
    approach: [
      'Native video capture and swing analysis designed for use on the course.',
      'Side-by-side comparisons to make differences in technique easier to see.',
      'Personalized coaching and a lasting record of each player’s practice.',
    ],
    outcome:
      'A mobile learning tool that lets golfers revisit feedback and see how their swing changes with practice.',
  },
  {
    slug: 'easy-digital-downloads',
    name: 'Easy Digital Downloads',
    short: 'A digital business, always within reach.',
    category: 'Commerce & platforms',
    type: 'Mobile',
    color: 'art-paper',
    number: '04',
    image: '/img/clients/edd.png',
    client: 'Easy Digital Downloads',
    platform: 'Mobile',
    intro: 'Helping digital store owners stay connected to their business from anywhere.',
    challenge:
      'Store owners depended on a desktop dashboard for sales and customer information. They needed quick access to the health of their business while away from their desks.',
    approach: [
      'A native mobile view of sales, revenue, and customer activity.',
      'Integration with the existing Easy Digital Downloads platform.',
      'New-sale notifications that keep owners connected throughout the day.',
    ],
    outcome:
      'An everyday companion for digital entrepreneurs, bringing their store’s key information to mobile.',
  },
  {
    slug: 'golf-channel',
    name: 'Golf Channel Mobile',
    short: 'The tournament goes wherever fans go.',
    category: 'Sports & broadcasting',
    type: 'Mobile',
    color: 'art-cloud',
    number: '05',
    image: '/img/clients/gc.jpg',
    client: 'Golf Channel / NBC',
    platform: 'iOS & Android',
    intro: 'Live coverage, real-time scores, and golf news in one native mobile experience.',
    challenge:
      'Golf fans wanted to follow tournaments on their own schedule. The mobile experience needed to handle live streaming during major events and keep fans connected between broadcasts.',
    approach: [
      'Native iOS and Android experiences built around live sports coverage.',
      'Real-time scoring, breaking news, and highlights.',
      'Streaming performance designed for the demands of major tournaments.',
    ],
    outcome:
      'A mobile companion to Golf Channel’s broadcast coverage, giving fans access to the game throughout their day.',
  },
];
