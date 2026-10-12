import { useMemo, useState } from 'react';
import { RACES, RACE_BY_ID, HAIR_STYLES, HAIR_COLORS, EYE_COLORS, OUTFIT_COLORS, heroPix, type Appearance, type BeardStyle, type RaceId } from '../../pixel/sprites/hero';
import { CLASSES, CLASS_BY_ID } from '../../game/catalog';
import { weaponPix, MATERIALS } from '../../pixel/sprites/gear';
import { spriteUrl } from '../../pixel/pix';
import { useStore } from '../../state/store';
import type { ClassId } from '../../core/types';
import { HeroPreview, PxImg, themeStyle, useMedia } from '../components/common';
import { sfx, unlockAudio } from '../../audio/sfx';

const PANTS = ['#4a3a2a', '#2a2a3a', '#3a4a6a', '#5a2a2a', '#2a4a2a'];

export default function CreateHero() {
  const createHero = useStore((s) => s.createHero);
  const wide = useMedia('(min-width: 900px)');
  const [name, setName] = useState('');
  const [classId, setClassId] = useState<ClassId>('knight');
  const [app, setApp] = useState<Appearance>({
    race: 'human', skin: 1, hair: 'short', hairColor: HAIR_COLORS[1], eyes: RACE_BY_ID.human.defaultEyes,
    beard: 'none', outfit: OUTFIT_COLORS[0], pants: PANTS[0],
  });
  const look = CLASS_BY_ID[classId].look;
  const race = RACE_BY_ID[app.race];
  const patch = (p: Partial<Appearance>) => {
    sfx.tick();
    setApp((a) => ({ ...a, ...p }));
  };
  const pickRace = (id: RaceId) => {
    unlockAudio();
    const r = RACE_BY_ID[id];
    patch({ race: id, skin: 0, eyes: r.defaultEyes, beard: id === 'dwarf' ? 'long' : app.beard === 'long' && app.race === 'dwarf' ? 'none' : app.beard });
  };

  const raceThumbs = useMemo(
    () =>
      Object.fromEntries(
        RACES.map((r) => [
          r.id,
          spriteUrl(`thumb:${r.id}:${app.hair}:${app.hairColor}:${app.outfit}`, () =>
            heroPix({ ...app, race: r.id, skin: 0, eyes: r.defaultEyes, beard: r.id === 'dwarf' ? 'long' : 'none' }, {}),
          ),
        ]),
      ),
    [app],
  );

  const preview = (
    <div className="win" style={{ overflow: 'hidden', padding: 0 }}>
      <HeroPreview app={app} look={look} theme="forest" w={wide ? 110 : 96} h={wide ? 74 : 60} scale={wide ? 4 : 4} />
      <div style={{ padding: '10px 12px' }}>
        <div className="win-title">{race.name} {CLASS_BY_ID[classId].name}</div>
        <div style={{ marginTop: 6, fontSize: 15 }}>{race.blurb}</div>
        <div style={{ marginTop: 4, fontSize: 15, color: 'var(--accent)' }}>✦ {race.perk}</div>
      </div>
    </div>
  );

  const options = (
    <>
      <Section title="Race">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {RACES.map((r) => (
            <button key={r.id} className={`opt ${app.race === r.id ? 'sel' : ''}`} onClick={() => pickRace(r.id)}>
              <PxImg src={raceThumbs[r.id]} size={64} style={{ margin: '-6px auto -8px', display: 'block' }} />
              <span>{r.name}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Class">
        <div className="class-grid">
          {CLASSES.map((c) => (
            <button key={c.id} className={`opt ${classId === c.id ? 'sel' : ''}`} onClick={() => (sfx.tick(), setClassId(c.id))}>
              <PxImg src={spriteUrl(`wicon:${c.weapon}`, () => weaponPix(c.weapon, c.look.weapon?.mat ?? MATERIALS.iron))} size={40} style={{ margin: '0 auto', display: 'block' }} />
              <span>{c.name}</span>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 15, marginTop: 8, color: 'var(--muted)' }}>{CLASS_BY_ID[classId].blurb}</div>
      </Section>

      <Section title="Look">
        <Row label="Skin">
          {race.skins.map((c, i) => (
            <Swatch key={c} color={c} on={app.skin === i} onClick={() => patch({ skin: i })} />
          ))}
        </Row>
        {app.race !== 'lizardfolk' && (
          <Row label="Hair">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {HAIR_STYLES.map((h) => (
                <button key={h} className={`pill ${app.hair === h ? 'sel' : ''}`} onClick={() => patch({ hair: h })}>
                  {h}
                </button>
              ))}
            </div>
          </Row>
        )}
        <Row label={app.race === 'lizardfolk' ? 'Crest' : 'Hair color'}>
          {HAIR_COLORS.map((c) => (
            <Swatch key={c} color={c} on={app.hairColor === c} onClick={() => patch({ hairColor: c })} />
          ))}
        </Row>
        {app.race !== 'lizardfolk' && (
          <Row label="Beard">
            {(['none', 'short', 'long'] as BeardStyle[]).map((b) => (
              <button key={b} className={`pill ${app.beard === b ? 'sel' : ''}`} onClick={() => patch({ beard: b })}>
                {b}
              </button>
            ))}
          </Row>
        )}
        <Row label="Eyes">
          {EYE_COLORS.map((c) => (
            <Swatch key={c} color={c} on={app.eyes === c} onClick={() => patch({ eyes: c })} />
          ))}
        </Row>
        <Row label="Outfit">
          {OUTFIT_COLORS.map((c) => (
            <Swatch key={c} color={c} on={app.outfit === c} onClick={() => patch({ outfit: c })} />
          ))}
        </Row>
        <Row label="Pants">
          {PANTS.map((c) => (
            <Swatch key={c} color={c} on={app.pants === c} onClick={() => patch({ pants: c })} />
          ))}
        </Row>
      </Section>

      <Section title="Name">
        <form
          style={{ display: 'flex', gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            sfx.levelUp();
            createHero(name, app, classId);
          }}
        >
          <input className="text-in" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder="Hero name" aria-label="Hero name" />
          <button className="btn" type="submit">
            Begin
          </button>
        </form>
      </Section>
    </>
  );

  return (
    <div className="create" style={themeStyle(undefined)}>
      <div className="create-head">
        <div className="pixel logo">QUESTLOG</div>
        <div className="pixel" style={{ fontSize: 9, color: '#b8c0f0', marginTop: 8 }}>
          CREATE YOUR HERO
        </div>
      </div>
      {wide ? (
        <div className="create-grid">
          <div style={{ position: 'sticky', top: 16, alignSelf: 'start' }}>{preview}</div>
          <div>{options}</div>
        </div>
      ) : (
        <div className="create-col">
          {preview}
          {options}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="win" style={{ padding: 12, marginTop: 16 }}>
      <div className="win-title" style={{ marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0', flexWrap: 'wrap' }}>
      <div className="pixel" style={{ fontSize: 8, width: 78, color: 'var(--muted)' }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>{children}</div>
    </div>
  );
}

function Swatch({ color, on, onClick }: { color: string; on: boolean; onClick: () => void }) {
  return <button className={`swatch ${on ? 'sel' : ''}`} style={{ background: color }} onClick={onClick} aria-label={color} />;
}
