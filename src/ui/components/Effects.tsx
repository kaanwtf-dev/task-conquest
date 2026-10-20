// Global reward feedback: floating "+XP", level-up / quest-complete banners, sounds, haptics.
import { useEffect, useState } from 'react';
import { fx } from '../../state/fx';
import { useStore } from '../../state/store';
import { sfx } from '../../audio/sfx';
import { uid } from '../../state/store';
import { RARITIES, itemDisplayName, materialOf } from '../../game/loot';
import { itemIconUrl, potionIconUrl } from '../../pixel/sprites/items';
import { potionName } from '../../game/potions';
import { locale, t, upper } from '../../i18n';

let lastTap: { x: number; y: number } | null = null;
/** Rows call this so rewards float up from where the user tapped. */
export function markTap(x: number, y: number) {
  lastTap = { x, y };
}

/** iOS Safari has no vibrate(); toggling a native switch input triggers a haptic tick (iOS 18+). */
let hapticLabel: HTMLLabelElement | null = null;
export function haptic() {
  // browsers refuse (and complain) before the first tap, e.g. a missed quest charged as the app opens
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  if (navigator.vibrate) {
    navigator.vibrate(12);
    return;
  }
  if (!hapticLabel) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.id = 'haptic-switch';
    input.style.display = 'none';
    hapticLabel = document.createElement('label');
    hapticLabel.htmlFor = 'haptic-switch';
    hapticLabel.style.display = 'none';
    document.body.append(input, hapticLabel);
  }
  hapticLabel.click();
}

interface Floating {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}
interface Banner {
  id: string;
  big: string;
  small?: string;
  icon?: string;
  color?: string;
  /** the same pop-up again right away shows once, with a count */
  count?: number;
}
type BannerIn = Omit<Banner, 'id' | 'count'>;

/** Reward pop-ups kept behind the one on screen until cleared. */
const KEEP = 40;
const same = (a: BannerIn | undefined, b: BannerIn) => !!a && a.big === b.big && a.small === b.small && a.icon === b.icon;

