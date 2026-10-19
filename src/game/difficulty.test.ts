import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { setLang } from '../i18n';
import { guessDifficulty } from './difficulty';

describe('automatic difficulty', () => {
  it('guesses from the words in the name', () => {
    expect(guessDifficulty('Drink water')).toBe(0);
    expect(guessDifficulty('Call mom')).toBe(1);
    expect(guessDifficulty('Clean the kitchen')).toBe(2);
    expect(guessDifficulty('Workout at the gym')).toBe(3);
    expect(guessDifficulty('Do my taxes')).toBe(4);
    expect(guessDifficulty('Something')).toBe(2);
  });
  it('matches whole words only, and the hardest wins', () => {
    expect(guessDifficulty('Brainstorm')).toBe(2); // not "run"/"train"
    expect(guessDifficulty('Email the thesis draft')).toBe(4);
  });
  it("prefers the player's own earlier choice", () => {
    expect(guessDifficulty('Workout', { workout: 1 })).toBe(1);
  });
});

describe('automatic difficulty (Turkish)', () => {
  beforeEach(() => setLang('tr'));
  afterEach(() => setLang('en'));
  it('guesses from Turkish words', () => {
    expect(guessDifficulty('Su iç')).toBe(0);
    expect(guessDifficulty('Faturayı öde')).toBe(1);
    expect(guessDifficulty('Çamaşırları as')).toBe(1);
    expect(guessDifficulty('Markete uğra')).toBe(1);
    expect(guessDifficulty('Mutfak temizliği')).toBe(2);
    expect(guessDifficulty('Ödevini bitir')).toBe(2);
    expect(guessDifficulty('Spora git')).toBe(3);
    expect(guessDifficulty('Sabah koşusu')).toBe(3);
    expect(guessDifficulty('Raporu hazırla')).toBe(3);
    expect(guessDifficulty('Sunumu bitir')).toBe(3);
    expect(guessDifficulty('Vergi beyannamesi')).toBe(4);
    expect(guessDifficulty('Yeni eve taşınma')).toBe(4);
    expect(guessDifficulty('Tezimi yaz')).toBe(4);
    expect(guessDifficulty('Düğün hazırlıkları')).toBe(4);
  });

  it('matches word stems with Turkish endings', () => {
    expect(guessDifficulty('Sınavına çalış')).toBe(4);
    expect(guessDifficulty('Sınavlardan önce tekrar')).toBe(4);
    expect(guessDifficulty('Annemi ara')).toBe(1);
    expect(guessDifficulty('Annemi arayacağım')).toBe(1);
    expect(guessDifficulty('Kitabımı oku')).toBe(1); // kitap → kitabı
    expect(guessDifficulty('Spor salonuna git')).toBe(3);
  });

  it('uses Turkish casing (İ→i, I→ı) and accepts plain letters', () => {
    expect(guessDifficulty('SINAV')).toBe(4);
    expect(guessDifficulty('İLAÇ İÇ')).toBe(0);
    expect(guessDifficulty('ÖDEVİNİ BİTİR')).toBe(2);
    expect(guessDifficulty('sinava calis')).toBe(4);
    expect(guessDifficulty('odevini bitir')).toBe(2);
  });

  it('does not match inside other words', () => {
    expect(guessDifficulty('Araba')).toBe(2); // not "ara"
    expect(guessDifficulty('Toplantı notları')).toBe(2); // not "topla"
    expect(guessDifficulty('Sucuk')).toBe(2); // not "su"
  });

  it('leaves English guesses unchanged', () => {
    for (const [title, d] of [
      ['Drink water', 0], ['Call mom', 1], ['Clean the kitchen', 2], ['Workout at the gym', 3], ['Do my taxes', 4],
      ['Brainstorm', 2], ['Email the thesis draft', 4], ['Finally finish the sports article', 2], ['Sunday market list', 2],
      ['Write a long detailed note about the garden', 2], ['Plan a really long trip to the coast now', 2],
      ['Update the disability support form for work', 3],
    ] as const)
      expect(guessDifficulty(title), title).toBe(d);
  });
});
