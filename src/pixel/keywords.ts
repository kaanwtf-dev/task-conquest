// Keyword -> emoji (then pixelized) + grocery aisle guesses.
// Format: "emoji aisle: word, word, multi word"

import { getLang } from '../i18n';
const TABLE = `
🥛 dairy: milk, oat milk, almond milk, soy milk
🧀 dairy: cheese, cheddar, mozzarella, parmesan, feta, brie
🥚 dairy: egg, eggs
🧈 dairy: butter, margarine, ghee
🍦 frozen: ice cream, gelato
🍨 dairy: yogurt, yoghurt, pudding, kefir
🍞 bakery: bread, toast, loaf, sourdough
🥖 bakery: baguette
🥐 bakery: croissant, pastry
🥯 bakery: bagel
🧁 bakery: muffin, cupcake
🎂 bakery: cake, birthday
🍪 snacks: cookie, cookies, biscuit
🍩 bakery: donut, doughnut
🥞 pantry: pancake, waffle
🍎 produce: apple, apples
🍏 produce: green apple
🍌 produce: banana
🍊 produce: orange, tangerine, mandarin, clementine
🍋 produce: lemon, lime
🍇 produce: grape, grapes, raisin
🍓 produce: strawberry, berries, berry, raspberry
🫐 produce: blueberry, blueberries
🍒 produce: cherry, cherries
🍑 produce: peach, apricot, nectarine
🍐 produce: pear
🍍 produce: pineapple
🥭 produce: mango
🍉 produce: watermelon, melon
🥝 produce: kiwi
🥥 produce: coconut
🥑 produce: avocado, guacamole
🍅 produce: tomato, tomatoes
🥕 produce: carrot, carrots
🥔 produce: potato, potatoes
🍠 produce: sweet potato, yam
🧅 produce: onion, onions, shallot
🧄 produce: garlic
🌽 produce: corn
🥒 produce: cucumber, pickle, zucchini
🥬 produce: lettuce, spinach, kale, cabbage, greens, salad
🥦 produce: broccoli, cauliflower
🫑 produce: pepper, bell pepper, paprika
🌶️ produce: chili, jalapeno, hot sauce
🍆 produce: eggplant, aubergine
🍄 produce: mushroom, mushrooms
🫘 pantry: beans, lentils, chickpeas
🥜 snacks: peanut, peanuts, nuts, almonds, walnuts, cashew
🌰 snacks: chestnut, hazelnut
🍗 meat: chicken, wings, turkey, drumstick
🥩 meat: steak, beef, meat, lamb, pork, mince, ground beef
🥓 meat: bacon, ham
🌭 meat: sausage, hot dog, salami
🍔 meat: burger, hamburger, patty
🐟 meat: fish, salmon, tuna, cod
🦐 meat: shrimp, prawn, prawns
🦀 meat: crab
🍤 frozen: fried shrimp, tempura
🍕 frozen: pizza
🍝 pantry: pasta, spaghetti, noodles, macaroni, penne
🍜 pantry: ramen, soup
🍚 pantry: rice
🌾 pantry: flour, oats, oatmeal, wheat, grain
🥣 pantry: cereal, granola, muesli
🧂 pantry: salt, spices, seasoning
🫒 pantry: olive, olives, olive oil, oil
🍯 pantry: honey, syrup, jam
🍫 snacks: chocolate, cocoa, candy bar
🍬 snacks: candy, sweets, gum
🍿 snacks: popcorn
🥨 snacks: pretzel
🥫 pantry: can, canned, beans can, tomato sauce, sauce
🧃 drinks: juice, juice box
🥤 drinks: soda, cola, coke, pepsi, sprite, smoothie
🧋 drinks: boba, bubble tea
☕ drinks: coffee, espresso, latte, cappuccino
🍵 drinks: tea, matcha, green tea
💧 drinks: water, sparkling water, hydrate, drink water
🍺 drinks: beer, ale, lager
🍷 drinks: wine, red wine
🥂 drinks: champagne, prosecco
🥃 drinks: whiskey, whisky, rum, vodka, gin
🧊 frozen: ice, frozen
🧻 household: toilet paper, paper towel, tissues, napkins
🧼 household: soap, hand soap, dish soap
🧽 household: sponge, sponges, scrub
🧴 personal: shampoo, conditioner, lotion, sunscreen, body wash
🪥 personal: toothbrush, brush teeth, teeth
🦷 personal: dentist, floss, toothpaste
🧹 household: broom, sweep, clean, cleaning, tidy, vacuum, hoover
🧺 household: laundry, wash clothes, detergent
🗑️ household: trash, garbage, bin, take out trash, rubbish, recycling
🪣 household: bucket, mop, bleach
🔋 household: battery, batteries
💡 household: light bulb, bulb, lamp
🕯️ household: candle, candles
🛏️ home: bed, make bed, sheets, nap, sleep
🍽️ home: dishes, dishwasher, plates, dinner
🍳 home: cook, cooking, breakfast, fry
🥗 home: lunch, meal prep, healthy
🪴 home: plant, plants, water plants, garden, gardening
🌻 home: flowers, flower, sunflower
🏠 home: home, house, rent, apartment, landlord
🔑 home: keys, key, lock
🛋️ home: couch, sofa, furniture
🔧 home: fix, repair, tool, plumber, wrench
🔨 home: build, hammer, diy
🪚 home: saw, woodwork
🐶 pets: dog, puppy, walk dog, dog food
🐱 pets: cat, kitten, cat food, litter
🐟 pets: aquarium, fish food
🐦 pets: bird, birdseed
💊 health: medicine, meds, pills, vitamins, pharmacy, ibuprofen, aspirin
🩺 health: doctor, appointment, checkup, clinic
🏥 health: hospital
🩹 health: bandage, band aid, first aid
🧘 health: meditate, meditation, yoga, stretch, breathe
🏋️ fitness: gym, workout, lift, weights, exercise
💪 fitness: pushups, push ups, situps, abs, plank, strength
🏃 fitness: run, running, jog, cardio, 5k, 10k, marathon
🚶 fitness: walk, steps, stroll
🚴 fitness: bike, cycling, cycle
🏊 fitness: swim, swimming, pool
⚽ fitness: football, soccer
🏀 fitness: basketball
🎾 fitness: tennis, padel
📧 work: email, emails, inbox, reply
☎️ work: call, phone, ring, call mom, call dad, call parents, call grandma
💬 social: text, message, chat, reply to
📅 work: meeting, schedule, calendar, plan, planning, agenda
💼 work: work, job, office, client, interview
📊 work: report, spreadsheet, excel, slides, presentation, deck
💻 work: code, coding, laptop, computer, program, deploy, bug, website, app
📝 work: write, notes, essay, draft, journal, document
📚 study: study, homework, read, reading, book, books, library, learn
🎓 study: exam, test, class, course, lecture, school, university
✏️ study: pencil, sketch, draw
🎨 creative: paint, painting, art, design
🎸 creative: guitar, practice guitar
🎹 creative: piano, keyboard
🎵 creative: music, song, playlist, spotify
📷 creative: photo, photos, camera
🎬 creative: movie, film, video, youtube, edit video
🎮 fun: game, gaming, play, playstation, xbox, switch
🎲 fun: board game, dnd, dice
💰 finance: money, budget, savings, save money, invest
💳 finance: pay, bill, bills, credit card, invoice, payment
🧾 finance: receipt, taxes, tax, expense
🏦 finance: bank
✉️ errands: mail, letter, post office
📦 errands: package, parcel, amazon, return, ship, order
🛒 errands: shopping, groceries, grocery, supermarket, buy
🎁 social: gift, present, birthday present
🎉 social: party, celebrate
❤️ social: date, love, partner, girlfriend, boyfriend, wife, husband
💞 social: family, mom, dad, parents, kids
👵 social: grandma, grandpa
🚗 travel: car, drive, gas, fuel, petrol, car wash, mechanic
✈️ travel: flight, plane, airport, travel, trip, vacation, holiday
🧳 travel: pack, packing, luggage, suitcase
🏨 travel: hotel, booking, airbnb
🎫 travel: ticket, tickets
🗺️ travel: map, explore
💈 personal: haircut, barber, hair
💅 personal: nails, manicure
🚿 personal: shower, bath
👕 personal: clothes, shirt, tshirt, fold clothes, iron
👟 personal: shoes, sneakers
🧦 personal: socks
👓 personal: glasses, contacts
⏰ misc: alarm, wake up, early
🌙 misc: bedtime, night routine
☀️ misc: morning, morning routine, sunlight
⭐ misc: important, priority
🔥 misc: urgent, asap
`;

