# Questlog

A pixel-art RPG to-do list for iPhone and Mac. Complete a task, slay a monster, earn XP and gold.

Built as an installable web app (PWA): open it in Safari, then **Share → Add to Home Screen** (iPhone)
or **File → Add to Dock** (Mac).

## Features (so far)

- Hero creation: 8 races (Human, Elf, Dwarf, Orc, Imp, Undead, Catfolk, Lizardfolk) with perks,
  5 classes, and customizable skin, hair, beard, eyes and outfit
- List types: Daily, Weekly, Quests (no time limit), Supply (grocery-style, remembers items) and Custom
- Every completed task spawns a monster from the list's zone that your hero slays. Animations can be
  set to full, quick or off, and you can tap the stage to skip them
- Zone themes per list: Tavern, Forest, Beach, Dungeon, Snowpeak, Desert, Castle, Volcano
- Pixel icons generated in real time for every item you add
- Infinite levels and skills that level up through use
- Chiptune sound effects synthesized live

## Development

```bash
npm install
npm run dev        # http://localhost:5173  (sprite lab at /#lab)
npm run build
npm test
```

All art is generated in code (`src/pixel`); there are no image or sound assets.
