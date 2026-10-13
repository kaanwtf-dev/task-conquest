// Compact boss window: every completed task chips away at the current boss on the infinite ladder.
import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';
import { bossFor, bossRankDef, bossReward } from '../../game/bosses';
import { sum, heroLevel } from '../../game/progression';
import { bossUrl } from '../../pixel/sprites/items';
import { fx } from '../../state/fx';
import { Bar, PxImg, Sheet } from './common';
import { RARITIES } from '../../game/loot';

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
  const rank = boss.rank !== 'boss' ? bossRankDef(boss.index).label : null;
  return (
    <>
      <button className="win boss-bar" onClick={() => setInfo(true)} aria-label={`Boss ${boss.name}`}>
        <span key={shake} className={shake ? 'boss-sprite hit' : 'boss-sprite'}>
          <PxImg src={bossUrl(boss.archetype, boss.hue)} size={40} />
        </span>
        <span className="boss-main">
          <span className="boss-name">
            <span className="boss-idx">#{boss.index}</span> {rank && <span className="boss-rank">{rank}</span>} {boss.name}
          </span>
          <Bar value={boss.maxHp - dealt} max={boss.maxHp} kind="boss" label={`${(boss.maxHp - dealt).toLocaleString()} HP`} />
        </span>
      </button>
      {info && (
        <Sheet onClose={() => setInfo(false)} style={{ textAlign: 'center' }}>
            <PxImg src={bossUrl(boss.archetype, boss.hue)} size={120} style={{ margin: '0 auto', display: 'block' }} />
            <div className="win-title" style={{ marginTop: 8 }}>
              {rank ?? 'Boss'} #{boss.index}: {boss.name}
            </div>
            <div style={{ margin: '6px 0 12px', color: 'var(--muted)' }}>{boss.title}</div>
            <Bar value={boss.maxHp - dealt} max={boss.maxHp} kind="boss" label={`${(boss.maxHp - dealt).toLocaleString()} / ${boss.maxHp.toLocaleString()} HP`} />
            <p style={{ fontSize: 16, lineHeight: 1.4 }}>
              Every quest you complete strikes this boss. Harder quests, crits, gear Power and boss-damage enchantments hit harder.
            </p>
            <p style={{ fontSize: 16 }}>
              Reward: <b style={{ color: 'var(--accent)' }}>{reward.gold.toLocaleString()}g</b> and a{' '}
              <b style={{ color: RARITIES[reward.chestMinRarity]?.color }}>{RARITIES[reward.chestMinRarity]?.name}+</b> chest.
            </p>
            <button className="btn" onClick={() => setInfo(false)}>
              To battle!
            </button>
        </Sheet>
      )}
    </>
  );
}