const KEYWORDS = new Map<string, { emoji: string; aisle: string }>();
const MULTI: [string, { emoji: string; aisle: string }][] = [];

for (const line of TABLE.trim().split('\n')) {
  const m = line.match(/^(\S+)\s+(\w+):\s*(.+)$/);
  if (!m) continue;
  const [, emoji, aisle, words] = m;
  for (const w of words.split(',').map((s) => s.trim().toLowerCase())) {
    if (!w) continue;
    const entry = { emoji, aisle };
    if (w.includes(' ')) MULTI.push([w, entry]);
    else if (!KEYWORDS.has(w)) KEYWORDS.set(w, entry);
  }
}
MULTI.sort((a, b) => b[0].length - a[0].length);

function singular(w: string): string[] {
  const out = [w];
  if (w.endsWith('ies')) out.push(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) out.push(w.slice(0, -2));
  if (w.endsWith('s')) out.push(w.slice(0, -1));
  return out;
}

function lookupEnglish(text: string): { emoji: string; aisle: string } | null {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()} `;
  for (const [phrase, e] of MULTI) if (t.includes(` ${phrase} `)) return e;
  const words = t.trim().split(' ');
  // prefer the last noun-ish word ("buy oat milk" -> milk), then earlier ones
  for (let i = words.length - 1; i >= 0; i--)
    for (const w of singular(words[i])) {
      const e = KEYWORDS.get(w);
      if (e) return e;
    }
  return null;
}

// ---------- Turkish ----------
// Turkish glues suffixes onto words ("sütü", "ekmekler", "sınavına"), so Turkish keywords are word STEMS
// matched at the start of a word. Text and stems are lower-cased the Turkish way (İ→i, I→ı) and then
// folded to plain letters (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u), so "SINAV", "sınav" and "sinav" all match.
// Stems of 4+ letters match any ending. Short stems (or ones marked "=") only take real Turkish endings,
// so "su" matches "suyu"/"suya"/"sudan" but not "sunum", and "elma=" matches "elmalar" but not "elmas".

/** Turkish-aware lower case, then folded to plain a–z letters. */
export function trFold(s: string): string {
  return s.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i').normalize('NFC');
}

/** The folded words of a text, split on anything that isn't a letter or digit. */
export function trWords(text: string): string[] {
  return trFold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

// noun endings: plural, possessive, then case ("-lar", "-ı/-sı/-yı", "-ım", "-ın", "-da/-dan", "-ya", "-yla", "-nın", "-daki")
const NOUN_END =
  '(?:l[ae]r)?(?:[sy]?[iu]|[iu]?m|[iu]?n|[iu]?m[iu]z|[iu]?n[iu]z)?(?:n?[iu]|[yn]?[ae]|n?[dt][ae]n?|y?l[ae]|[yn]?[iu]n|n?[dt][ae]ki|ki)?';
// verb endings: "-mak/-ma", "-acağım", "-iyor", "-dım/-tı", "-yınız", "-malıyım", "-abilir", "-ıp", "-sın"
const VERB_END =
  'm[ae]k?|y?[ae]c[ae][kg]\\p{L}*|[iu]?yor\\p{L}*|[dt][iu](?:m|k|n|n[iu]z|l[ae]r)?|y?[iu]n[iu]z|m[ae]l[iu](?:y[iu]m|s[iu]n|y[iu]z)?|y?[ae]bil(?:ir|ecek|mek|me|iyor)\\p{L}*|y?[iu]p|s[iu]n';
const TR_END = new RegExp(`^(?:${NOUN_END}|${VERB_END})$`, 'u');
const VOWELS = /[aeiou]/g;

interface TrStem {
  stem: string;
  /** any ending allowed (long stems); otherwise only Turkish endings */
  open: boolean;
  /** a softened stem (kitab-, köpeğ-): only ever followed by a vowel */
  soft?: boolean;
}

function trStems(raw: string): TrStem[] {
  const strict = raw.endsWith('=');
  const stem = trFold(strict ? raw.slice(0, -1) : raw);
  const open = !strict && stem.length >= 4;
  const out: TrStem[] = [{ stem, open }];
  // consonant softening before a vowel ending: kitap→kitabı, köpek→köpeği, simit→simidi
  const soft: Record<string, string> = { k: 'g', p: 'b', t: 'd' };
  const last = stem[stem.length - 1];
  if (soft[last] && (stem.match(VOWELS)?.length ?? 0) >= 2) out.push({ stem: stem.slice(0, -1) + soft[last], open, soft: true });
  return out;
}

const isVowel = (c: string | undefined) => c !== undefined && 'aeiou'.includes(c);

function trWordMatches(word: string, s: TrStem): boolean {
  if (!word.startsWith(s.stem)) return false;
  const rest = word.slice(s.stem.length);
  if (s.soft && !isVowel(rest[0])) return false;
  if (rest === '' || s.open) return true;
  const stemEndsInVowel = isVowel(s.stem[s.stem.length - 1]);
  // a vowel ending after a vowel always takes a buffer letter (suyu, suya), never "sue"/"suite"
  if (stemEndsInVowel && isVowel(rest[0])) return false;
  // a lone consonant is only an ending after a vowel (annem), and not on two-letter words ("sun", "sum")
  if (rest.length === 1 && !isVowel(rest) && (!stemEndsInVowel || s.stem.length <= 2)) return false;
  return TR_END.test(rest);
}

/** Matches Turkish stems and multi-word phrases in a text. The first value added for a stem wins. */
export class TurkishMatcher<T> {
  private single = new Map<string, { s: TrStem; v: T }>();
  private maxStem = 0;
  private multi: { parts: TrStem[][]; v: T; len: number }[] = [];

  add(phrase: string, v: T): void {
    // "e-posta" becomes two parts, like the words of the text it's matched against
    const parts = phrase.trim().split(/[^\p{L}\p{N}=]+/u).filter(Boolean);
    if (parts.length === 0) return;
    if (parts.length === 1) {
      for (const s of trStems(parts[0]))
        if (!this.single.has(s.stem)) {
          this.single.set(s.stem, { s, v });
          this.maxStem = Math.max(this.maxStem, s.stem.length);
        }
      return;
    }
    this.multi.push({ parts: parts.map(trStems), v, len: phrase.length });
    this.multi.sort((a, b) => b.len - a.len);
  }

  /** The longest phrase found anywhere in the words. */
  phrase(words: string[]): T | null {
    for (const m of this.multi) if (this.phraseAt(words, m.parts) >= 0) return m.v;
    return null;
  }

  /** The value of the longest stem this word starts with (that the rest of the word fits). */
  word(word: string): T | null {
    for (let k = Math.min(word.length, this.maxStem); k > 0; k--) {
      const e = this.single.get(word.slice(0, k));
      if (e && trWordMatches(word, e.s)) return e.v;
    }
    return null;
  }

  /** Every phrase and word match in the words. */
  all(words: string[]): T[] {
    const out: T[] = [];
    for (const m of this.multi) if (this.phraseAt(words, m.parts) >= 0) out.push(m.v);
    for (const w of words) {
      const v = this.word(w);
      if (v !== null) out.push(v);
    }
    return out;
  }

  private phraseAt(words: string[], parts: TrStem[][]): number {
    for (let i = 0; i + parts.length <= words.length; i++)
      if (parts.every((alts, j) => alts.some((s) => trWordMatches(words[i + j], s)))) return i;
    return -1;
  }
}

// Same format as TABLE. Stems: "elma=" = only Turkish endings (not "elmas").
const TR_TABLE = `
🥛 dairy: süt, laktozsuz süt, ayran, kefir
🧀 dairy: peynir, beyaz peynir, kaşar, lor, labne, tulum peyniri, hellim, krem peynir, krem peyniri
🥚 dairy: yumurta
🧈 dairy: tereyağ, margarin
🍨 dairy: yoğurt, puding, sütlaç, muhallebi, kaymak
🍦 frozen: dondurma
🍞 bakery: ekmek, somun, lavaş, pide, bazlama
🥯 bakery: simit, poğaça, açma=
🥐 bakery: kruvasan, börek
🎂 bakery: kek, turta, doğum günü, yaş günü
🍪 snacks: bisküvi, kurabiye, kraker, gofret
🥞 pantry: krep, pankek
🍎 produce: elma=
🍌 produce: muz
🍊 produce: portakal, mandalina
🍋 produce: limon
🍇 produce: üzüm
🍓 produce: çilek, frambuaz, böğürtlen
🫐 produce: yaban mersini
🍒 produce: kiraz, vişne
🍑 produce: şeftali, kayısı, nektarin
🍐 produce: armut
🍍 produce: ananas
🍉 produce: karpuz, kavun
🥝 produce: kivi
🥑 produce: avokado
🍅 produce: domates
🥕 produce: havuç
🥔 produce: patates
🧅 produce: soğan
🧄 produce: sarımsak
🌽 produce: mısır
🥒 produce: salatalık, hıyar, kabak, turşu
🥬 produce: marul, ıspanak, lahana, roka, maydanoz, dereotu, nane, salata, yeşillik
🥦 produce: brokoli, karnabahar
🫑 produce: biber, kapya
🌶️ produce: acı biber, pul biber
🍆 produce: patlıcan
🍄 produce: mantar
🫘 pantry: fasulye, mercimek, nohut, barbunya
🥜 snacks: fıstık, ceviz, badem, kuruyemiş, çekirdek
🌰 snacks: fındık, kestane
🍗 meat: tavuk, hindi, piliç, kanat
🥩 meat: et, eti, kıyma, biftek, dana, kuzu, bonfile, pirzola, antrikot, kırmızı et, kavurma
🥓 meat: pastırma
🌭 meat: sosis, sucuk, salam=
🍔 meat: köfte
🐟 meat: balık, somon, ton balığı, levrek, çupra=, hamsi, uskumru
🦐 meat: karides
🍝 pantry: makarna, erişte, spagetti
🍜 pantry: çorba=
🍚 pantry: pirinç, bulgur, pilav
🌾 pantry: un, irmik, yulaf, buğday, nişasta
🥣 pantry: mısır gevreği, müsli=
🧂 pantry: tuz, baharat, karabiber, kimyon, kekik
🫒 pantry: zeytin, zeytinyağ, sıvı yağ, ayçiçek yağı, yağ
🍯 pantry: bal, reçel, pekmez, tahin
🍬 pantry: şeker, toz şeker
🍫 snacks: çikolata, kakao
🍬 snacks: sakız, lokum, helva
🍿 snacks: patlamış mısır, cips
🥫 pantry: konserve, salça, ketçap, mayonez, hardal, sos
🧃 drinks: meyve suyu, portakal suyu, elma suyu, vişne suyu, nar suyu
🥤 drinks: kola=, gazoz, limonata
☕ drinks: kahve, nescafe
🍵 drinks: çay, yeşil çay, bitki çayı
💧 drinks: su, maden suyu, su iç
🍺 drinks: bira=
🍷 drinks: şarap=
🥃 drinks: rakı=, viski, votka
🧊 frozen: buz, dondurulmuş
🧻 household: tuvalet kağıt, kağıt havlu, peçete, mendil, ıslak mendil
🧼 household: sabun, sıvı sabun, bulaşık deterjanı
🧽 household: sünger
🧴 personal: şampuan, saç kremi, losyon, güneş kremi, duş jeli, deodorant
🪥 personal: diş fırça, diş fırçala
🦷 personal: diş, diş macunu, diş ipi, dişçi=, diş hekimi
🧹 household: süpür, temizlik, temizle, toz al, toz alma
🧺 household: çamaşır, deterjan, yumuşatıcı
🗑️ household: çöp, çöp torbası, geri dönüşüm
🪣 household: çamaşır suyu, kova, paspas
🔋 household: pil
💡 household: ampul, lamba=
🕯️ household: mumlar
🛏️ home: yatak, yatağı topla, uyku, şekerleme
🍽️ home: bulaşık, bulaşık makinesi, tabak, akşam yemeği
🍳 home: yemek, pişir, kahvaltı
🥗 home: öğle yemeği, sağlıklı
🪴 home: bitki, sula=, bahçe
🌻 home: çiçek
🏠 home: ev, kira
🔑 home: anahtar, kilit
🛋️ home: koltuk, kanepe, mobilya
🔧 home: tamir, onar, tesisatçı
🔨 home: matkap
🐶 pets: köpek, köpek maması
🐱 pets: kedi, kedi maması, kedi kumu, maması
🐟 pets: akvaryum, balık yemi
🐦 pets: kuş, kuş yemi
💊 health: ilaç, vitamin, hap, eczane, antibiyotik, ağrı kesici
🩺 health: doktor, randevu, muayene, check up
🏥 health: hastane
🩹 health: yara bandı, bandaj, ilk yardım
🧘 health: meditasyon, esne=, nefes
🏋️ fitness: spor=, antrenman, idman, egzersiz, ağırlık
💪 fitness: şınav çek, mekik, karın kası
🏃 fitness: koşu, koş, kardiyo, maraton
🚶 fitness: yürüyüş, yürü
🚴 fitness: bisiklet
🏊 fitness: yüzme, havuz
⚽ fitness: futbol, maç izle, halı saha
🏀 fitness: basketbol
🎾 fitness: tenis
📧 work: e-posta, eposta, mailleri
☎️ work: telefon, ara=, aramak
💬 social: mesaj, sms
📅 work: toplantı, takvim, planla, ajanda
💼 work: ofis, müşteri=, mülakat, iş görüşmesi, işe git
📊 work: rapor, sunum, slayt, proje=
💻 work: bilgisayar, yazılım, kod=
📝 work: yaz=, not al, makale, kompozisyon
📚 study: kitap, oku=, ders, ödev, kütüphane, öğren, ders çalış
🎓 study: sınav, okul, üniversite, kurs, tez
✏️ study: çiz=, çizim, kalem
🎨 creative: boya=, resim, tasarım
🎸 creative: gitar
🎹 creative: piyano
🎵 creative: müzik, şarkı=
📷 creative: fotoğraf
🎬 creative: dizi=
🎮 fun: oyun
🎲 fun: kutu oyunu
💰 finance: para=, bütçe, birikim, yatırım
💳 finance: fatura, öde=, ödeme, kredi kartı, aidat
🧾 finance: vergi=, fiş, makbuz, masraf
🏦 finance: banka=
✉️ errands: posta=, postane, mektup
📦 errands: kargo, paket, iade, sipariş
🛒 errands: market=, alışveriş, bakkal, satın al
🎁 social: hediye
🎉 social: parti=, kutlama
❤️ social: sevgili, buluşma
💞 social: aile=, anne=, baba, çocuk
👵 social: anneanne, babaanne, büyükanne, dede
🚗 travel: araba, araç=, benzin, mazot, oto yıkama
✈️ travel: uçak, uçuş, havalimanı, seyahat, tatil, gezi
🧳 travel: bavul, valiz
🏨 travel: otel, rezervasyon
🎫 travel: bilet
🗺️ travel: harita
💈 personal: berber, kuaför, saç, saç kesimi
💅 personal: manikür, oje, tırnak
🚿 personal: duş, banyo
👕 personal: kıyafet, giysi, ütü, gömlek, tişört, elbise
👟 personal: ayakkabı
🧦 personal: çorap
👓 personal: gözlük, lens
⏰ misc: uyan
☀️ misc: sabah
⭐ misc: önemli
🔥 misc: acil
`;

const TR = new TurkishMatcher<{ emoji: string; aisle: string }>();
for (const line of TR_TABLE.trim().split('\n')) {
  const m = line.match(/^(\S+)\s+(\w+):\s*(.+)$/);
  if (!m) continue;
  const [, emoji, aisle, words] = m;
  for (const w of words.split(',')) TR.add(w, { emoji, aisle });
}

// "et" is also the verb "do" ("telefon et", "kontrol et"): only meat on its own or after an amount
const TR_AMOUNT = new Set(['kg', 'kilo', 'gr', 'g', 'gram', 'yarim', 'bir', 'iki', 'biraz', 'paket']);

function lookupTurkish(text: string): { emoji: string; aisle: string } | null {
  const words = trWords(text);
  const p = TR.phrase(words);
  if (p) return p;
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    if (w === 'et' && i > 0 && !TR_AMOUNT.has(words[i - 1]) && !/\d/.test(words[i - 1])) continue;
    const e = TR.word(w);
    if (e) return e;
  }
  return null;
}

/**
 * Turkish words count when the app is in Turkish, or when the text has Turkish letters: an English player's
 * "pillar" never turns into "pil" (battery).
 */
export function maybeTurkish(text: string): boolean {
  return getLang() === 'tr' || /[çğıöşüİ]/i.test(text);
}

/** English keywords first (unchanged), then Turkish stems. */
export function lookup(text: string): { emoji: string; aisle: string } | null {
  return lookupEnglish(text) ?? (maybeTurkish(text) ? lookupTurkish(text) : null);
}

export function matchKeyword(text: string): string | null {
  return lookup(text)?.emoji ?? null;
}

export const AISLES: Record<string, { name: string; order: number }> = {
  produce: { name: 'Produce', order: 1 },
  bakery: { name: 'Bakery', order: 2 },
  dairy: { name: 'Dairy & Eggs', order: 3 },
  meat: { name: 'Meat & Fish', order: 4 },
  pantry: { name: 'Pantry', order: 5 },
  snacks: { name: 'Snacks', order: 6 },
  frozen: { name: 'Frozen', order: 7 },
  drinks: { name: 'Drinks', order: 8 },
  household: { name: 'Household', order: 9 },
  personal: { name: 'Personal Care', order: 10 },
  pets: { name: 'Pets', order: 11 },
  health: { name: 'Health', order: 12 },
  other: { name: 'Other', order: 99 },
};

export function guessAisle(text: string): string {
  const a = lookup(text)?.aisle;
  return a && a in AISLES ? a : 'other';
}
