// First-run walkthrough: a few short illustrated cards on what Questlog is and how it works.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { heroLook } from '../../game/look';
import { CLASS_BY_ID } from '../../game/catalog';
import { heroPix, type Appearance } from '../../pixel/sprites/hero';
import { monsterPix } from '../../pixel/sprites/monsters';
import { bossUrl, chestUrl, itemIconUrl, potionIconUrl } from '../../pixel/sprites/items';
import { MATERIALS } from '../../pixel/sprites/gear';
import { spriteUrl } from '../../pixel/pix';
import { iconFor } from '../../pixel/iconGen';
import { BodyPortal, PxImg, SceneBanner, Ui } from '../components/common';
import { sfx, unlockAudio } from '../../audio/sfx';

const GUIDE: Appearance = { race: 'human', skin: 1, hair: 'short', hairColor: '#5a3a22', eyes: '#3a5a9a', beard: 'none', outfit: '#3a6ad0', pants: '#4a3a2a' };
const FRIEND: Appearance = { race: 'elf', skin: 0, hair: 'long', hairColor: '#e8c070', eyes: '#2a8a5a', beard: 'none', outfit: '#8a4ac0', pants: '#2a2a3a' };

interface Card {
  title: string;
  body: string;
  art: () => React.ReactNode;
}

