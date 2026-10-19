# Turkish translation guide

Task Conquest is a cozy pixel-art RPG to-do app. Turkish should read like a friendly, playful game: informal
"sen", short, natural. Never word-for-word. Keep the app name **Task Conquest** untranslated.

## Terms (always the same)

| English | Turkish |
| --- | --- |
| quest / quests | görev / görevler |
| list | liste |
| Today | Bugün |
| Everything | Her Şey |
| Daily Quests / Weekly Quests / Side Quests | Günlük Görevler / Haftalık Görevler / Yan Görevler |
| Groceries / supply list | Market / alışveriş listesi |
| pantry | kiler |
| hero | kahraman |
| level, Lv | seviye, Sv |
| XP | XP |
| gold, "15g" | altın, "15 altın" (in tight spots the number with the coin icon) |
| monster | canavar |
| boss | boss |
| loot | ganimet |
| item | eşya |
| gear | teçhizat |
| equip / unequip | kuşan / çıkar |
| bag | çanta |
| potion | iksir |
| shop | dükkan |
| streak | seri (e.g. "3 günlük seri") |
| daily / weekly / monthly | günlük / haftalık / aylık |
| party (shared lists, friends) | ekip |
| leaderboard | sıralama |
| achievements | başarımlar |
| title (earned) | unvan |
| skill | yetenek |
| difficulty: Trivial / Easy / Normal / Hard / Epic | Çok Kolay / Kolay / Normal / Zor / Destansı |
| stakes: Must do / Flexible; chips "!! MUST" / "! FLEX" | Şart / Esnek; "!! ŞART" / "! ESNEK" |
| reminders / notifications | hatırlatıcılar / bildirimler |
| Options (the tab) | Ayarlar |
| sign in / sign out / create account | giriş yap / çıkış yap / hesap oluştur |
| Forgot password? | Şifreni mi unuttun? |
| cloud / sync | bulut / eşitleme (Eşitle) |
| Home Screen, Share, Add to Home Screen (iPhone labels) | Ana Ekran, Paylaş, Ana Ekrana Ekle |
| iPhone Settings › Notifications | Ayarlar › Bildirimler |
| classes: Knight, Mage, Ranger, Rogue, Berserker | Şövalye, Büyücü, Korucu, Haydut, Berserker |
| races: Human, Elf, Dwarf, Orc, Imp, Undead, Catfolk, Lizardfolk | İnsan, Elf, Cüce, Ork, İmp, Ölümsüz, Kedi Halkı, Kertenkele Halkı |

Monster, boss, item and achievement names: make them fun and natural in Turkish (puns welcome), not literal.

## How to mark text in code

- `import { t, tn, tk, upper, locale } from '…/i18n'` (relative path to `src/i18n`).
- Wrap **every** text a player can see: JSX text, `aria-label`, `title`, `placeholder`, `alert`/`confirm`,
  toasts, banners, log lines, error messages shown to the player, notification text.
- One whole sentence = one key. Use placeholders, never string concatenation:
  `t('Missed {title} and lost {gold} gold', { title, gold })`.
- Plurals: `tn(n, '{n} quest left', '{n} quests left')` (English picks; Turkish usually has the same form for both).
- Never call `t()` when a module loads (top-level constants): the language isn't known yet. Translate where
  the text is shown (`t(CONST.label)`), or turn the constant into a function. In data tables, mark English
  text with `tk('…')` so the completeness test sees it, and call `t()` on it where it's displayed.
  Calling `t()` on already-translated text is harmless.
- Upper-casing text that is shown: `upper(s)`, not `s.toUpperCase()` (Turkish i → İ).
- Dates and numbers: `toLocaleDateString(locale(), …)`, `n.toLocaleString(locale())`.
- Don't translate: player content (quest titles, list names, hero names), ids, storage keys, CSS, console logs.
- Don't change behavior, and keep the English text exactly as it is.

## Where Turkish goes

Add `'English text': 'Türkçe',` entries to your group's file in `src/i18n/tr/` only. The key must be exactly the
English string as it appears in the code (same punctuation, same `{placeholders}`). Placeholders must survive
in the Turkish text. `src/i18n/i18n.test.ts` checks every key and placeholder, and lists English left in screens.
