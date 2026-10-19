// Compact boss window: every completed task chips away at the current boss on the infinite ladder.
import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';
import { bossFor, bossRankDef, bossReward } from '../../game/bosses';
import { sum, heroLevel } from '../../game/progression';
import { bossUrl } from '../../pixel/sprites/items';
import { fx } from '../../state/fx';
import { Bar, PxImg, Sheet, rich } from './common';
import { RARITIES } from '../../game/loot';
import { locale, t } from '../../i18n';

export default function BossBar() {
  const hero = useStore((s) => s.hero)!;
  const boss = bossFor(hero.bossIndex);
  const dealt = Math.min(boss.maxHp, sum(hero.bossDamage));
  const [shake, setShake] = useState(0);
  const [info, setInfo] = useState(false);

  useEffect(
    () =>
      fx.on((e) => {
        if (e.type === 'bossHit') setShake((n) => n + 1);
      }),
    [],
  );

  const reward = bossReward(boss.index, heroLevel(hero).level);
  const rank = boss.rank !== 'boss' ? t(bossRankDef(boss.index).label) : null;
  const name = t(boss.name);
  const rewardGold = <b style={{ color: 'var(--accent)' }}>{t('{n}g', { n: reward.gold.toLocaleString(locale()) })}</b>;
  const rewardChest = <b style={{ color: RARITIES[reward.chestMinRarity]?.color }}>{t(RARITIES[reward.chestMinRarity]?.name ?? '')}+</b>;
  return (
    <>
      <button className="win boss-bar" onClick={() => setInfo(true)} aria-label={t('Boss {name}', { name })}>
        <span key={shake} className={shake ? 'boss-sprite hit' : 'boss-sprite'}>
          <PxImg src={bossUrl(boss.archetype, boss.hue)} size={40} />
        </span>
        <span className="boss-main">
          <span className="boss-name">
            <span className="boss-idx">#{boss.index}</span> {rank && <span className="boss-rank">{rank}</span>} {name}
          </span>
          <Bar value={boss.maxHp - dealt} max={boss.maxHp} kind="boss" label={`${(boss.maxHp - dealt).toLocaleString(locale())} HP`} />
        </span>
      </button>
      {info && (
        <Sheet onClose={() => setInfo(false)} style={{ textAlign: 'center' }}>
            <PxImg src={bossUrl(boss.archetype, boss.hue)} size={120} style={{ margin: '0 auto', display: 'block' }} />
            <div className="win-title" style={{ marginTop: 8 }}>
              {rank ?? t('Boss')} #{boss.index}: {name}
            </div>
            <div style={{ margin: '6px 0 12px', color: 'var(--muted)' }}>{t(boss.title)}</div>
            <Bar value={boss.maxHp - dealt} max={boss.maxHp} kind="boss" label={`${(boss.maxHp - dealt).toLocaleString(locale())} / ${boss.maxHp.toLocaleString(locale())} HP`} />
            <p style={{ fontSize: 16, lineHeight: 1.4 }}>
              {t('Every quest you complete strikes this boss. Harder quests, crits, gear Power and boss-damage enchantments hit harder.')}
            </p>
            <p style={{ fontSize: 16 }}>
              {rich(t('Reward: {gold} and a {rarity} chest.'), { gold: rewardGold, rarity: rewardChest })}
            </p>
            <button className="btn" onClick={() => setInfo(false)}>
              {t('To battle!')}
            </button>
        </Sheet>
      )}
    </>
  );
}
