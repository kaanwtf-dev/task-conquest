import { Suspense, lazy, useEffect, useState } from 'react';
import { useStore, visibleLists, TODAY_ID } from './state/store';
import { Hud, ListChips, Sidebar, TabBar } from './ui/components/chrome';
import { useMedia, themeStyle } from './ui/components/common';
import Effects from './ui/components/Effects';
import UpdateBanner from './ui/components/UpdateBanner';
import { playMusic, setMusicVolume, stopMusic } from './audio/music';
import { setSfxVolume } from './audio/sfx';
import HeroStage from './ui/stage/HeroStage';
import CreateHero from './ui/screens/CreateHero';
import QuestsScreen from './ui/screens/QuestsScreen';
import { ListSheet, SettingsScreen } from './ui/screens/OtherScreens';
import HeroScreen from './ui/screens/HeroScreen';
import ShopScreen from './ui/screens/ShopScreen';
const PartyScreen = lazy(() => import('./ui/screens/PartyScreen'));

export default function App() {
  const hero = useStore((s) => s.hero);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const log = useStore((s) => s.log);
  const font = useStore((s) => s.settings.taskFont);
  const corner = useStore((s) => s.settings.cornerHero ?? 'big');
  const list = useStore((s) => (s.activeListId ? s.lists[s.activeListId] : undefined));
  const wide = useMedia('(min-width: 900px)');
  const roomy = useMedia('(min-width: 1180px)');
  const [newList, setNewList] = useState(false);

  // desktop keyboard shortcuts: N or / = add quest, T = Today, 1-9 = lists, Esc closes sheets via click-away
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const sheet = document.querySelector<HTMLElement>('.sheet-back');
      if (e.key === 'Escape') {
        // Esc closes the open sheet, otherwise just leaves the focused input
        if (sheet) sheet.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), sheet.click();
        else (document.activeElement as HTMLElement | null)?.blur?.();
        return;
      }
      // shortcuts never act on the screen underneath an open sheet
      if (sheet || e.metaKey || e.ctrlKey || e.altKey || el.closest('input, textarea, select, [contenteditable]')) return;
      const st = useStore.getState();
      if (!st.hero) return;
      if (e.key === 'n' || e.key === '/') {
        e.preventDefault();
        if (st.tab !== 'quests') st.setTab('quests');
        setTimeout(() => document.querySelector<HTMLInputElement>('input[data-quickadd]')?.focus(), 0);
      } else if (e.key === 't') st.setActiveList(TODAY_ID);
      else if (/^[1-9]$/.test(e.key)) {
        const l = visibleLists(st)[Number(e.key) - 1];
        if (l) st.setActiveList(l.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sfxVolume = useStore((s) => s.settings.sfx);
  useEffect(() => setSfxVolume(sfxVolume), [sfxVolume]);

  // background music follows the current list's zone
  const music = useStore((s) => s.settings.music);
  const musicTheme = useStore((s) => (s.tab === 'shop' ? 'tavern' : s.activeListId && s.lists[s.activeListId] ? s.lists[s.activeListId].theme : 'castle'));
  useEffect(() => {
    setMusicVolume(music);
    if (music > 0 && hero) playMusic(musicTheme);
    else stopMusic();
  }, [music, musicTheme, !!hero]);

  if (!hero) return <CreateHero />;
  const theme = list?.theme ?? 'forest';

  return (
    <div className={`app ${font === 'clean' ? 'clean-font' : ''}`}>
      {wide && <Sidebar onNew={() => setNewList(true)} />}
      <div className="main-col">
        {!wide && <Hud />}
        {tab === 'quests' && !wide && <ListChips onNew={() => setNewList(true)} />}
        {tab === 'quests' && <QuestsScreen />}
        {tab === 'hero' && <HeroScreen />}
        {tab === 'settings' && <SettingsScreen />}
        {tab === 'shop' && <ShopScreen />}
        {tab === 'party' && (
          <Suspense fallback={<div className="scroll" />}>
            <PartyScreen />
          </Suspense>
        )}
      </div>
      {wide ? (
        <aside className="stage-panel" style={themeStyle(theme)}>
          <Hud />
          <div className="win" style={{ padding: 0, overflow: 'hidden', lineHeight: 0 }}>
            <HeroStage w={108} h={70} scale={roomy ? 3 : 2} heroX={8} monsterX={74} theme={theme} onTap={() => setTab('hero')} />
          </div>
          <div className="win panel-log">
            <div className="win-title" style={{ padding: '10px 12px 0' }}>
              Adventure log
            </div>
            <div className="log">
              {log.slice(0, 40).map((l) => (
                <div key={l.id} className={`lk-${l.kind}`}>
                  ▸ {l.text}
                </div>
              ))}
            </div>
          </div>
        </aside>
      ) : corner === 'hidden' || tab === 'hero' ? null : (
        <div className="corner-hero" style={themeStyle(theme)}>
          {corner === 'small' ? (
            <HeroStage w={56} h={46} scale={2} heroX={-10} monsterX={35} theme={theme} onTap={() => setTab('hero')} />
          ) : (
            <HeroStage w={72} h={56} scale={2} heroX={-7} monsterX={48} theme={theme} onTap={() => setTab('hero')} />
          )}
        </div>
      )}
      {!wide && <TabBar />}
      <Effects />
      <UpdateBanner />
      {newList && <ListSheet onClose={() => setNewList(false)} />}
    </div>
  );
}
