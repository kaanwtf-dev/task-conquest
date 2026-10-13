import { useState } from 'react';
import { useStore, heroStats, isForeignList, LIST_TYPE_INFO } from '../../state/store';
import { SKILLS } from '../../game/catalog';
import { iconFor } from '../../pixel/iconGen';
import { THEMES, type ThemeId } from '../../pixel/themes';
import type { AnimMode, ListType, SkillId } from '../../core/types';
import { PxImg, Sheet, themeStyle } from '../components/common';
import { sfx, setSfxVolume, unlockAudio } from '../../audio/sfx';

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
        <Opt label="Music">
          {[0, 0.25, 0.5, 0.8].map((v) => (
            <button
              key={v}
              className={`pill ${cfg.music === v ? 'sel' : ''}`}
              onClick={() => {
                unlockAudio();
                set({ music: v });
              }}
            >
              {v === 0 ? 'off' : v === 0.25 ? 'soft' : v === 0.5 ? 'normal' : 'loud'}
            </button>
          ))}
        </Opt>
        <Opt label="Corner hero (phone)">
          {(['big', 'small', 'hidden'] as const).map((v) => (
            <button key={v} className={`pill ${(cfg.cornerHero ?? 'big') === v ? 'sel' : ''}`} onClick={() => (sfx.tick(), set({ cornerHero: v }))}>
              {v}
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
      <div className="section-label">Backup</div>
      <div className="win" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn small" onClick={() => exportBackup(s.exportData())}>
          Export save
        </button>
        <label className="btn ghost small" style={{ cursor: 'pointer' }}>
          Import save
          <input
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (!confirm('Replace everything on this device with this backup? Party lists are merged with what the party did since, never replaced.')) return;
              const ok = s.importData(await f.text());
              alert(ok ? 'Backup restored!' : 'That file is not a Questlog backup.');
            }}
          />
        </label>
        <div className="muted small" style={{ width: '100%' }}>
          A JSON file with your hero, lists and loot. Cloud sync lives in the Party tab.
        </div>
      </div>
      <div className="section-label">Danger zone</div>
      <div className="win" style={{ padding: 12 }}>
        <button
          className="btn ghost"
          onClick={() => {
            if (
              confirm(
                'Delete your hero, loot and all your lists? When signed in to the cloud this also deletes them on your other devices, and lists you shared are deleted for their party. Party lists you joined are left, not deleted.',
              )
            )
              s.resetAll();
          }}
        >
          Start over
        </button>
      </div>
    </div>
  );
}

async function exportBackup(json: string) {
  const name = `questlog-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Questlog backup' });
      return;
    } catch {
      // user cancelled or share failed: fall back to a download
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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

const LIST_ICONS = ['☀️', '📅', '⚔️', '🛒', '🏠', '💼', '📚', '🏋️', '🎮', '🎁', '💊', '🐶', '✈️', '💰', '🎨', '🧹'];
const LIST_COLORS = ['#6abe30', '#5b6ee1', '#df7126', '#d9a066', '#d95763', '#76428a', '#37946e', '#306082', '#ac3232', '#8a6f30'];

export function ListSheet({ onClose, editId }: { onClose: () => void; editId?: string }) {
  const s = useStore();
  const existing = editId ? s.lists[editId] : undefined;
  const level = s.hero ? heroStats(s.hero).level : 1;
  const owned = s.hero?.owned ?? [];
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<ListType>(existing?.type ?? 'quests');
  const [theme, setTheme] = useState<ThemeId>(existing?.theme ?? 'forest');
  const [skill, setSkill] = useState<SkillId>(existing?.skill ?? 'smithing');
  const [icon, setIcon] = useState(existing?.icon ?? LIST_ICONS[2]);
  const [color, setColor] = useState(existing?.color ?? LIST_COLORS[0]);
  return (
    <Sheet onClose={onClose} style={themeStyle(theme)}>
        <div className="win-title">{existing ? 'Edit list' : 'New quest list'}</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (existing) {
              s.updateList(existing.id, { name: name.trim() || existing.name, type, theme, skill, icon, color });
              // switching list type moves tasks that still use the old default cadence to the new one
              const oldR = JSON.stringify(LIST_TYPE_INFO[existing.type].repeat);
              const newR = LIST_TYPE_INFO[type].repeat;
              if (type !== existing.type && oldR !== JSON.stringify(newR)) {
                // updateTask carries each task's completion into the new period (no free re-rewards)
                for (const t of Object.values(s.tasks))
                  if (t.listId === existing.id && !t.deleted && JSON.stringify(t.repeat) === oldR) s.updateTask(t.id, { repeat: newR });
              }
              sfx.pop();
            } else {
              s.setActiveList(s.addList({ name, type, theme, skill, icon, color }));
              sfx.loot();
            }
            onClose();
          }}
        >
          <Opt label="Name">
            <input className="text-in" autoFocus={!existing} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Home chores" />
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
              const locked = level < t.unlockLevel && !owned.includes(`theme:${t.id}`);
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
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 14 }}>
            <div>
              {existing &&
                (isForeignList(existing, s.accountId) ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      if (confirm(`Leave "${existing.name}"? It is removed from this device; the rest of the party keeps it.`)) {
                        s.leaveList(existing.id);
                        onClose();
                      }
                    }}
                  >
                    Leave
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      const party = existing.shared ? ' It is deleted for everyone in its party too.' : '';
                      if (confirm(`Delete "${existing.name}" and all its tasks?${party}`)) {
                        s.deleteList(existing.id);
                        onClose();
                      }
                    }}
                  >
                    Delete
                  </button>
                ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn" type="submit">
                {existing ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </form>
    </Sheet>
  );
}
