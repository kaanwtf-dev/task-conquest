import { useMemo, useState } from 'react';
import { useStore, heroStats, bagItems, potionStacks, equippedItems } from '../../state/store';
import { heroGold, heroSkill, levelTitle } from '../../game/progression';
import { SKILLS, CLASS_BY_ID } from '../../game/catalog';
import { RACE_BY_ID, HAIR_STYLES, HAIR_COLORS, EYE_COLORS, OUTFIT_COLORS, type BeardStyle } from '../../pixel/sprites/hero';
import { useHeroLook } from '../../game/look';
import { streak } from '../../core/time';
import { iconFor } from '../../pixel/iconGen';
import { SLOTS, type Item, type Slot, type StatId } from '../../core/types';
import { STAT_INFO, applyBuffs, computeStats } from '../../game/stats';
import { describePotion, potionName } from '../../game/potions';
import { itemPower, sellPrice } from '../../game/loot';
import { achievementStatus, unlockedTitles } from '../../game/achievements';
import { bestStreak, streakDays } from '../../state/rewards';
import { Bar, HeroPreview, PxImg, Ui, useMedia } from '../components/common';
import { ItemIcon, ItemSheet, PotionIcon } from '../components/loot';
import { sfx } from '../../audio/sfx';

type Sub = 'gear' | 'bag' | 'skills' | 'feats' | 'log';
const SLOT_LABEL: Record<Slot, string> = { weapon: 'Weapon', head: 'Head', body: 'Body', offhand: 'Offhand', cape: 'Cape', trinket: 'Trinket' };

export default function HeroScreen() {
  const hero = useStore((s) => s.hero)!;
  const items = useStore((s) => s.items);
  const cfg = useStore((s) => s.settings);
  const wide = useMedia('(min-width: 900px)');
  const look = useHeroLook();
  const [sub, setSub] = useState<Sub>('gear');
  const [barber, setBarber] = useState(false);
  const st = heroStats(hero);
  const stats = useMemo(() => applyBuffs(computeStats(hero, items), hero.buffs ?? []), [hero, items]);
  const ctx = { bestStreak: bestStreak(streakDays(hero)), level: st.level };
  const claimable = achievementStatus(hero, ctx).reduce((n, a) => n + a.claimable, 0);

  return (
    <div className="scroll">
      <div className="win" style={{ overflow: 'hidden' }}>
        <HeroPreview app={hero.appearance} look={look} theme="tavern" w={wide ? 120 : 92} h={56} scale={4} />
        <div style={{ padding: 12 }}>
          <div className="win-title">
            {hero.name} · Lv{st.level} {hero.title ?? levelTitle(st.level)}
          </div>
          <div style={{ fontSize: 15, marginTop: 6, color: 'var(--muted)' }}>
            {RACE_BY_ID[hero.appearance.race].name} {CLASS_BY_ID[hero.classId].name} · ✦ {RACE_BY_ID[hero.appearance.race].perk}
          </div>
          <div style={{ marginTop: 10 }}>
            <Bar value={st.into} max={st.need} label={`${st.into}/${st.need} XP`} />
          </div>
          <div className="hero-quick">
            <span>
              <Ui name="sword" size={16} /> Power <b>{Math.round(stats.power).toLocaleString()}</b>
            </span>
            <span>
              <Ui name="coin" size={16} /> <b>{heroGold(hero).toLocaleString()}</b>
            </span>
            <span>
              <Ui name="flame" size={16} /> <b>{streak(streakDays(hero), Date.now(), cfg)}</b> day streak
            </span>
            <button className="btn ghost small" onClick={() => setBarber(true)}>
              ✂ Barber
            </button>
          </div>
        </div>
      </div>

      <div className="subtabs">
        {(
          [
            ['gear', 'Gear'],
            ['bag', 'Bag'],
            ['skills', 'Skills'],
            ['feats', claimable ? `Feats (${claimable}!)` : 'Feats'],
            ['log', 'Log'],
          ] as [Sub, string][]
        ).map(([k, label]) => (
          <button key={k} className={`subtab ${sub === k ? 'active' : ''} ${k === 'feats' && claimable ? 'glow' : ''}`} onClick={() => (sfx.tick(), setSub(k))}>
            {label}
          </button>
        ))}
      </div>

      {sub === 'gear' && <GearTab />}
      {sub === 'bag' && <BagTab />}
      {sub === 'skills' && <SkillsTab />}
      {sub === 'feats' && <FeatsTab />}
      {sub === 'log' && <LogTab />}
      {barber && <BarberSheet onClose={() => setBarber(false)} />}
    </div>
  );
}

