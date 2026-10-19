import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import { heroGold, heroLevel } from '../../game/progression';
import { applyBuffs, computeStats } from '../../game/stats';
import { dailyStock, permanentOffers, type ShopOffer } from '../../game/shop';
import { describePotion, potionName } from '../../game/potions';
import { itemDisplayName } from '../../game/loot';
import { todayKey } from '../../core/time';
import { merchantUrl } from '../../pixel/sprites/items';
import { THEME_BY_ID } from '../../pixel/themes';
import { PxImg, Ui, themeStyle, useNow } from '../components/common';
import { ItemIcon, ItemSheet, PotionIcon, rarityColor } from '../components/loot';
import { sfx } from '../../audio/sfx';
import { fx } from '../../state/fx';
import { t, tk, locale } from '../../i18n';

/** Shown through t(). */
const GREETINGS = [
  tk('Welcome, traveler! Gold for goods, goods for gold.'),
  tk('Fresh steel today! Mostly fresh. Some of it.'),
  tk('You look like someone who finishes their quests.'),
  tk("Potions! Potions! Don't ask what's in them."),
  tk('Back again? Your to-do list must fear you.'),
];
/** What a dye colors, shown through t(). */
const DYE_TARGET: Record<string, string> = { outfit: tk('outfit'), hair: tk('hair'), pants: tk('pants'), cape: tk('cape') };

export default function ShopScreen() {
  const s = useStore();
  const hero = s.hero!;
  const now = useNow(60000);
  const day = todayKey(now, s.settings);
  const level = heroLevel(hero).level;
  const stats = applyBuffs(computeStats(hero, s.items), hero.buffs ?? []);
  const stock = useMemo(() => dailyStock(day, level, stats.luck, now), [day, level, Math.round(stats.luck)]);
  const perm = permanentOffers(hero);
  const bought = s.shopDay.date === day ? s.shopDay.bought : [];
  const gold = heroGold(hero);
  const [open, setOpen] = useState<ShopOffer | null>(null);
  const greeting = GREETINGS[(day.charCodeAt(day.length - 1) + level) % GREETINGS.length];

  const buy = (o: ShopOffer) => {
    if (s.buyOffer(o)) {
      sfx.coin();
      setTimeout(() => sfx.loot(), 90);
      fx.emit({ type: 'toast', text: t('PURCHASED'), small: o.kind === 'dye' ? t('{label} — applied! Change it any time at the barber.', { label: t(o.label) }) : t(o.label) });
      return true;
    }
    sfx.error();
    return false;
  };

  const gear = stock.filter((o) => o.kind === 'item');
  const potions = stock.filter((o) => o.kind === 'potion');
  const bag = perm.filter((o) => o.kind === 'bag');
  const themes = perm.filter((o) => o.kind === 'theme');
  const dyes = perm.filter((o) => o.kind === 'dye');

  return (
    <div className="scroll" style={themeStyle('tavern')}>
      <div className="win shop-head">
        <PxImg src={merchantUrl()} size={96} />
        <div style={{ flex: 1 }}>
          <div className="win-title">{t('Merchant')}</div>
          <div className="speech">{t(greeting)}</div>
          <div className="stat" style={{ marginTop: 8, fontFamily: 'var(--font-pixel)', fontSize: 11 }}>
            <Ui name="coin" size={18} /> {gold.toLocaleString(locale())}
          </div>
        </div>
      </div>

      <div className="section-label">{t("Today's wares · restocks daily")}</div>
      <div className="win" style={{ padding: 8 }}>
        {gear.map((o) => {
          const sold = bought.includes(o.id);
          return (
            <div key={o.id} className={`offer ${sold ? 'sold' : ''}`} onClick={() => !sold && setOpen(o)}>
              <ItemIcon item={o.item!} size={32} />
              <div className="offer-main">
                <div style={{ color: rarityColor(o.item!.rarity) }}>{t(itemDisplayName(o.item!))}</div>
                <div className="muted small">{t('iLvl {n}', { n: o.item!.ilvl })}</div>
              </div>
              <div className="price">{sold ? t('SOLD') : t('{n}g', { n: o.price.toLocaleString(locale()) })}</div>
            </div>
          );
        })}
      </div>

      <div className="section-label">{t('Potions')}</div>
      <div className="win" style={{ padding: 8 }}>
        {potions.map((o) => (
          <div key={o.id} className="offer">
            <PotionIcon potion={o.potion!.potion} tier={o.potion!.tier} size={32} />
            <div className="offer-main">
              <div>{t(potionName(o.potion!.potion, o.potion!.tier))}</div>
              <div className="muted small">{t(describePotion(o.potion!.potion, o.potion!.tier, stats.potion))}</div>
            </div>
            <button className="btn small" disabled={gold < o.price} onClick={() => buy(o)}>
              {t('{n}g', { n: o.price.toLocaleString(locale()) })}
            </button>
          </div>
        ))}
      </div>

      <div className="section-label">{t('Upgrades')}</div>
      <div className="win" style={{ padding: 8 }}>
        {bag.map((o) => (
          <div key={o.id} className="offer">
            <Ui name="bag" size={32} />
            <div className="offer-main">
              <div>{t(o.label)}</div>
              <div className="muted small">{t('Currently {n} slots', { n: hero.bagSize })}</div>
            </div>
            <button className="btn small" disabled={gold < o.price} onClick={() => buy(o)}>
              {t('{n}g', { n: o.price.toLocaleString(locale()) })}
            </button>
          </div>
        ))}
        {themes.map((o) => (
          <div key={o.id} className="offer">
            <span className="theme-swatch" style={themeStyle(o.theme)} />
            <div className="offer-main">
              <div>{t(o.label)}</div>
              <div className="muted small">{t('Unlocks free at level {n}', { n: THEME_BY_ID[o.theme!].unlockLevel })}</div>
            </div>
            <button className="btn small" disabled={gold < o.price} onClick={() => buy(o)}>
              {t('{n}g', { n: o.price.toLocaleString(locale()) })}
            </button>
          </div>
        ))}
      </div>

      {dyes.length > 0 && (
        <>
          <div className="section-label">{t('Dyes · applied on purchase, swap at the barber')}</div>
          <div className="win pantry">
            {dyes.map((o) => (
              <button key={o.id} className="pchip" disabled={gold < o.price} onClick={() => buy(o)} title={t(o.label)}>
                <span className="dye" style={{ background: o.dye!.color }} />
                {t(DYE_TARGET[o.dye!.target] ?? o.dye!.target)} · {t('{n}g', { n: o.price.toLocaleString(locale()) })}
              </button>
            ))}
          </div>
        </>
      )}

      {open && open.item && (
        <ItemSheet
          item={open.item}
          mode="shop"
          price={open.price}
          onClose={() => setOpen(null)}
          onBuy={() => {
            if (buy(open)) setOpen(null);
          }}
        />
      )}
    </div>
  );
}