export default function Effects() {
  const [floats, setFloats] = useState<Floating[]>([]);
  // brief pop-ups at the top (messages, and rewards when set to hide by themselves): taps go through them
  const [brief, setBrief] = useState<Banner[]>([]);
  // reward pop-ups that stay until cleared, one at a time above the tab bar, newest first
  const [notes, setNotes] = useState<Banner[]>([]);
  const dismiss = (id: string) => setNotes((ns) => ns.filter((x) => x.id !== id));
  // the red flash of the last hit (keyed by when, so a second hit restarts it)
  const [hurt, setHurt] = useState(0);
  useEffect(() => {
    if (!hurt) return;
    const id = setTimeout(() => setHurt(0), 800);
    return () => clearTimeout(id);
  }, [hurt]);

  useEffect(() => {
    const addBanner = (b: BannerIn, ms: number, reward = true) => {
      const id = uid();
      if (reward && useStore.getState().settings.popups !== 'auto') {
        setNotes((ns) => {
          const top = ns[ns.length - 1];
          if (same(top, b)) return [...ns.slice(0, -1), { ...top, count: (top.count ?? 1) + 1 }];
          return [...ns.slice(-(KEEP - 1)), { ...b, id }];
        });
        return;
      }
      setBrief((bs) => {
        const top = bs[bs.length - 1];
        // tapping Buy three times on a full bag says so once (x3), not three times
        if (same(top, b)) return [...bs.slice(0, -1), { ...b, id, count: (top.count ?? 1) + 1 }];
        return [...bs.slice(-2), { ...b, id }];
      });
      setTimeout(() => setBrief((bs) => bs.filter((x) => x.id !== id)), ms);
    };
    return fx.on((e) => {
      const { settings } = useStore.getState();
      const sound = settings.sfx > 0;
      if (e.type === 'kill') {
        if (lastTap) {
          const id = uid();
          const at = lastTap;
          // concurrent floats stack upwards instead of smearing on one spot
          setFloats((f) => [...f, { id, x: at.x, y: at.y - 10 - Math.min(f.length, 4) * 16, text: t('+{xp} XP  +{gold}g', { xp: e.xp, gold: e.gold }), color: e.crit ? '#ff7a5a' : '#ffd860' }]);
          setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 950);
        }
        if (settings.anim === 'off' && sound) sfx.coin();
      }
      if (e.type === 'levelUp') {
        if (sound) setTimeout(() => sfx.levelUp(), 450);
        addBanner({ big: t('LEVEL UP!'), small: t('You reached level {level}', { level: e.level }) }, 2600);
      }
      if (e.type === 'checkIn') {
        if (sound) setTimeout(() => sfx.coin(), 300);
        addBanner(
          {
            big: e.bonus ? t('DAY {day} BONUS!', { day: e.day }) : t('DAY {day} CHECK-IN', { day: e.day }),
            small:
              e.day > 1
                ? t('Welcome back! +{gold}g +{xp} XP · {day}-day login streak', { gold: e.gold, xp: e.xp, day: e.day })
                : t('Welcome back! +{gold}g +{xp} XP', { gold: e.gold, xp: e.xp }),
          },
          2600,
        );
      }
      if (e.type === 'hurt') {
        if (sound) sfx.hurt(e.gold > 0);
        if (settings.haptics) {
          haptic();
          setTimeout(haptic, 160);
        }
        setHurt(Date.now());
        if (settings.anim !== 'off') {
          document.body.classList.remove('hurt-shake');
          void document.body.offsetWidth; // restart the shake if it is still running
          document.body.classList.add('hurt-shake');
          setTimeout(() => document.body.classList.remove('hurt-shake'), 500);
        }
      }
      if (e.type === 'missed') {
        addBanner(
          {
            big: e.stakes === 'must' ? t('💥 MISSED!') : t('MISSED'),
            small: `${e.title}${e.gold ? ` · ${t('lost {gold}g', { gold: e.gold })}` : ''}${e.misses > 1 ? ` · ${t('{n} in a row', { n: e.misses })}` : ''}`,
            color: '#e04848',
          },
          3200,
        );
      }
      if (e.type === 'skillUp') addBanner({ big: upper(t(e.skill)), small: t('Skill increased to {level}', { level: e.level }) }, 2000);
      if (e.type === 'questComplete') {
        if (sound) setTimeout(() => sfx.questComplete(), 600);
        addBanner({ big: t('QUEST COMPLETE!'), small: e.item ? t('{list} cleared! Chest: {gold}g + {item}', { list: e.listName, gold: e.gold, item: itemDisplayName(e.item) }) : t('{list} cleared! Chest: {gold}g', { list: e.listName, gold: e.gold }), icon: e.item ? itemIconUrl({ slot: e.item.slot, base: e.item.base, palette: materialOf(e.item).palette }) : undefined, color: e.item ? RARITIES[e.item.rarity]?.color : undefined }, 3200);
      }
      if (e.type === 'loot') {
        if (e.item) {
          const r = RARITIES[e.item.rarity];
          if (sound) setTimeout(() => (e.item!.rarity >= 3 ? sfx.levelUp() : sfx.loot()), 650);
          addBanner(
            {
              big: e.soldFor ? t('BAG FULL') : upper(t('{rarity} loot!', { rarity: t(r?.name ?? '') })),
              small: e.soldFor ? t('Sold {item} for {gold}g', { item: itemDisplayName(e.item), gold: e.soldFor }) : itemDisplayName(e.item),
              icon: itemIconUrl({ slot: e.item.slot, base: e.item.base, palette: materialOf(e.item).palette }),
              color: r?.color,
            },
            e.item.rarity >= 3 ? 3200 : 2200,
          );
        } else if (e.potion) {
          if (sound) setTimeout(() => sfx.pop(), 650);
          addBanner({ big: t('POTION FOUND'), small: potionName(e.potion.potion, e.potion.tier), icon: potionIconUrl(e.potion.potion, e.potion.tier) }, 2000);
        }
      }
      if (e.type === 'bossDefeated') {
        if (sound) setTimeout(() => sfx.questComplete(), 500);
        addBanner(
          {
            big: t('BOSS DEFEATED!'),
            small: e.item
              ? t('{name} falls! +{gold}g · {item}', { name: t(e.name), gold: e.gold.toLocaleString(locale()), item: itemDisplayName(e.item) })
              : t('{name} falls! +{gold}g', { name: t(e.name), gold: e.gold.toLocaleString(locale()) }),
            icon: e.item ? itemIconUrl({ slot: e.item.slot, base: e.item.base, palette: materialOf(e.item).palette }) : undefined,
            color: e.item ? RARITIES[e.item.rarity]?.color : undefined,
          },
          4000,
        );
      }
      if (e.type === 'achievement') {
        if (sound) setTimeout(() => sfx.loot(), 800);
        addBanner({ big: t('ACHIEVEMENT!'), small: t('{name} — tier {tier}. Claim it on the Hero page.', { name: t(e.name), tier: e.tier }) }, 2600);
      }
      if (e.type === 'party') addBanner({ big: t('PARTY'), small: t(e.text) }, 2600);
      // messages ("Not enough gold!", "Purchased", "Ready offline") always hide by themselves
      if (e.type === 'toast') addBanner({ big: t(e.text), small: e.small && t(e.small), icon: e.icon }, 2200, false);
    });
  }, []);

  return (
    <>
      {!!hurt && <div key={hurt} className="hurt-flash" aria-hidden="true" />}
      {floats.map((f) => (
        <div key={f.id} className="float-reward" style={{ left: f.x, top: f.y, color: f.color }}>
          {f.text}
        </div>
      ))}
      <div className="toast-wrap" role="status" aria-live="polite">
        {brief.map((b) => (
          <div key={b.id} className="win toast">
            <BannerRow b={b} />
          </div>
        ))}
      </div>
      <div className="notes-wrap" role="status" aria-live="polite">
        {notes.slice(-1).map((b) => (
          // tap it to clear it; the next one (if any) takes its place
          <div key={b.id} className="win toast note" onClick={() => dismiss(b.id)}>
            <BannerRow b={b}>
              <div className="note-side">
                <button
                  className="toast-x"
                  aria-label={t('Dismiss {what}', { what: b.big })}
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss(b.id);
                  }}
                >
                  ✕
                </button>
                {notes.length > 1 && (
                  <button
                    className="note-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNotes([]);
                    }}
                  >
                    {t('Clear all ({n})', { n: notes.length })}
                  </button>
                )}
              </div>
            </BannerRow>
          </div>
        ))}
      </div>
    </>
  );
}

function BannerRow({ b, children }: { b: Banner; children?: React.ReactNode }) {
  return (
    <div className="toast-row">
      {b.icon && <img className="px" src={b.icon} width={40} height={40} alt="" />}
      <div className="toast-text">
        <div className="big">
          {b.big}
          {(b.count ?? 1) > 1 && <span className="toast-count"> ×{b.count}</span>}
        </div>
        {b.small && (
          <div className="small" style={b.color ? { color: b.color } : undefined}>
            {b.small}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
