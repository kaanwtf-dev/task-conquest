// "What's new" notes, newest first. Each update that players should hear about adds an entry here (and,
// optionally, a small screenshot in public/whats-new/). Players see the newest entry once, the next time
// they open the app after updating; brand-new players don't (src/ui/components/WhatsNew.tsx).

export interface Release {
  version: string;
  date: string;
  title: string;
  items: string[];
  /** a small screenshot in public/whats-new/ */
  image?: string;
}

export const RELEASES: Release[] = [
  {
    version: '1.1',
    date: '2026-10-19',
    title: 'Urgency at a glance',
    items: [
      'Quests that cost you when missed now show it: a red stripe and !! MUST for must-do quests, a yellow stripe and ! FLEX for flexible ones.',
      'See every list at once: tap ☰ and pick “Everything”.',
      'The hero now sits in the top bar by default (change it in Options).',
      'Reminders are back, with deadline warnings.',
      'Got an idea or found a bug? Send feedback from Options.',
    ],
    image: 'whats-new/1.1.png',
  },
];

export const LATEST_VERSION = RELEASES[0].version;
