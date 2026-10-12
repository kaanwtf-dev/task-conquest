import { useState } from 'react';
import { useStore } from './state/store';
import { Hud, ListChips, Sidebar, TabBar } from './ui/components/chrome';
import { useMedia, themeStyle } from './ui/components/common';
import Effects from './ui/components/Effects';
import HeroStage from './ui/stage/HeroStage';
import CreateHero from './ui/screens/CreateHero';
import QuestsScreen from './ui/screens/QuestsScreen';
import { ComingSoon, HeroScreen, ListSheet, SettingsScreen } from './ui/screens/OtherScreens';

export default function App() {
  const hero = useStore((s) => s.hero);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const log = useStore((s) => s.log);
  const font = useStore((s) => s.settings.taskFont);
  const corner = useStore((s) => s.settings.cornerHero ?? 'big');
  const list = useStore((s) => (s.activeListId ? s.lists[s.activeListId] : undefined));
  const wide = useMedia('(min-width: 900px)');
  const [newList, setNewList] = useState(false);

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
        {tab === 'shop' && (
          <ComingSoon title="Merchant" text="Potions, weapons, armor dyes, bag upgrades and zone unlocks — all bought with gold from slain tasks. Coming in the next build." />
        )}
        {tab === 'party' && (
          <ComingSoon title="Party" text="Shared lists with friends & family: invite with a code, see each other's heroes, and watch tasks get slain in real time. Coming in the next build." />
        )}
      </div>
      {wide ? (
        <aside className="stage-panel" style={themeStyle(theme)}>
          <Hud />
          <div className="win" style={{ padding: 0, overflow: 'hidden', lineHeight: 0 }}>
            <HeroStage w={108} h={70} scale={3} heroX={8} monsterX={74} theme={theme} onTap={() => setTab('hero')} />
          </div>
          <div className="win">
            <div className="win-title" style={{ padding: '10px 12px 0' }}>
              Adventure log
            </div>
            <div className="log">
              {log.slice(0, 12).map((l) => (
                <div key={l.id} className={`lk-${l.kind}`}>
                  ▸ {l.text}
                </div>
              ))}
            </div>
          </div>
        </aside>
      ) : corner === 'hidden' ? null : (
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
      {newList && <ListSheet onClose={() => setNewList(false)} />}
    </div>
  );
}
