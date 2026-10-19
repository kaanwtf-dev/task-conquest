import { useRef, useState } from 'react';
import { RemindersOption } from '../components/Reminders';
import { SupportBox } from '../components/Support';
import { InstallButton, useCanInstall } from '../components/InstallGuide';
import { LANGS, detectLang, t } from '../../i18n';
import { WhatsNewSheet } from '../components/WhatsNew';
import { useStore, heroStats, isForeignList, LIST_TYPE_INFO } from '../../state/store';
import { SKILLS } from '../../game/catalog';
import { iconFor } from '../../pixel/iconGen';
import { THEMES, type ThemeId } from '../../pixel/themes';
import type { AnimMode, ListType, SkillId } from '../../core/types';
import { PxImg, Sheet, themeStyle } from '../components/common';
import { sfx, setSfxVolume, unlockAudio } from '../../audio/sfx';

export function SettingsScreen() {
  const s = useStore();
  const importInput = useRef<HTMLInputElement>(null);
  const cfg = s.settings;
  const canInstall = useCanInstall();
  const set = s.updateSettings;
  const [notes, setNotes] = useState(false);
  return (
    <div className="scroll">
      <div className="win" style={{ padding: 12 }}>
        <div className="win-title" style={{ marginBottom: 8 }}>{t('Options')}</div>
        <Opt label={t('Language')}>
          {LANGS.map(({ id, label }) => {
            const on = (cfg.lang ?? 'auto') === id;
            return (
              <button key={id} className={`pill ${on ? 'sel' : ''}`} aria-pressed={on} onClick={() => (sfx.tick(), set({ lang: id }))}>
                {id === 'auto' ? `${t('Auto')} (${detectLang() === 'tr' ? 'Türkçe' : 'English'})` : label}
              </button>
            );
          })}
        </Opt>
        {canInstall && (
          <Opt label={t('Home Screen')}>
            <InstallButton className="pill sel" />
          </Opt>
        )}
        <Opt label={t('Battle animations')}>
          {(['full', 'quick', 'off'] as AnimMode[]).map((m) => (
            <button key={m} className={`pill ${cfg.anim === m ? 'sel' : ''}`} aria-pressed={cfg.anim === m} onClick={() => (sfx.tick(), set({ anim: m }))}>
              {m === 'full' ? t('full') : m === 'quick' ? t('quick') : t('off')}
            </button>
          ))}
        </Opt>
        <Opt label={t('Sound effects')}>
          {[0, 0.3, 0.6, 1].map((v) => (
            <button
              key={v}
              className={`pill ${cfg.sfx === v ? 'sel' : ''}`} aria-pressed={cfg.sfx === v}
              onClick={() => {
                set({ sfx: v });
                setSfxVolume(v);
                sfx.coin();
              }}
            >
              {v === 0 ? t('off') : v === 1 ? t('loud') : v === 0.3 ? t('soft') : t('normal')}
            </button>
          ))}
        </Opt>
        <Opt label={t('Music')}>
          {[0, 0.25, 0.5, 0.8].map((v) => (
            <button
              key={v}
              className={`pill ${cfg.music === v ? 'sel' : ''}`} aria-pressed={cfg.music === v}
              onClick={() => {
                unlockAudio();
                set({ music: v });
              }}
            >
              {v === 0 ? t('off') : v === 0.25 ? t('soft') : v === 0.5 ? t('normal') : t('loud')}
            </button>
          ))}
        </Opt>
        <Opt label={t('Hero window (phone): drag it anywhere, or off an edge to tuck it away')}>
          {(['big', 'small', 'bar', 'hidden'] as const).map((v) => (
            <button key={v} className={`pill ${(cfg.cornerHero ?? 'bar') === v ? 'sel' : ''}`} aria-pressed={(cfg.cornerHero ?? 'bar') === v} onClick={() => (sfx.tick(), set({ cornerHero: v }))}>
              {v === 'bar' ? t('top bar') : v === 'big' ? t('big') : v === 'small' ? t('small') : t('hidden')}
            </button>
          ))}
          {cfg.heroDock && (cfg.heroDock.tucked || cfg.heroDock.lift > 0 || cfg.heroDock.side === 'left') && (
            <button className="pill" onClick={() => (sfx.tick(), set({ heroDock: undefined }))}>
              {t('reset position')}
            </button>
          )}
        </Opt>
        <Opt label={t('Pop-ups (level up, loot…)')}>
          {(['stay', 'auto'] as const).map((v) => (
            <button key={v} className={`pill ${(cfg.popups ?? 'stay') === v ? 'sel' : ''}`} aria-pressed={(cfg.popups ?? 'stay') === v} onClick={() => (sfx.tick(), set({ popups: v }))}>
              {v === 'stay' ? t('stay until cleared') : t('hide by themselves')}
            </button>
          ))}
        </Opt>
        <Opt label={t('Haptics')}>
          {[true, false].map((v) => (
            <button key={String(v)} className={`pill ${cfg.haptics === v ? 'sel' : ''}`} aria-pressed={cfg.haptics === v} onClick={() => set({ haptics: v })}>
              {v ? t('on') : t('off')}
            </button>
          ))}
        </Opt>
        <Opt label={t('Task font')}>
          {(['pixel', 'clean'] as const).map((v) => (
            <button key={v} className={`pill ${cfg.taskFont === v ? 'sel' : ''}`} aria-pressed={cfg.taskFont === v} onClick={() => set({ taskFont: v })}>
              {v === 'pixel' ? t('pixel') : t('clean')}
            </button>
          ))}
        </Opt>
        <Opt label={t('New day starts at')}>
          {[0, 3, 4, 5, 6].map((h) => (
            <button key={h} className={`pill ${cfg.dayStartHour === h ? 'sel' : ''}`} aria-pressed={cfg.dayStartHour === h} onClick={() => set({ dayStartHour: h })}>
              {h}:00
            </button>
          ))}
        </Opt>
        <Opt label={t('Week starts on')}>
          {[1, 0].map((d) => (
            <button key={d} className={`pill ${cfg.weekStart === d ? 'sel' : ''}`} aria-pressed={cfg.weekStart === d} onClick={() => set({ weekStart: d })}>
              {d === 1 ? t('Monday') : t('Sunday')}
            </button>
          ))}
        </Opt>
        <Opt label={t('Reminders (notifications)')}>
          <RemindersOption />
        </Opt>
        <Opt label={t('New here?')}>
          <button className="pill" onClick={() => (sfx.tick(), set({ introSeen: false }))}>
            {t('show the intro again')}
          </button>
          <button className="pill" onClick={() => (sfx.tick(), setNotes(true))}>
            {t("what's new")}
          </button>
          {notes && <WhatsNewSheet onClose={() => setNotes(false)} />}
        </Opt>
      </div>
      <SupportBox />
      <div className="section-label">{t('Backup')}</div>
      <div className="win" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn small" onClick={() => exportBackup(s.exportData())}>
          {t('Export save')}
        </button>
        {/* a real button (a label around a hidden input can't be reached with the keyboard) */}
        <button className="btn ghost small" onClick={() => importInput.current?.click()}>
          {t('Import save')}
        </button>
        <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (!confirm(t('Replace everything on this device with this backup? Party lists are merged with what the party did since, never replaced.'))) return;
              const ok = s.importData(await f.text());
              alert(ok ? t('Backup restored!') : t('That file is not a Task Conquest backup.'));
            }}
          />
        <div className="muted small" style={{ width: '100%' }}>
          {t('A JSON file with your hero, lists and loot. Cloud sync lives in the Party tab.')}
        </div>
      </div>
      <div className="section-label">{t('Danger zone')}</div>
      <div className="win" style={{ padding: 12 }}>
        <button
          className="btn ghost"
          onClick={() => {
            if (
              confirm(
                t(
                  'Delete your hero, loot and all your lists? When signed in to the cloud this also deletes them on your other devices, and lists you shared are deleted for their party. Party lists you joined are left, not deleted.',
                ),
              )
            )
              s.resetAll();
          }}
        >
          {t('Start over')}
        </button>
      </div>
    </div>
  );
}

