import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectLang, setLang, t, tn, upper } from './index';
import { TR } from './tr';
import { TR_COMPONENTS } from './tr/components';
import { TR_CORE } from './tr/core';
import { TR_GAME } from './tr/game';
import { TR_PARTY } from './tr/party';
import { TR_SCREENS } from './tr/screens';
import { TR_STATE } from './tr/state';
import { TR_WORDS } from './tr/words';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'i18n' || f === 'dev' ? [] : files(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.|\.d\.ts$/.test(f) ? [p] : [];
  });
}
const SOURCES = files('src').map((path) => ({ path, text: readFileSync(path, 'utf8') }));
const unquote = (q: string, body: string) => (q === '`' ? body : body.replace(/\\(.)/g, '$1'));
const LIT = String.raw`(['"\x60])((?:\\.|(?!\1)[^\\])*)\1`;

/** Every English text marked for translation: t('…'), tn(n, '…', '…') and tk('…'). */
function keys(): { key: string; where: string }[] {
  const out: { key: string; where: string }[] = [];
  const once = new RegExp(String.raw`\b(?:t|tk)\(\s*${LIT}`, 'g');
  const plural = new RegExp(String.raw`\btn\([^,]+,\s*${LIT}\s*,\s*${LIT.replace('\\1', '\\3')}`, 'g');
  const withContext = new RegExp(String.raw`\btc\(\s*${LIT}\s*,\s*${LIT.replace('\\1', '\\3')}`, 'g');
  for (const { path, text } of SOURCES) {
    for (const m of text.matchAll(withContext)) out.push({ key: `${unquote(m[3], m[4])}|${unquote(m[1], m[2])}`, where: path });
    for (const m of text.matchAll(once)) if (!(m[1] === '`' && m[2].includes('${'))) out.push({ key: unquote(m[1], m[2]), where: path });
    for (const m of text.matchAll(plural)) {
      out.push({ key: unquote(m[1], m[2]), where: path });
      out.push({ key: unquote(m[3], m[4]), where: path });
    }
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('Turkish', () => {
  afterEach(() => setLang('en'));

  it('has a translation for every text the app shows', () => {
    const missing = [...new Set(keys().filter(({ key }) => !(key in TR)).map(({ key, where }) => `${where}: ${key}`))];
    expect(missing).toEqual([]);
  });

  it('translates each text the same way in every part of the app', () => {
    const groups = { TR_CORE, TR_GAME, TR_SCREENS, TR_PARTY, TR_COMPONENTS, TR_STATE, TR_WORDS };
    const seen = new Map<string, string[]>();
    for (const [g, d] of Object.entries(groups)) for (const [en, tr] of Object.entries(d)) seen.set(en, [...(seen.get(en) ?? []), `${g}: ${tr}`]);
    const clashes = [...seen].filter(([, v]) => new Set(v.map((x) => x.split(': ').slice(1).join(': '))).size > 1).map(([en, v]) => `${en} → ${v.join(' | ')}`);
    expect(clashes).toEqual([]);
  });

  it('keeps every {placeholder}', () => {
    const broken = Object.entries(TR).filter(([en, tr]) => placeholders(en) !== placeholders(tr)).map(([en, tr]) => `${en} → ${tr}`);
    expect(broken).toEqual([]);
  });

  it('leaves no plain English sentences in the screens', () => {
    // text between JSX tags that isn't wrapped in {t(...)}: two or more words, or one long word
    const leftovers: string[] = [];
    for (const { path, text } of SOURCES.filter((f) => f.path.endsWith('.tsx'))) {
      for (const m of text.matchAll(/(?<![=\-])>([^<>{}]*[A-Za-z]{2,}[^<>{}]*)</g)) {
        const s = m[1].trim();
        if (!/^[:?]|\?$|\);?$|;|\w\(/.test(s) && /^[\s\w.,:;!?'’"()&-]+$/.test(s) && (/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(s) || /[A-Za-z]{5,}/.test(s)) && !/^[a-z]+[A-Z]\w*$/.test(s))
          leftovers.push(`${path}: ${s}`);
      }
    }
    expect(leftovers).toEqual([]);
  });

  it('translates, fills placeholders and picks plurals', () => {
    TR['{n} quest'] ??= '{n} görev';
    TR['{n} quests'] ??= '{n} görev';
    expect(tn(2, '{n} quest', '{n} quests')).toBe('2 quests');
    setLang('tr');
    expect(tn(2, '{n} quest', '{n} quests')).toBe('2 görev');
    expect(t('Not in the dictionary {x}', { x: 1 })).toBe('Not in the dictionary 1');
    expect(upper('istanbul')).toBe('İSTANBUL');
  });

  it('picks Turkish from the phone language or the Turkey time zone', () => {
    const nav = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', { value: { languages: ['tr-TR'], language: 'tr-TR' }, configurable: true });
    expect(detectLang()).toBe('tr');
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });
  });
});
