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
}

export default function Effects() {
  const [floats, setFloats] = useState<Floating[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);

  useEffect(() => {
    const addBanner = (b: Omit<Banner, 'id'>, ms: number) => {
      const id = uid();
      setBanners((bs) => [...bs.slice(-2), { ...b, id }]);
      setTimeout(() => setBanners((bs) => bs.filter((x) => x.id !== id)), ms);
    };
    return fx.on((e) => {
      const { settings } = useStore.getState();
      const sound = settings.sfx > 0;
      if (e.type === 'kill') {
        if (lastTap) {
          const id = uid();
          const at = lastTap;
          setFloats((f) => [...f, { id, x: at.x, y: at.y - 10, text: `+${e.xp} XP  +${e.gold}g`, color: e.crit ? '#ff7a5a' : '#ffd860' }]);
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
      if (e.type === 'toast') addBanner({ big: e.text, small: e.small, icon: e.icon }, 2200);
    });
  }, []);

  return (
    <>
      {floats.map((f) => (
        <div key={f.id} className="float-reward" style={{ left: f.x, top: f.y, color: f.color }}>
          {f.text}
        </div>
      ))}
      <div className="toast-wrap">
        {banners.map((b) => (
          <div key={b.id} className="win toast" onClick={() => setBanners((bs) => bs.filter((x) => x.id !== b.id))}>
            <div className="toast-row">
              {b.icon && <img className="px" src={b.icon} width={40} height={40} alt="" />}
              <div>
                <div className="big">{b.big}</div>
                {b.small && (
                  <div className="small" style={b.color ? { color: b.color } : undefined}>
                    {b.small}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