async function exportBackup(json: string) {
  const name = `taskconquest-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: t('Task Conquest backup') });
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
      <div className="pixel" style={{ fontSize: 8, lineHeight: 1.6, color: 'var(--muted)', marginBottom: 8 }}>
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
        <div className="win-title">{existing ? t('Edit list') : t('New quest list')}</div>
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
                for (const task of Object.values(s.tasks))
                  if (task.listId === existing.id && !task.deleted && JSON.stringify(task.repeat) === oldR) s.updateTask(task.id, { repeat: newR });
              }
              sfx.pop();
            } else {
              s.setActiveList(s.addList({ name, type, theme, skill, icon, color }));
              sfx.loot();
            }
            onClose();
          }}
        >
          <Opt label={t('Name')}>
            <input className="text-in" autoFocus={!existing} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Home chores')} />
          </Opt>
          <Opt label={t('Type')}>
            {(Object.keys(LIST_TYPE_INFO) as ListType[]).map((lt) => (
              <button type="button" key={lt} className={`pill ${type === lt ? 'sel' : ''}`} aria-pressed={type === lt} onClick={() => setType(lt)}>
                {t(LIST_TYPE_INFO[lt].label)}
              </button>
            ))}
            <div style={{ width: '100%', fontSize: 14, color: 'var(--muted)' }}>{t(LIST_TYPE_INFO[type].hint)}</div>
          </Opt>
          <Opt label={t('Icon')}>
            {LIST_ICONS.map((i) => (
              <button type="button" key={i} className={`pill ${icon === i ? 'sel' : ''}`} aria-pressed={icon === i} aria-label={t('Icon {icon}', { icon: i })} onClick={() => setIcon(i)} style={{ padding: 3 }}>
                <PxImg src={iconFor('', i)} size={28} />
              </button>
            ))}
          </Opt>
          <Opt label={t('Color')}>
            {LIST_COLORS.map((c) => (
              <button type="button" key={c} className={`swatch ${color === c ? 'sel' : ''}`} aria-pressed={color === c} aria-label={t('Color {color}', { color: c })} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </Opt>
          <Opt label={t('Zone theme')}>
            {THEMES.map((th) => {
              const locked = level < th.unlockLevel && !owned.includes(`theme:${th.id}`);
              return (
                <button type="button" key={th.id} disabled={locked} className={`pill ${theme === th.id ? 'sel' : ''}`} aria-pressed={theme === th.id} onClick={() => setTheme(th.id)}>
                  {t(th.name)}
                  {locked ? ` 🔒${th.unlockLevel}` : ''}
                </button>
              );
            })}
          </Opt>
          <Opt label={t('Trains skill')}>
            {SKILLS.map((k) => (
              <button type="button" key={k.id} className={`pill ${skill === k.id ? 'sel' : ''}`} aria-pressed={skill === k.id} onClick={() => setSkill(k.id)}>
                {t(k.name)}
              </button>
            ))}
          </Opt>
          <div className="sheet-actions">
            <div>
              {existing &&
                (isForeignList(existing, s.accountId) ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      if (confirm(t('Leave "{name}"? It is removed from this device; the rest of the party keeps it.', { name: existing.name }))) {
                        s.leaveList(existing.id);
                        onClose();
                      }
                    }}
                  >
                    {t('Leave')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      const ask = existing.shared
                        ? t('Delete "{name}" and all its tasks? It is deleted for everyone in its party too.', { name: existing.name })
                        : t('Delete "{name}" and all its tasks?', { name: existing.name });
                      if (confirm(ask)) {
                        s.deleteList(existing.id);
                        onClose();
                      }
                    }}
                  >
                    {t('Delete')}
                  </button>
                ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn ghost" onClick={onClose}>
                {t('Cancel')}
              </button>
              <button className="btn" type="submit">
                {existing ? t('Save') : t('Create')}
              </button>
            </div>
          </div>
        </form>
    </Sheet>
  );
}