export default function Intro() {
  const hero = useStore((s) => s.hero);
  const items = useStore((s) => s.items);
  const update = useStore((s) => s.updateSettings);
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number } | null>(null);

  // the player's own hero once they have one, otherwise a stand-in knight
  const me = useMemo(
    () =>
      hero
        ? spriteUrl(`intro:me:${JSON.stringify(hero.appearance)}:${JSON.stringify(heroLook(hero, items))}`, () => heroPix(hero.appearance, heroLook(hero, items)))
        : spriteUrl('intro:guide', () => heroPix(GUIDE, CLASS_BY_ID.knight.look)),
    [hero, items],
  );
  const friend = spriteUrl('intro:friend', () => heroPix(FRIEND, CLASS_BY_ID.mage.look));
  const slime = spriteUrl('intro:slime', () => monsterPix('slime'));

  const cards: Card[] = [
    {
      title: 'Welcome, adventurer!',
      body: 'Questlog is a to-do list that plays like a pixel RPG. Every task you finish is a monster your hero defeats.',
      art: () => (
        <SceneBanner theme="forest" height={60} scale={2}>
          <div className="intro-duel">
            <PxImg src={me} size={80} />
            <span className="intro-vs">VS</span>
            <PxImg src={slime} size={64} className="flip" />
          </div>
        </SceneBanner>
      ),
    },
    {
      title: 'Tick a task, slay a monster',
      body: 'Check something off and your hero attacks. You earn XP and gold, and sometimes loot. Harder tasks pay more.',
      art: () => (
        <div className="intro-mock">
          <div className="task">
            <span className="check on" aria-hidden>
              <Ui name="check" size={22} />
            </span>
            <PxImg className="ticon" src={iconFor('Water the plants')} size={32} />
            <div className="tmain">
              <div className="ttitle">Water the plants</div>
            </div>
            <span className="intro-float">+12 XP +4g</span>
          </div>
          <div className="intro-loot">
            <PxImg src={chestUrl(2, true)} size={44} />
            <PxImg src={itemIconUrl({ slot: 'weapon', base: 'sword', palette: MATERIALS.steel })} size={36} />
            <span className="intro-rare">Rare loot!</span>
          </div>
        </div>
      ),
    },
    {
      title: 'A list for everything',
      body: 'Tap a task to edit it, hold and drag to reorder. Add your own lists with any name.',
      art: () => (
        <div className="intro-lists">
          {[
            ['☀️', 'Daily', 'resets every morning'],
            ['📅', 'Weekly', 'resets every week'],
            ['⚔️', 'Quests', 'one-offs, with due dates'],
            ['🛒', 'Groceries', 'remembers items; swipe one away if you added it by mistake'],
          ].map(([icon, name, what]) => (
            <div key={name} className="intro-list">
              <PxImg src={iconFor('', icon)} size={28} />
              <div>
                <b>{name}</b> <span className="muted">· {what}</span>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: 'Grow forever',
      body: 'There is no level cap. Find and upgrade gear, brew potions, shop for new looks, and every task chips away at the next boss.',
      art: () => (
        <div className="intro-grow">
          <PxImg src={bossUrl('mushroom', 0)} size={84} />
          <div className="intro-gear">
            <PxImg src={itemIconUrl({ slot: 'head', base: 'helm', palette: MATERIALS.gold })} size={36} />
            <PxImg src={itemIconUrl({ slot: 'offhand', base: 'shield', palette: MATERIALS.elven })} size={36} />
            <PxImg src={potionIconUrl('fortune', 2)} size={36} />
            <PxImg src={itemIconUrl({ slot: 'trinket', base: 'amulet', palette: MATERIALS.infernal })} size={36} />
          </div>
          <div className="intro-lv">No level cap</div>
        </div>
      ),
    },
    {
      title: 'Better together',
      body: 'Sign in on the Party tab to sync your iPhone and Mac, and share a list with your party, like groceries with your partner.',
      art: () => (
        <div className="intro-party">
          <div className="intro-pair">
            <PxImg src={me} size={72} />
            <PxImg src={friend} size={72} />
          </div>
          <div className="intro-tip">
            Tip: drag the hero window anywhere (or off the edge to hide it), and tap your hero to say hi.
          </div>
        </div>
      ),
    },
  ];
  const last = i === cards.length - 1;
  const card = cards[i];

  const finish = () => {
    unlockAudio();
    sfx.pop();
    update({ introSeen: true });
  };
  const go = (to: number) => {
    if (to < 0 || to >= cards.length) return;
    sfx.tick();
    setI(to);
    // Previous turns off on the first card: keep keyboard focus inside the card
    if (to === 0) requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('.intro-next')?.focus({ preventScroll: true }));
  };

  // focus starts on the main button and stays inside the card (and goes back where it was when it closes);
  // Esc skips, arrows page
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    box.current?.querySelector<HTMLElement>('.intro-next')?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = box.current;
      if (!el) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        finish();
      } else if (e.key === 'ArrowRight') go(i + 1);
      else if (e.key === 'ArrowLeft') go(i - 1);
      else if (e.key === 'Tab') {
        const all = [...el.querySelectorAll<HTMLElement>('button:not([disabled])')];
        if (!all.length) return;
        const at = all.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey ? (at <= 0 ? all.length - 1 : at - 1) : at === all.length - 1 || at < 0 ? 0 : at + 1;
        e.preventDefault();
        all[next].focus();
      } else return;
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  });

  return (
    <BodyPortal>
      {() => (
        // `sheet-back` keeps the app's own keyboard shortcuts off while this is open
        <div className="sheet-back intro-back">
          <div
            ref={box}
            className="win intro"
            role="dialog"
            aria-modal="true"
            aria-labelledby="intro-title"
            aria-describedby="intro-body"
            // finger swipes page through; a mouse drag is a click or a text selection, not a swipe
            onPointerDown={(e) => (press.current = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY })}
            onPointerUp={(e) => {
              const p = press.current;
              press.current = null;
              if (!p) return;
              const dx = e.clientX - p.x;
              if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - p.y) * 1.5) go(dx < 0 ? i + 1 : i - 1);
            }}
          >
            <button className="intro-skip" onClick={finish}>
              {last ? 'Close' : 'Skip'}
            </button>
            <div key={i} className="intro-card">
              <div className="intro-art" aria-hidden>
                {card.art()}
              </div>
              <h2 id="intro-title" className="win-title intro-title">
                {card.title}
              </h2>
              <p id="intro-body" className="intro-body">
                {card.body}
              </p>
            </div>
            <div className="intro-foot">
              <button className="btn ghost small" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous">
                ‹
              </button>
              <div className="intro-dots" aria-label={`Card ${i + 1} of ${cards.length}`} role="img">
                {cards.map((_, n) => (
                  <span key={n} className={n === i ? 'on' : ''} />
                ))}
              </div>
              <button className="btn intro-next" onClick={() => (last ? finish() : go(i + 1))}>
                {last ? "Let's go!" : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}
    </BodyPortal>
  );
}
