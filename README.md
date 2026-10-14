# Questlog

A pixel-art RPG to-do list for iPhone and Mac. Every task you complete spawns a monster, and your hero slays it for XP, gold and loot.

It is an installable web app (PWA) that works offline:
- **iPhone:** open the site in Safari, then Share → **Add to Home Screen**.
- **Mac:** open it in Safari, then File → **Add to Dock**.

> **Re-adding the app (iPhone):** a home-screen app keeps its own storage, so removing its icon deletes the hero and lists on that phone. First sign in on the **Party** tab and let it sync (or use Options → **Export save**), then remove the icon, add it again from Safari, and sign in.

## What's inside

**To-do lists (the main thing)**
- **List types:**
  - Daily, Weekly: reset automatically
  - Quests: no time limit
  - Supply: grocery-style, see below
  - Custom: per-task repeat rules
- **Per-task repeats:** daily, specific weekdays, weekly, monthly, or every N days
- **Task details:** due dates, notes, and difficulty (Trivial → Epic); harder tasks are worth more XP
- **Today view:** overdue items, things due today, daily routines and this week's tasks, across every list
- **Reordering:** long-press (iPhone) or drag (Mac)
- **Night owls:** a configurable "new day starts at" hour
- **Supply lists never forget an item:**
  - Checking something off moves it to the pantry, and tapping it puts it back on the list.
  - Items are grouped by store aisle.
  - Mark staples, then one tap restocks all of them.
- **Auto icons:** every item gets a pixel icon generated in real time from its name ("milk" → a pixel milk carton). You can also pick any emoji.

**The RPG**
- **Hero creator:** 8 races, each with a perk (Human, Elf, Dwarf, Orc, Imp, Undead, Catfolk, Lizardfolk), and 5 classes. Hair, beard, skin, eyes, outfit and dyes are all customizable.
- **Corner battles:** your hero idles in the corner, and every completed task makes a zone monster drop in to be slain.
  - **Skippable:** animations can be set to full, quick or off, and tapping the stage skips the current one.
- **Zone themes per list:** Tavern, Forest, Beach, Dungeon, Snowpeak, Desert, Castle, Volcano. Each zone has its own monsters.
- **Infinite progression:**
  - Levels and skills never cap. Skills level up by doing things, Elder Scrolls style.
  - Procedural loot has 7 rarities, endless material tiers, enchantments, and blacksmith upgrades.
  - Potions give temporary buffs; a Phoenix Feather restores a broken streak.
  - An endless boss ladder takes damage from every task you finish.
  - Achievements have infinite tiers and unlock titles.
- **Shop:** daily wares, potions, bag upgrades, early zone unlocks, and dyes.
- **Sound:** chiptune effects and optional music, all synthesized live.

**Sync and party lists (optional)**
- Data is local-first: everything is stored on the device and works offline.
- Connect a free Supabase project to sync iPhone ↔ Mac.
- Share lists (groceries, chores…) with friends and family through an invite code or link. Members appear as their heroes, checks show up instantly, and whoever completes a quest gets the XP.
- Setup guide: [docs/SYNC_SETUP.md](docs/SYNC_SETUP.md)

## Hosting it (GitHub Pages)

The workflow in `.github/workflows/deploy.yml` builds and publishes the app on every push to `main`. One-time setup: repository **Settings → Pages → Source: GitHub Actions**. The cloud (Supabase) settings are built in from `.env.production`, so everyone who opens the site is connected without entering anything; repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (set both) override them. **Forks:** that file points at this repository owner's project; put your own values in it, or delete it so players can enter a cloud in the Party tab.

## Development

```bash
npm install
npm run dev        # http://localhost:5173  (sprite lab: /#lab)
npm test           # vitest
npm run build
node scripts/flow.mjs http://localhost:5173/ shots   # screenshot walkthrough
```

All art and sound is generated in code (`src/pixel`, `src/audio`). The project has no image or audio assets apart from the generated app icons.
