// Global reward feedback: floating "+XP", level-up / quest-complete banners, sounds, haptics.
import { useEffect, useState } from 'react';
import { fx } from '../../state/fx';
import { useStore } from '../../state/store';
import { sfx } from '../../audio/sfx';
import { uid } from '../../state/store';
import { RARITIES, itemDisplayName, materialOf } from '../../game/loot';
import { itemIconUrl, potionIconUrl } from '../../pixel/sprites/items';
import { potionName } from '../../game/potions';

let lastTap: { x: number; y: number } | null = null;
/** Rows call this so rewards float up from where the user tapped. */
export function markTap(x: number, y: number) {
  lastTap = { x, y };
}

/** iOS Safari has no vibrate(); toggling a native switch input triggers a haptic tick (iOS 18+). */
let hapticLabel: HTMLLabelElement | null = null;
export function haptic() {
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
          setFloats((f) => [...f, { id, x: at.x, y: at.y - 10 - Math.min(f.length, 4) * 16, text: `+${e.xp} XP  +${e.gold}g`, color: e.crit ? '#ff7a5a' : '#ffd860' }]);
          setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 950);
        }
        if (settings.anim === 'off' && sound) sfx.coin();
      }
      if (e.type === 'levelUp') {
        if (sound) setTimeout(() => sfx.levelUp(), 450);
        addBanner({ big: 'LEVEL UP!', small: `You reached level ${e.level}` }, 2600);
      }
      if (e.type === 'skillUp') addBanner({ big: e.skill.toUpperCase(), small: `Skill increased to ${e.level}` }, 2000);
      if (e.type === 'questComplete') {
        if (sound) setTimeout(() => sfx.questComplete(), 600);
        addBanner({ big: 'QUEST COMPLETE!', small: `${e.listName} cleared! Chest: ${e.gold}g${e.item ? ` + ${itemDisplayName(e.item)}` : ''}`, icon: e.item ? itemIconUrl({ slot: e.item.slot, base: e.item.base, palette: materialOf(e.item).palette }) : undefined, color: e.item ? RARITIES[e.item.rarity]?.color : undefined }, 3200);
      }
      if (e.type === 'loot') {
        if (e.item) {
          const r = RARITIES[e.item.rarity];
          if (sound) setTimeout(() => (e.item!.rarity >= 3 ? sfx.levelUp() : sfx.loot()), 650);
          addBanner(
            {
              big: e.soldFor ? 'BAG FULL' : `${r?.name ?? ''} loot!`.toUpperCase(),
              small: e.soldFor ? `Sold ${itemDisplayName(e.item)} for ${e.soldFor}g` : itemDisplayName(e.item),
              icon: itemIconUrl({ slot: e.item.slot, base: e.item.base, palette: materialOf(e.item).palette }),
              color: r?.color,
            },
            e.item.rarity >= 3 ? 3200 : 2200,
          );
        } else if (e.potion) {
          if (sound) setTimeout(() => sfx.pop(), 650);
          addBanner({ big: 'POTION FOUND', small: potionName(e.potion.potion, e.potion.tier), icon: potionIconUrl(e.potion.potion, e.potion.tier) }, 2000);
        }
      }
      if (e.type === 'bossDefeated') {
        if (sound) setTimeout(() => sfx.questComplete(), 500);
        addBanner(
          {
            big: 'BOSS DEFEATED!',
            small: `${e.name} falls! +${e.gold.toLocaleString()}g${e.item ? ` · ${itemDisplayName(e.item)}` : ''}`,
            icon: e.item ? itemIconUrl({ slot: e.item.slot, base: e.item.base, palette: materialOf(e.item).palette }) : undefined,
            color: e.item ? RARITIES[e.item.rarity]?.color : undefined,
          },
          4000,
        );
      }
      if (e.type === 'achievement') {
        if (sound) setTimeout(() => sfx.loot(), 800);
        addBanner({ big: 'ACHIEVEMENT!', small: `${e.name} — tier ${e.tier}. Claim it on the Hero page.` }, 2600);
      }
      if (e.type === 'party') addBanner({ big: 'PARTY', small: e.text }, 2600);
      // messages ("Not enough gold!", "Purchased", "Ready offline") always hide by themselves
      if (e.type === 'toast') addBanner({ big: e.text, small: e.small, icon: e.icon }, 2200, false);
    });
  }, []);

  return (
    <>
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
        {notes.length > 1 && (
          <div className="toast-more">
            <span>+{notes.length - 1} more</span>
            <button className="btn small" onClick={() => setNotes([])}>
              Clear all ({notes.length})
            </button>
          </div>
        )}
        {notes.slice(-1).map((b) => (
          // tap it to clear it; the next one (if any) takes its place
          <div key={b.id} className="win toast note" onClick={() => dismiss(b.id)}>
            <BannerRow b={b}>
              <button
                className="toast-x"
                aria-label={`Dismiss ${b.big}`}
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss(b.id);
                }}
              >
                ✕
              </button>
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
