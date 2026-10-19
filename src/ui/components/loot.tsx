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
import { locale, t } from '../../i18n';

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
              {t(RARITIES[item.rarity]?.name ?? '')} {t(baseName(item.base))} · {t(mat.name)} · {t('iLvl {n}', { n: item.ilvl })}
            </div>
          </div>
        </div>

        <div className="item-power">
          <Ui name="sword" size={18} /> {t('Power')} <b>{power.toLocaleString(locale())}</b>
          {curPower != null && (
            <span className={power >= curPower ? 'up' : 'down'}>
              {power >= curPower ? '▲' : '▼'} {t('{diff} vs equipped', { diff: Math.abs(power - curPower).toLocaleString(locale()) })}
            </span>
          )}
          {isEquipped && <span className="eq-tag">{t('EQUIPPED')}</span>}
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
          <div className="affixes muted">{t('No enchantments.')}</div>
        )}

        {!isEquipped && (diffs.length > 0 || powerDiff !== 0) && (
          <div className="diffs">
            <div className="pixel" style={{ fontSize: 8, color: 'var(--muted)', marginBottom: 6 }}>
              {t('IF EQUIPPED')}
            </div>
            {powerDiff !== 0 && <span className={powerDiff > 0 ? 'up' : 'down'}>{t('{n} Power', { n: `${powerDiff > 0 ? '+' : ''}${powerDiff}` })}</span>}
            {diffs.map((x) => (
              <span key={x.k} className={x.d > 0 ? 'up' : 'down'}>
                {x.d > 0 ? '+' : ''}
                {x.d}% {t(STAT_INFO[x.k].short)}
              </span>
            ))}
          </div>
        )}

        <div className="item-actions">
          {mode === 'shop' ? (
            <>
              <button className="btn ghost" onClick={onClose}>
                {t('Close')}
              </button>
              <button className="btn" disabled={price == null || gold < price} onClick={onBuy}>
                {t('Buy · {gold}g', { gold: price?.toLocaleString(locale()) ?? '' })}
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
                {item.locked ? t('Unlock') : t('Lock')}
              </button>
              {!isEquipped && (
                <button
                  className="btn ghost small"
                  disabled={!!item.locked}
                  onClick={() => {
                    if (item.rarity >= 2 && !confirm(t('Sell {item} for {gold}g?', { item: itemDisplayName(item), gold: sale }))) return;
                    if (s.sellItem(item.id)) {
                      sfx.coin();
                      onClose();
                    }
                  }}
                >
                  {t('Sell {gold}g', { gold: sale.toLocaleString(locale()) })}
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
                title={t('Blacksmith upgrade')}
              >
                {t('⚒ +{n} · {gold}g', { n: item.upgrade + 1, gold: cost.toLocaleString(locale()) })}
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
                  {t('Unequip')}
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
                  {t('Equip')}
                </button>
              )}
            </>
          )}
        </div>
    </Sheet>
  );
}
