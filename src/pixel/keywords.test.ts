import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { setLang } from '../i18n';
import { guessAisle, lookup, matchKeyword } from './keywords';

describe('keyword icons', () => {
  it('matches the meaningful word in a phrase', () => {
    expect(lookup('buy oat milk')?.emoji).toBe('🥛');
    expect(lookup('Bananas')?.emoji).toBe('🍌');
    expect(lookup('strawberries')?.emoji).toBe('🍓');
    expect(lookup('Take out trash')?.emoji).toBe('🗑️');
  });

  it('prefers multi-word phrases', () => {
    expect(lookup('call mom')?.emoji).toBe('☎️');
    expect(lookup('toilet paper')?.emoji).toBe('🧻');
  });

  it('guesses grocery aisles', () => {
    expect(guessAisle('Eggs')).toBe('dairy');
    expect(guessAisle('chicken thighs')).toBe('meat');
    expect(guessAisle('Zorblax')).toBe('other');
  });
});

describe('Turkish keywords', () => {
  beforeEach(() => setLang('tr'));
  afterEach(() => setLang('en'));
  it('sorts Turkish groceries into aisles', () => {
    const cases: [string, string][] = [
      ['süt', 'dairy'], ['yoğurt', 'dairy'], ['beyaz peynir', 'dairy'], ['ayran', 'dairy'], ['tereyağı', 'dairy'],
      ['10 yumurta', 'dairy'], ['ekmek', 'bakery'], ['simit', 'bakery'], ['domates', 'produce'], ['salatalık', 'produce'],
      ['biber', 'produce'], ['soğan', 'produce'], ['patates', 'produce'], ['elma', 'produce'], ['muz', 'produce'],
      ['tavuk göğsü', 'meat'], ['kıyma', 'meat'], ['1 kg et', 'meat'], ['et', 'meat'], ['balık', 'meat'],
      ['pirinç', 'pantry'], ['bulgur', 'pantry'], ['makarna', 'pantry'], ['kırmızı mercimek', 'pantry'], ['un', 'pantry'],
      ['şeker', 'pantry'], ['zeytin', 'pantry'], ['zeytinyağı', 'pantry'], ['çay', 'drinks'], ['kahve', 'drinks'],
      ['su', 'drinks'], ['kola', 'drinks'], ['meyve suyu', 'drinks'], ['dondurma', 'frozen'], ['deterjan', 'household'],
      ['tuvalet kağıdı', 'household'], ['peçete', 'household'], ['şampuan', 'personal'], ['kedi maması', 'pets'],
    ];
    for (const [item, aisle] of cases) expect(guessAisle(item), item).toBe(aisle);
  });

  it('tolerates Turkish endings and consonant softening', () => {
    expect(guessAisle('sütler')).toBe('dairy');
    expect(guessAisle('yumurtaları')).toBe('dairy');
    expect(guessAisle('ekmeği unutma')).toBe('bakery'); // ekmek → ekmeği
    expect(guessAisle('2 simidi')).toBe('bakery'); // simit → simidi
    expect(guessAisle('domatesler')).toBe('produce');
    expect(guessAisle('suyu')).toBe('drinks');
    expect(guessAisle('sulardan')).toBe('drinks');
    expect(guessAisle('tuvalet kağıtları')).toBe('household');
    expect(guessAisle('elmalar')).toBe('produce');
  });

  it('lower-cases the Turkish way and accepts plain letters', () => {
    expect(guessAisle('SÜT')).toBe('dairy');
    expect(guessAisle('PİRİNÇ')).toBe('pantry');
    expect(guessAisle('BALIK')).toBe('meat');
    expect(guessAisle('IŞIK')).toBe('other');
    expect(guessAisle('ISPANAK')).toBe('produce');
    expect(guessAisle('sut')).toBe('dairy');
    expect(guessAisle('cay')).toBe('drinks');
    expect(guessAisle('seker')).toBe('pantry');
  });

  it('does not match inside other words', () => {
    expect(guessAisle('elmas')).toBe('other'); // not elma
    expect(guessAisle('sunum')).toBe('other'); // not su
    expect(guessAisle('kolay')).toBe('other'); // not kola
    expect(guessAisle('unutma')).toBe('other'); // not un
  });

  it('picks icons for Turkish quest titles', () => {
    expect(lookup('Spora git')?.emoji).toBe('🏋️');
    expect(lookup('Kitabı oku')?.emoji).toBe('📚');
    expect(lookup('Su iç')?.emoji).toBe('💧');
    expect(lookup('İlacını al')?.emoji).toBe('💊');
    expect(lookup('Köpeği gezdir')?.emoji).toBe('🐶');
    expect(lookup('Ev temizliği')?.emoji).toBe('🧹');
    expect(lookup('Market alışverişi')?.emoji).toBe('🛒');
    expect(lookup('Çamaşırları as')?.emoji).toBe('🧺');
    expect(lookup('Yemek yap')?.emoji).toBe('🍳');
    expect(lookup('Elektrik faturasını öde')?.emoji).toBe('💳');
    expect(lookup('Annemi ara')?.emoji).toBe('☎️');
    expect(lookup('Doktoru telefonla ara')?.emoji).toBe('☎️');
    expect(lookup('Telefon et')?.emoji).toBe('☎️'); // "et" here is "do", not meat
    expect(lookup('Sınava çalış')?.emoji).toBe('🎓');
  });

  it('leaves English matches unchanged', () => {
    expect(lookup('buy oat milk')?.emoji).toBe('🥛');
    expect(lookup('call mom')?.emoji).toBe('☎️');
    expect(guessAisle('Zorblax')).toBe('other');
    expect(lookup('Brainstorm')).toBeNull();
    expect(lookup('discipline')).toBeNull();
    expect(lookup('sun')).toBeNull();
    expect(lookup('Sue')).toBeNull();
  });
});

describe('Turkish keywords in an English app', () => {
  it('leave English words alone, but still read text with Turkish letters', () => {
    expect(matchKeyword('pillar')).toBeNull(); // not "pil" (battery)
    expect(guessAisle('unite')).toBe('other'); // not "un" (flour)
    expect(guessAisle('süt')).toBe('dairy');
  });
});
