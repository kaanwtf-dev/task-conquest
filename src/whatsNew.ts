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
    version: '1.7',
    date: '2026-10-21',
    title: tk('Party lists: disband and make private'),
    items: [
      tk('New: the owner of a party list can disband it on the Party tab. You keep the list, and everyone else keeps their own private copy, so nobody loses a quest.'),
      tk('A party list with only you in it can be made private again with one tap.'),
      tk('Fixed: Invite no longer gets stuck. If the cloud does not answer, you get a message after a few seconds, and the invite code can be closed.'),
    ],
  },
  {
    version: '1.6',
    date: '2026-10-21',
    title: tk('Party quests count too'),
    items: [
      tk('Fixed: quests on a party list (like a shared “Daily Quests”) now send a “time’s up” notification, ask what happened, and hurt when missed, just like your own lists.'),
      tk('Only the one who made a party quest gets its notifications and its hit. Your friends are never punished for your quests, or you for theirs.'),
      tk('The “time’s up” notification now asks: “Did you do it?” Tap it and the app asks what happened.'),
    ],
  },
  {
    version: '1.5',
    date: '2026-10-21',
    title: tk("Time's up notifications fixed"),
    items: [
      tk("Fixed: the “time's up” notification now comes the moment a deadline passes, at night too. Before, it waited until morning and could get lost if you opened the app."),
      tk('Quests that run out at the same time come as one notification instead of a pile.'),
      tk('Deadline notifications go out at top priority, so a sleeping phone shows them right away.'),
      tk('Daily quests with a “done by” time also tell you when time is up, even without stakes.'),
      tk('New in Options › Reminders: see your next deadline notification, and send yourself a test.'),
    ],
  },
  {
    version: '1.4',
    date: '2026-10-20',
    title: tk('Dailies and weeklies count now'),
    items: [
      tk('Repeating quests are flexible by default: skip a daily or weekly and your hero takes a small hit, no deadline needed. Starting tomorrow.'),
      tk('The hit lands the moment the game notices. Did it after all? Tap “I did it” and get your gold back.'),
      tk('Want a quest without stakes? Open it and set “If you miss it” to Nothing.'),
      tk('Language follows your browser now, and you can pick English or Türkçe on the first screen.'),
      tk('Your settings follow your account to every device you sign in on.'),
      tk('Small fix: the number 5 is easier to read.'),
    ],
    image: 'whats-new/1.4.png',
  },
  {
    version: '1.3',
    date: '2026-10-19',
    title: tk('Missing a quest now hurts'),
    items: [
      tk('When a timed quest runs out, the game asks what happened: you did it, more time, skip it, or take the hit.'),
      tk('Missed it? Your hero gets hit: a red flash, a shake, a cry of pain and gold spilling out.'),
      tk('Every miss is counted: in a row and in total, on the quest and in the question.'),
      tk('A notification tells you when time runs out. Leave the question unanswered for a day and it counts as missed.'),
    ],
    image: 'whats-new/1.3.png',
  },
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
