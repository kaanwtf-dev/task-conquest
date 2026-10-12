// Keyword -> emoji (then pixelized) + grocery aisle guesses.
// Format: "emoji aisle: word, word, multi word"

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

export function lookup(text: string): { emoji: string; aisle: string } | null {
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
