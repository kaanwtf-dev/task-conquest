import { useEffect, useRef } from 'react';
import { Stage } from './stage';
import { useStore } from '../../state/store';
import { fx } from '../../state/fx';
import { useHeroLook } from '../../game/look';
import type { ThemeId } from '../../pixel/themes';
import { chestPix, itemIconPix, potionIconPix } from '../../pixel/sprites/items';
import { materialOf } from '../../game/loot';
import { sfx } from '../../audio/sfx';
import { haptic } from '../components/Effects';

const QUIPS = ['Hey!', 'Hehe', 'Oi!', 'Boop', 'Hm?', 'Ow!', 'Quest?', 'Yawn'];
const RACE_QUIPS: Record<string, string[]> = {
  orc: ['WAAGH!', 'Smash?'],
  undead: ['Braains', 'Creak'],
  catfolk: ['Mrrp!', 'Nya~'],
  imp: ['Hehehe', 'Mischief'],
  dwarf: ['Aye!', 'Ale?'],
  elf: ['Hmph.', 'Rude.'],
  lizardfolk: ['Hsss', 'Blep'],
  human: ['Yo!', 'Again?'],
};

interface Props {
  w: number;
  h: number;
  scale: number;
  heroX: number;
  monsterX: number;
  theme: ThemeId;
  className?: string;
  onTap?: () => void;
}

/** Live pixel stage. Listens to kill/level events; a tap skips a running battle, or pokes the idle hero. */
export default function HeroStage({ w, h, scale, heroX, monsterX, theme, className, onTap }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage | null>(null);
  const hero = useStore((s) => s.hero);
  const anim = useStore((s) => s.settings.anim);
  const sfxVol = useStore((s) => s.settings.sfx);
  const haptics = useStore((s) => s.settings.haptics);
  const look = useHeroLook();

  useEffect(() => {
    if (!ref.current || !hero) return;
    const st = new Stage(ref.current, w, h, theme, hero.appearance, look, heroX, monsterX);
    stage.current = st;
    const off = fx.on((e) => {
      if (e.type === 'kill') st.kill({ monster: e.monster, xp: e.xp, gold: e.gold, crit: e.crit, theme: e.theme as ThemeId });
      if (e.type === 'levelUp') st.levelUp();
      if (e.type === 'loot' && !e.soldFor) {
        const rarity = e.item?.rarity ?? 0;
        const icon = e.item
          ? itemIconPix({ slot: e.item.slot, base: e.item.base, palette: materialOf(e.item).palette }).toCanvas(1)
          : e.potion
            ? potionIconPix(e.potion.potion, e.potion.tier).toCanvas(1)
            : undefined;
        st.loot(chestPix(rarity, false).toCanvas(1), chestPix(rarity, true).toCanvas(1), icon);
      }
    });
    return () => {
      off();
      st.destroy();
      stage.current = null;
    };
    // the stage is recreated only when its geometry changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h, heroX, monsterX, !!hero]);

  useEffect(() => {
    if (stage.current && hero) stage.current.setHero(hero.appearance, look);
  }, [hero?.appearance, look]);

  useEffect(() => {
    stage.current?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!stage.current) return;
    stage.current.anim = anim;
    // the stage plays its own battle sounds; the list row plays the check blip
    stage.current.sound = sfxVol > 0 && anim !== 'off';
  }, [anim, sfxVol]);

  return (
    <canvas
      ref={ref}
      className={`px ${className ?? ''}`}
      style={{ width: w * scale, height: h * scale }}
      onClick={() => {
        if (!stage.current || stage.current.skip()) return;
        const lines = [...QUIPS, ...(RACE_QUIPS[hero?.appearance.race ?? ''] ?? [])];
        stage.current.poke(lines[Math.floor(Math.random() * lines.length)]);
        if (sfxVol > 0) sfx.poke();
        if (haptics) haptic();
        onTap?.();
      }}
    />
  );
}
