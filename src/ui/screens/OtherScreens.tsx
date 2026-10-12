import { useState } from 'react';
import { useStore, heroStats, LIST_TYPE_INFO } from '../../state/store';
import { heroGold, heroSkill, levelTitle } from '../../game/progression';
import { SKILLS, CLASS_BY_ID } from '../../game/catalog';
import { RACE_BY_ID } from '../../pixel/sprites/hero';
import { heroLook } from '../../game/look';
import { streak } from '../../core/time';
import { iconFor } from '../../pixel/iconGen';
import { THEMES, type ThemeId } from '../../pixel/themes';
import type { AnimMode, ListType, SkillId } from '../../core/types';
import { Bar, HeroPreview, PxImg, Ui, themeStyle, useMedia } from '../components/common';
import { sfx } from '../../audio/sfx';
import { setSfxVolume } from '../../audio/sfx';

export function HeroScreen() {
  const hero = useStore((s) => s.hero)!;
  const log = useStore((s) => s.log);
  const cfg = useStore((s) => s.settings);
  const wide = useMedia('(min-width: 900px)');
  const st = heroStats(hero);
  const look = heroLook(hero);
  return (
    <div className="scroll">
      <div className="win" style={{ overflow: 'hidden' }}>
        <HeroPreview app={hero.appearance} look={look} theme="tavern" w={wide ? 120 : 92} h={56} scale={wide ? 4 : 4} />
        <div style={{ padding: 12 }}>
          <div className="win-title">
            {hero.name} · Lv{st.level} {levelTitle(st.level)}
          </div>
          <div style={{ fontSize: 15, marginTop: 6, color: 'var(--muted)' }}>
            {RACE_BY_ID[hero.appearance.race].name} {CLASS_BY_ID[hero.classId].name} · ✦ {RACE_BY_ID[hero.appearance.race].perk}
          </div>
          <div style={{ marginTop: 10 }}>
            <Bar value={st.into} max={st.need} label={`${st.into}/${st.need} XP`} />
          </div>
        </div>
      </div>

      <div className="section-label">Equipment</div>
      <div className="win" style={{ padding: 12 }}>
        <div className="slots">
          {['Weapon', 'Head', 'Body', 'Offhand', 'Cape', 'Trinket'].map((slot, i) => (
            <div key={slot} className={`slot ${i === 0 ? 'filled' : ''}`}>
              {i === 0 ? <Ui name="sword" size={26} /> : <span style={{ opacity: 0.4 }}>—</span>}
              {slot}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 10 }}>Loot drops, inventory & the blacksmith arrive in the next build.</div>
      </div>

      <div className="section-label">Stats</div>
      <div className="win" style={{ padding: '6px 12px' }}>
        <div className="kv">Gold <b>{heroGold(hero).toLocaleString()}</b></div>
        <div className="kv">Monsters slain <b>{st.kills}</b></div>
        <div className="kv">Quests completed <b>{st.tasks}</b></div>
        <div className="kv">Daily streak <b>{streak(hero.activeDays, Date.now(), cfg)} days</b></div>
      </div>

      <div className="section-label">Skills · level up by doing</div>
      <div className="win" style={{ padding: '6px 12px' }}>
        {SKILLS.map((sk) => {
          const s = heroSkill(hero, sk.id);
          return (
            <div key={sk.id} className="skill">
              <PxImg src={iconFor(sk.name, sk.emoji)} size={28} />
              <div>
                <div className="sname">{sk.name}</div>
                <Bar value={s.into} max={s.need} />
              </div>
              <div className="slv">{s.level}</div>
            </div>
          );
        })}
      </div>

      <div className="section-label">Adventure log</div>
      <div className="win log">
        {log.length === 0 && <div className="empty">Your legend is unwritten.</div>}
        {log.slice(0, 30).map((l) => (
          <div key={l.id} className={`lk-${l.kind}`}>
            ▸ {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const s = useStore();
  const cfg = s.settings;
  const set = s.updateSettings;
  return (
    <div className="scroll">
      <div className="win" style={{ padding: 12 }}>
        <div className="win-title" style={{ marginBottom: 8 }}>Options</div>
        <Opt label="Battle animations">
          {(['full', 'quick', 'off'] as AnimMode[]).map((m) => (
            <button key={m} className={`pill ${cfg.anim === m ? 'sel' : ''}`} onClick={() => (sfx.tick(), set({ anim: m }))}>
              {m}
            </button>
          ))}
        </Opt>
        <Opt label="Sound effects">
          {[0, 0.3, 0.6, 1].map((v) => (
            <button
              key={v}
              className={`pill ${cfg.sfx === v ? 'sel' : ''}`}
              onClick={() => {
                set({ sfx: v });
                setSfxVolume(v);
                sfx.coin();
              }}
            >
              {v === 0 ? 'off' : v === 1 ? 'loud' : v === 0.3 ? 'soft' : 'normal'}
            </button>
          ))}
        </Opt>
        <Opt label="Haptics">
          {[true, false].map((v) => (
            <button key={String(v)} className={`pill ${cfg.haptics === v ? 'sel' : ''}`} onClick={() => set({ haptics: v })}>
              {v ? 'on' : 'off'}
            </button>
          ))}
        </Opt>
        <Opt label="Task font">
          {(['pixel', 'clean'] as const).map((v) => (
            <button key={v} className={`pill ${cfg.taskFont === v ? 'sel' : ''}`} onClick={() => set({ taskFont: v })}>
              {v}
            </button>
          ))}
        </Opt>
        <Opt label="New day starts at">
          {[0, 3, 4, 5, 6].map((h) => (
            <button key={h} className={`pill ${cfg.dayStartHour === h ? 'sel' : ''}`} onClick={() => set({ dayStartHour: h })}>
              {h}:00
            </button>
          ))}
        </Opt>
        <Opt label="Week starts on">
          {[1, 0].map((d) => (
            <button key={d} className={`pill ${cfg.weekStart === d ? 'sel' : ''}`} onClick={() => set({ weekStart: d })}>
              {d === 1 ? 'Monday' : 'Sunday'}
            </button>
          ))}
        </Opt>
      </div>
      <div className="section-label">Danger zone</div>
      <div className="win" style={{ padding: 12 }}>
        <button
          className="btn ghost"
          onClick={() => {
            if (confirm('Delete your hero and all lists on this device?')) s.resetAll();
          }}
        >
          Start over
        </button>
      </div>
    </div>
  );
}

function Opt({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '2px dashed rgba(255,255,255,.08)' }}>
      <div className="pixel" style={{ fontSize: 8, color: 'var(--muted)', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div>
    </div>
  );
}

export function ComingSoon({ title, text }: { title: string; text: string }) {
  return (
    <div className="scroll">
      <div className="win" style={{ padding: 16 }}>
        <div className="win-title">{title}</div>
        <div style={{ marginTop: 10, fontSize: 16, lineHeight: 1.4 }}>{text}</div>
      </div>
    </div>
  );
}

const LIST_ICONS = ['☀️', '📅', '⚔️', '🛒', '🏠', '💼', '📚', '🏋️', '🎮', '🎁', '💊', '🐶', '✈️', '💰', '🎨', '🧹'];
const LIST_COLORS = ['#6abe30', '#5b6ee1', '#df7126', '#d9a066', '#d95763', '#76428a', '#37946e', '#306082', '#ac3232', '#8a6f30'];

export function NewListSheet({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const level = s.hero ? heroStats(s.hero).level : 1;
  const [name, setName] = useState('');
  const [type, setType] = useState<ListType>('quests');
  const [theme, setTheme] = useState<ThemeId>('forest');
  const [skill, setSkill] = useState<SkillId>('smithing');
  const [icon, setIcon] = useState(LIST_ICONS[2]);
  const [color, setColor] = useState(LIST_COLORS[0]);
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="win sheet" style={themeStyle(theme)} onClick={(e) => e.stopPropagation()}>
        <div className="win-title">New quest list</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            s.addList({ name, type, theme, skill, icon, color });
            sfx.loot();
            onClose();
          }}
        >
          <Opt label="Name">
            <input className="text-in" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Home chores" />
          </Opt>
          <Opt label="Type">
            {(Object.keys(LIST_TYPE_INFO) as ListType[]).map((t) => (
              <button type="button" key={t} className={`pill ${type === t ? 'sel' : ''}`} onClick={() => setType(t)}>
                {LIST_TYPE_INFO[t].label}
              </button>
            ))}
            <div style={{ width: '100%', fontSize: 14, color: 'var(--muted)' }}>{LIST_TYPE_INFO[type].hint}</div>
          </Opt>
          <Opt label="Icon">
            {LIST_ICONS.map((i) => (
              <button type="button" key={i} className={`pill ${icon === i ? 'sel' : ''}`} onClick={() => setIcon(i)} style={{ padding: 3 }}>
                <PxImg src={iconFor('', i)} size={28} />
              </button>
            ))}
          </Opt>
          <Opt label="Color">
            {LIST_COLORS.map((c) => (
              <button type="button" key={c} className={`swatch ${color === c ? 'sel' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </Opt>
          <Opt label="Zone theme">
            {THEMES.map((t) => {
              const locked = level < t.unlockLevel;
              return (
                <button type="button" key={t.id} disabled={locked} className={`pill ${theme === t.id ? 'sel' : ''}`} onClick={() => setTheme(t.id)}>
                  {t.name}
                  {locked ? ` 🔒${t.unlockLevel}` : ''}
                </button>
              );
            })}
          </Opt>
          <Opt label="Trains skill">
            {SKILLS.map((k) => (
              <button type="button" key={k.id} className={`pill ${skill === k.id ? 'sel' : ''}`} onClick={() => setSkill(k.id)}>
                {k.name}
              </button>
            ))}
          </Opt>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn" type="submit">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
