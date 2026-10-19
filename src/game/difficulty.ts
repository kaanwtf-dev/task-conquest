// Automatic quest difficulty: a quick guess from the words in a quest's name (the player can always
// change it; their choice is remembered for that name). No network, no cost, instant.
import type { Difficulty } from '../core/types';
import { TurkishMatcher, maybeTurkish, trWords } from '../pixel/keywords';

// whole words or phrases, lower case; the hardest match wins
const WORDS: Record<Difficulty, string[]> = {
  0: [
    'drink water', 'water', 'vitamin', 'vitamins', 'pill', 'pills', 'meds', 'medicine', 'brush teeth', 'floss', 'feed',
    'text', 'reply', 'like', 'check', 'remind', 'take out trash', 'trash', 'bins', 'make bed', 'water plants', 'stretch',
  ],
  1: [
    'call', 'email', 'mail', 'pay', 'bill', 'book', 'order', 'buy', 'shop', 'dishes', 'laundry', 'walk', 'read', 'meditate',
    'journal', 'cook', 'tidy', 'vacuum', 'shower', 'groceries', 'pick up', 'drop off', 'return', 'charge', 'backup',
  ],
  2: [
    'clean', 'wash', 'iron', 'meal prep', 'practice', 'review', 'plan', 'write', 'fix', 'repair', 'appointment', 'meeting',
    'homework', 'lesson', 'errand', 'errands', 'organize', 'declutter', 'yoga', 'bike', 'swim',
  ],
  3: [
    'workout', 'work out', 'gym', 'run', 'running', 'jog', 'train', 'training', 'study', 'report', 'presentation', 'essay',
    'project', 'interview', 'deep clean', 'garage', 'paint', 'assemble', 'deadline', 'apply', 'application', 'exam prep',
  ],
  4: [
    'exam', 'final', 'finals', 'thesis', 'taxes', 'tax return', 'move', 'moving', 'marathon', 'renovate', 'renovation',
    'launch', 'wedding', 'portfolio', 'certification', 'visa', 'mortgage',
  ],
};

const INDEX: [RegExp, Difficulty][] = (Object.entries(WORDS) as [string, string[]][]).flatMap(([d, ws]) =>
  ws.map((w) => [new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu'), Number(d) as Difficulty] as [RegExp, Difficulty]),
);

// Turkish word stems, matched at the start of a word so endings still count ("sınav" → "sınavına",
// "spor" → "spora", "ödev" → "ödevini"); see TurkishMatcher. "ara=" = only real Turkish endings (not "araba").
const TR_WORDS: Record<Difficulty, string[]> = {
  0: [
    'su iç', 'su içmek', 'vitamin', 'ilaç', 'hap', 'diş fırçala', 'dişlerini fırçala', 'diş ipi', 'besle', 'mesaj',
    'yanıtla', 'cevap ver', 'beğen', 'kontrol', 'hatırlat', 'çöp', 'çöpü at', 'yatağı topla', 'yatak topla', 'çiçek sula',
    'bitki sula', 'sula=', 'esne=', 'esneme',
  ],
  1: [
    'ara=', 'aramak', 'telefon', 'e-posta', 'eposta', 'fatura', 'öde=', 'ödeme', 'rezervasyon', 'sipariş', 'satın al',
    'alışveriş', 'markete=', 'markette=', 'marketten=', 'bulaşık', 'çamaşır', 'yürüyüş', 'yürü', 'kitap', 'oku=', 'meditasyon', 'yemek yap',
    'pişir', 'toparla', 'süpür', 'duş', 'banyo yap', 'kargo', 'paket', 'teslim al', 'iade', 'şarj', 'yedekle',
  ],
  2: [
    'temizle', 'temizlik', 'yıka', 'ütü', 'ütüle', 'yemek hazırla', 'pratik', 'tekrar', 'gözden geçir', 'planla',
    'yaz=', 'tamir', 'onar', 'düzelt', 'randevu', 'toplantı', 'ödev', 'ders', 'ayak işi', 'düzenle', 'yoga', 'bisiklet',
    'yüzme', 'havuz',
  ],
  3: [
    'spor=', 'antrenman', 'idman', 'egzersiz', 'koşu', 'koş', 'ders çalış', 'çalış=', 'rapor', 'sunum',
    'makale', 'kompozisyon', 'proje=', 'mülakat', 'iş görüşmesi', 'derin temizlik', 'bahar temizliği', 'garaj', 'boya=',
    'montaj', 'son teslim', 'başvur',
  ],
  4: [
    'sınav', 'final=', 'vize', 'tez', 'vergi=', 'beyanname', 'taşın', 'nakliye', 'maraton', 'tadilat', 'renovasyon',
    'lansman', 'düğün', 'nikah', 'portföy', 'sertifika', 'kpss', 'yks', 'konut kredi',
  ],
};

const TR = new TurkishMatcher<Difficulty>();
for (const [d, ws] of Object.entries(TR_WORDS) as [string, string[]][]) for (const w of ws) TR.add(w, Number(d) as Difficulty);

/** The player's own past choice for this name, else the hardest keyword in it, else Normal. */
export function guessDifficulty(title: string, memory?: Record<string, number>): Difficulty {
  const key = title.trim().toLowerCase();
  const remembered = memory?.[key];
  if (remembered !== undefined && remembered >= 0 && remembered <= 4) return remembered as Difficulty;
  let best: Difficulty | null = null;
  for (const [re, d] of INDEX) if (re.test(key) && (best === null || d > best)) best = d;
  if (maybeTurkish(title)) for (const d of TR.all(trWords(title))) if (best === null || d > best) best = d;
  // a long, detailed quest name is usually a bigger job
  if (best === null) return key.split(/\s+/).length >= 6 ? 3 : 2;
  return best;
}