function GearTab() {
  const s = useStore();
  const hero = s.hero!;
  const eq = equippedItems(s);
  const [open, setOpen] = useState<Item | null>(null);
  const stats = applyBuffs(computeStats(hero, s.items), hero.buffs ?? []);
  return (
    <>
      <div className="win" style={{ padding: 12 }}>
        <div className="slots">
          {SLOTS.map((slot) => {
            const it = eq[slot];
            return it ? (
              <div key={slot} className="slot filled">
                <ItemIcon item={it} size={36} onClick={() => setOpen(it)} />
                {SLOT_LABEL[slot]}
              </div>
            ) : (
              <div key={slot} className="slot">
                <span style={{ opacity: 0.4 }}>—</span>
                {SLOT_LABEL[slot]}
              </div>
            );
          })}
        </div>
      </div>
      {(hero.buffs ?? []).length > 0 && (
        <>
          <div className="section-label">Active potions</div>
          <div className="win" style={{ padding: '6px 12px' }}>
            {hero.buffs.map((b) => (
              <div key={b.id} className="kv">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PotionIcon potion={b.potion} tier={b.tier} size={24} /> {potionName(b.potion, b.tier)}
                </span>
                <b>{b.remaining} quests left</b>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="section-label">Stats</div>
      <div className="win" style={{ padding: '6px 12px' }}>
        <div className="kv">
          Power (boss damage) <b>{Math.round(stats.power).toLocaleString()}</b>
        </div>
        {(Object.keys(STAT_INFO) as StatId[]).map((k) => (
          <div key={k} className="kv">
            {STAT_INFO[k].name} <b>{stats[k] > 0 ? `+${stats[k]}%` : '—'}</b>
          </div>
        ))}
      </div>
      {open && <ItemSheet item={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function BagTab() {
  const s = useStore();
  const hero = s.hero!;
  const [open, setOpen] = useState<Item | null>(null);
  const [filter, setFilter] = useState<Slot | 'all'>('all');
  const bag = bagItems(s)
    .filter((i) => filter === 'all' || i.slot === filter)
    .sort((a, b) => b.rarity - a.rarity || itemPower(b) - itemPower(a));
  const all = bagItems(s);
  const potions = potionStacks(s).sort((a, b) => a.potion.localeCompare(b.potion) || b.tier - a.tier);
  const eq = equippedItems(s);
  const junk = all.filter((i) => !i.locked && i.rarity <= 1);
  return (
    <>
      <div className="section-label">
        Bag {all.length}/{hero.bagSize}
      </div>
      <div className="pantry" style={{ padding: '0 0 8px' }}>
        {(['all', ...SLOTS] as const).map((f) => (
          <button key={f} className={`pill ${filter === f ? 'sel' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : SLOT_LABEL[f]}
          </button>
        ))}
      </div>
      <div className="win bag-grid">
        {bag.length === 0 && <div className="empty" style={{ gridColumn: '1 / -1' }}>Empty. Slay quests to find loot!</div>}
        {bag.map((it) => {
          const cur = eq[it.slot];
          const better = !cur || itemPower(it) > itemPower(cur);
          return <ItemIcon key={it.id} item={it} size={36} badge={better ? '▲' : undefined} onClick={() => setOpen(it)} />;
        })}
      </div>
      {junk.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
          <button
            className="btn ghost small"
            onClick={() => {
              const total = junk.reduce((n, i) => n + sellPrice(i), 0);
              if (!confirm(`Sell ${junk.length} unlocked Common/Uncommon items for ${total}g?`)) return;
              junk.forEach((i) => s.sellItem(i.id));
              sfx.coin();
            }}
          >
            Sell junk ({junk.length})
          </button>
        </div>
      )}
      <div className="section-label">Potions</div>
      <div className="win" style={{ padding: '6px 12px' }}>
        {potions.length === 0 && <div className="empty">No potions. Monsters drop them, or visit the shop.</div>}
        {potions.map((p) => (
          <div key={p.id} className="potion-row">
            <PotionIcon potion={p.potion} tier={p.tier} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div>
                {potionName(p.potion, p.tier)} <span className="muted">×{p.count}</span>
              </div>
              <div className="muted small">{describePotion(p.potion, p.tier, computeStats(hero, s.items).potion)}</div>
            </div>
            <button
              className="btn small"
              onClick={() => {
                if (s.usePotion(p.id)) sfx.loot();
                else sfx.error();
              }}
            >
              {p.potion === 'phoenix' ? 'Use' : 'Drink'}
            </button>
          </div>
        ))}
      </div>
      {open && <ItemSheet item={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function SkillsTab() {
  const hero = useStore((s) => s.hero)!;
  return (
    <div className="win" style={{ padding: '6px 12px', marginTop: 12 }}>
      {SKILLS.map((sk) => {
        const s = heroSkill(hero, sk.id);
        return (
          <div key={sk.id} className="skill">
            <PxImg src={iconFor(sk.name, sk.emoji)} size={28} />
            <div>
              <div className="sname">
                {sk.name} <span className="muted small">· {sk.hint}</span>
              </div>
              <Bar value={s.into} max={s.need} />
            </div>
            <div className="slv">{s.level}</div>
          </div>
        );
      })}
    </div>
  );
}

function FeatsTab() {
  const s = useStore();
  const hero = s.hero!;
  const level = heroStats(hero).level;
  const ctx = { bestStreak: bestStreak(streakDays(hero)), level };
  const list = achievementStatus(hero, ctx);
  const titles = unlockedTitles(hero, ctx);
  const claimable = list.reduce((n, a) => n + a.claimable, 0);
  return (
    <>
      {claimable > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
          <button
            className="btn"
            onClick={() => {
              const r = s.claimAchievements();
              if (r.gold > 0) {
                sfx.questComplete();
              }
            }}
          >
            Claim {claimable} reward{claimable > 1 ? 's' : ''}
          </button>
        </div>
      )}
      <div className="win" style={{ padding: '6px 12px', marginTop: 12 }}>
        {list.map((a) => (
          <div key={a.id} className="feat">
            <PxImg src={iconFor(a.name, a.icon)} size={30} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sname">
                {a.name} <span className="muted small">· tier {a.tierReached}</span>
              </div>
              <div className="muted small" style={{ marginBottom: 4 }}>
                {a.description}
                {a.nextTitle && !a.maxed && <> · next title: <i>{a.nextTitle}</i></>}
              </div>
              <Bar value={a.value - a.prevThreshold} max={Math.max(1, a.nextThreshold - a.prevThreshold)} label={`${a.value.toLocaleString()} / ${a.nextThreshold.toLocaleString()}`} kind="gold" />
            </div>
            {a.claimable > 0 ? <span className="claim-dot" title={`${a.pendingGold}g waiting`}>!</span> : a.maxed ? <span className="muted small">MAX</span> : null}
          </div>
        ))}
      </div>
      <div className="section-label">Title</div>
      <div className="win pantry">
        <button className={`pill ${!hero.title ? 'sel' : ''}`} onClick={() => s.setTitle(undefined)}>
          {levelTitle(level)} (level)
        </button>
        {titles
          .filter((t) => t !== levelTitle(level))
          .map((t) => (
            <button key={t} className={`pill ${hero.title === t ? 'sel' : ''}`} onClick={() => (sfx.tick(), s.setTitle(t))}>
              {t}
            </button>
          ))}
      </div>
    </>
  );
}

function LogTab() {
  const log = useStore((s) => s.log);
  return (
    <div className="win log" style={{ maxHeight: 'none', marginTop: 12 }}>
      {log.length === 0 && <div className="empty">Your legend is unwritten.</div>}
      {log.slice(0, 120).map((l) => (
        <div key={l.id} className={`lk-${l.kind}`}>
          ▸ {l.text}
        </div>
      ))}
    </div>
  );
}

function BarberSheet({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const hero = s.hero!;
  const look = useHeroLook();
  const [app, setApp] = useState(hero.appearance);
  const [name, setName] = useState(hero.name);
  const race = RACE_BY_ID[app.race];
  const dyes = (target: string) => hero.owned.filter((o) => o.startsWith(`dye:${target}:`)).map((o) => o.split(':')[2]);
  const capeDyes = dyes('cape');
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="win sheet" onClick={(e) => e.stopPropagation()}>
        <div className="win-title">Barber & Tailor</div>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
          <HeroPreview app={app} look={look} theme="tavern" w={64} h={48} scale={3} />
        </div>
        <Row label="Name">
          <input className="text-in" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
        </Row>
        <Row label="Skin">
          {race.skins.map((c, i) => (
            <button key={c} className={`swatch ${app.skin === i ? 'sel' : ''}`} style={{ background: c }} onClick={() => setApp({ ...app, skin: i })} />
          ))}
        </Row>
        {app.race !== 'lizardfolk' && (
          <Row label="Hair">
            {HAIR_STYLES.map((h) => (
              <button key={h} className={`pill ${app.hair === h ? 'sel' : ''}`} onClick={() => setApp({ ...app, hair: h })}>
                {h}
              </button>
            ))}
          </Row>
        )}
        <Row label="Hair color">
          {[...HAIR_COLORS, ...dyes('hair')].map((c) => (
            <button key={c} className={`swatch ${app.hairColor === c ? 'sel' : ''}`} style={{ background: c }} onClick={() => setApp({ ...app, hairColor: c })} />
          ))}
        </Row>
        {app.race !== 'lizardfolk' && (
          <Row label="Beard">
            {(['none', 'short', 'long'] as BeardStyle[]).map((b) => (
              <button key={b} className={`pill ${app.beard === b ? 'sel' : ''}`} onClick={() => setApp({ ...app, beard: b })}>
                {b}
              </button>
            ))}
          </Row>
        )}
        <Row label="Eyes">
          {EYE_COLORS.map((c) => (
            <button key={c} className={`swatch ${app.eyes === c ? 'sel' : ''}`} style={{ background: c }} onClick={() => setApp({ ...app, eyes: c })} />
          ))}
        </Row>
        <Row label="Outfit">
          {[...OUTFIT_COLORS, ...dyes('outfit')].map((c) => (
            <button key={c} className={`swatch ${app.outfit === c ? 'sel' : ''}`} style={{ background: c }} onClick={() => setApp({ ...app, outfit: c })} />
          ))}
        </Row>
        <Row label="Pants">
          {['#4a3a2a', '#2a2a3a', '#3a4a6a', '#5a2a2a', '#2a4a2a', ...dyes('pants')].map((c) => (
            <button key={c} className={`swatch ${app.pants === c ? 'sel' : ''}`} style={{ background: c }} onClick={() => setApp({ ...app, pants: c })} />
          ))}
        </Row>
        {capeDyes.length > 0 && (
          <Row label="Cape dye">
            <button className={`pill ${!hero.capeDye ? 'sel' : ''}`} onClick={() => s.updateHero({ capeDye: undefined })}>
              None
            </button>
            {capeDyes.map((c) => (
              <button key={c} className={`swatch ${hero.capeDye === c ? 'sel' : ''}`} style={{ background: c }} onClick={() => s.updateHero({ capeDye: c })} />
            ))}
          </Row>
        )}
        <div className="muted small" style={{ marginTop: 8 }}>
          More dyes in the shop.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn"
            onClick={() => {
              s.updateHero({ appearance: app, name: name.trim() || hero.name });
              sfx.loot();
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '8px 0', borderBottom: '2px dashed rgba(255,255,255,.08)' }}>
      <div className="pixel" style={{ fontSize: 8, color: 'var(--muted)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div>
    </div>
  );
}

