// Item / potion icons with rarity frames, and the item detail sheet (equip, upgrade, sell, lock, buy).
import type { CSSProperties } from 'react';
import type { HeroStats, Item, PotionId, StatId } from '../../core/types';
import { RARITIES, baseName, itemDisplayName, itemPower, materialOf, sellPrice, upgradeCost } from '../../game/loot';
import { STAT_INFO, computeStats } from '../../game/stats';
import { itemIconUrl, potionIconUrl } from '../../pixel/sprites/items';
import { equippedItems, useStore } from '../../state/store';
import { heroGold } from '../../game/progression';
import { PxImg, Sheet, Ui } from './common';
import { sfx } from '../../audio/sfx';

export function rarityColor(r: number): string {
  return RARITIES[Math.max(0, Math.min(RARITIES.length - 1, r))]?.color ?? '#ffffff';
}

export function ItemIcon({ item, size = 44, onClick, badge, style }: { item: Item; size?: number; onClick?: () => void; badge?: string; style?: CSSProperties }) {
  const url = itemIconUrl({ slot: item.slot, base: item.base, palette: materialOf(item).palette });
  const c = rarityColor(item.rarity);
  return (
    <button
      type="button"
      className={`item-cell r${item.rarity}`}
      style={{ ['--rc' as string]: c, width: size + 12, height: size + 12, ...style }}
      onClick={onClick}
      aria-label={itemDisplayName(item)}
    >
      <PxImg src={url} size={size} />
      {item.upgrade > 0 && <span className="item-plus">+{item.upgrade}</span>}
      {item.locked && <span className="item-lock">🔒</span>}
      {badge && <span className="item-badge">{badge}</span>}
    </button>
  );
}

export function PotionIcon({ potion, tier, size = 32 }: { potion: PotionId; tier: number; size?: number }) {
  return <PxImg src={potionIconUrl(potion, tier)} size={size} />;
}

function statLines(item: Item): { stat: StatId; value: number }[] {
  return item.affixes.map((a) => ({ stat: a.stat, value: a.value }));
}

/** Detail sheet. `mode` = 'owned' (bag/equipped) or 'shop' (shows a Buy button with `price`). */
export function ItemSheet({ item: given, onClose, mode = 'owned', price, onBuy }: { item: Item; onClose: () => void; mode?: 'owned' | 'shop'; price?: number; onBuy?: () => void }) {
  const s = useStore();
  const hero = s.hero!;
  // owned items are read live so upgrade/sell prices and the lock state never go stale
  const item = mode === 'owned' ? s.items[given.id] ?? given : given;
  if (mode === 'owned' && item.deleted) {
    queueMicrotask(onClose);
    return null;
  }
  const eq = equippedItems(s);
  const isEquipped = hero.equipped[item.slot] === item.id;
  const current = eq[item.slot];
  const mat = materialOf(item);
  const power = itemPower(item);
  const curPower = current && current.id !== item.id ? itemPower(current) : null;
  const gold = heroGold(hero);
  const cost = upgradeCost(item);
  const sale = sellPrice(item);

  // what equipping this would do to overall stats
  const before: HeroStats = computeStats(hero, s.items);
  const after: HeroStats =
    isEquipped || mode === 'shop'
      ? before
      : computeStats({ ...hero, equipped: { ...hero.equipped, [item.slot]: item.id } }, { ...s.items, [item.id]: item });
  const shopAfter = mode === 'shop' ? computeStats({ ...hero, equipped: { ...hero.equipped, [item.slot]: item.id } }, { ...s.items, [item.id]: item }) : after;
  const cmp = mode === 'shop' ? shopAfter : after;
  const diffs = (Object.keys(STAT_INFO) as StatId[])
    .map((k) => ({ k, d: Math.round((cmp[k] - before[k]) * 10) / 10 }))
    .filter((x) => x.d !== 0);
  const powerDiff = Math.round(cmp.power - before.power);

  return (
    <Sheet onClose={onClose} className="item-sheet">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <ItemIcon item={item} size={64} />
          <div style={{ minWidth: 0 }}>
            <div className="item-name" style={{ color: rarityColor(item.rarity) }}>
              {itemDisplayName(item)}
            </div>
            <div className="item-sub">
              {RARITIES[item.rarity]?.name} {baseName(item.base)} · {mat.name} · iLvl {item.ilvl}
            </div>
          </div>
        </div>

        <div className="item-power">
          <Ui name="sword" size={18} /> Power <b>{power.toLocaleString()}</b>
          {curPower != null && (
            <span className={power >= curPower ? 'up' : 'down'}>
              {power >= curPower ? '▲' : '▼'} {Math.abs(power - curPower).toLocaleString()} vs equipped
            </span>
          )}
          {isEquipped && <span className="eq-tag">EQUIPPED</span>}
        </div>

        {item.affixes.length > 0 ? (
          <div className="affixes">
            {statLines(item).map((a) => (
              <div key={a.stat} className="affix">
                ✦ {STAT_INFO[a.stat].describe(a.value)}
              </div>
            ))}
          </div>
        ) : (
          <div className="affixes muted">No enchantments.</div>
        )}

        {!isEquipped && (diffs.length > 0 || powerDiff !== 0) && (
          <div className="diffs">
            <div className="pixel" style={{ fontSize: 8, color: 'var(--muted)', marginBottom: 6 }}>
              IF EQUIPPED
            </div>
            {powerDiff !== 0 && <span className={powerDiff > 0 ? 'up' : 'down'}>{powerDiff > 0 ? '+' : ''}{powerDiff} Power</span>}
            {diffs.map((x) => (
              <span key={x.k} className={x.d > 0 ? 'up' : 'down'}>
                {x.d > 0 ? '+' : ''}
                {x.d}% {STAT_INFO[x.k].short}
              </span>
            ))}
          </div>
        )}

        <div className="item-actions">
          {mode === 'shop' ? (
            <>
              <button className="btn ghost" onClick={onClose}>
                Close
              </button>
              <button className="btn" disabled={price == null || gold < price} onClick={onBuy}>
                Buy · {price?.toLocaleString()}g
              </button>
            </>
          ) : (
            <>
              <button
                className="btn ghost small"
                onClick={() => {
                  s.toggleLock(item.id);
                  sfx.tick();
                }}
              >
                {item.locked ? 'Unlock' : 'Lock'}
              </button>
              {!isEquipped && (
                <button
                  className="btn ghost small"
                  disabled={!!item.locked}
                  onClick={() => {
                    if (item.rarity >= 2 && !confirm(`Sell ${itemDisplayName(item)} for ${sale}g?`)) return;
                    if (s.sellItem(item.id)) {
                      sfx.coin();
                      onClose();
                    }
                  }}
                >
                  Sell {sale.toLocaleString()}g
                </button>
              )}
              <button
                className="btn ghost small"
                disabled={gold < cost}
                onClick={() => {
                  if (s.upgradeItem(item.id)) {
                    sfx.hit();
                    setTimeout(() => sfx.loot(), 120);
                  } else sfx.error();
                }}
                title="Blacksmith upgrade"
              >
                ⚒ +{item.upgrade + 1} · {cost.toLocaleString()}g
              </button>
              {isEquipped ? (
                <button
                  className="btn small"
                  onClick={() => {
                    s.unequip(item.slot);
                    sfx.uncheck();
                    onClose();
                  }}
                >
                  Unequip
                </button>
              ) : (
                <button
                  className="btn small"
                  onClick={() => {
                    s.equip(item.id);
                    sfx.slash();
                    onClose();
                  }}
                >
                  Equip
                </button>
              )}
            </>
          )}
        </div>
    </Sheet>
  );
}
