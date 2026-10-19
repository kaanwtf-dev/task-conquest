// "What's new" notes, newest first. Each update that players should hear about adds an entry here (and,
// optionally, a small screenshot in public/whats-new/). Players see the newest entry once, the next time
// they open the app after updating; brand-new players don't (src/ui/components/WhatsNew.tsx).
// The title and items are marked with tk() and shown through t(): each needs a Turkish line in src/i18n/tr/.
import { tk } from './i18n';

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
    version: '1.2',
    date: '2026-10-19',
    title: tk('Task Conquest speaks Turkish'),
    items: [
      tk('The whole game is now in Turkish too: quests, monsters, loot, the shop, reminders, everything.'),
      tk('Phones set to Turkish switch automatically. Pick a language any time in Options › Language.'),
      tk('Quest icons and difficulty also understand Turkish quest names (“Süt al”, “Spor yap”).'),
    ],
    image: 'whats-new/1.2.png',
  },
  {
    version: '1.1',
    date: '2026-10-19',
    title: tk('Urgency at a glance'),
    items: [
      tk('Quests that cost you when missed now show it: a red stripe and !! MUST for must-do quests, a yellow stripe and ! FLEX for flexible ones.'),
      tk('See every list at once: tap ☰ and pick “Everything”.'),
      tk('The hero now sits in the top bar by default (change it in Options).'),
      tk('Reminders are back, with deadline warnings.'),
      tk('Got an idea or found a bug? Send feedback from Options.'),
    ],
    image: 'whats-new/1.1.png',
  },
];

export const LATEST_VERSION = RELEASES[0].version;
