// The narrator's lines (docs/story.md, docs/narration.md): what the Glassmaker says, by id, and
// when. game/narrator.js tells her the moments as they happen (a new place, a boss's attack, a
// death ...) and plays what she has to say about them, one line after the other, with subtitles;
// `node tools/narration.mjs` says every line in every voiced language, in each of its forms, and
// renders it to assets/narration/<lang>/<clip>.mp3.
//
// A line:
//   id      what it is kept, sent and recorded under: lowercase words joined by '-' or '.'
//   on      the moment it is said at (MOMENTS)
//   when    (optional) what the moment must be about: { key: value } of its data, each a value,
//           a list of values, or [lo, hi] for a number (a depth)
//   text    the English message (src/i18n: translated like every other, German in
//           src/i18n/de/story.js); at most two short sentences. It may carry performance tags
//           for the voice, `[sad]`, `[whispers]`, `[sighing]` ... (TAG): never shown, said as
//           instructions (tools/narration.mjs TAGS; docs/narration.md, "Performance tags")
//   note    when it comes, how it should feel, who she is thinking of: for the translators and the
//           voice
//   forms   (optional) the parameters it is said with, one recording each, by form name: the
//           clip is `<id>.<form>`. Without forms the line has no parameters and one clip, `<id>`.
//   instruct (optional) how the line is said, for the voice: plain vivid English ('Speak slowly
//           and softly, as if half asleep.'); tags in the text win (docs/narration.md,
//           "Instructions")
//   seed    (optional) the take: the TTS noise seed, a number, or by language (`{ de: 3 }`) or
//           language and form (`{ 'de.f': 3 }`); 0 when left out. Pick one with
//           `node tools/narration.mjs --takes 4 --only <id>`.
//
// Every line is said once in a world (the world keeps what was told, game/narrator.js). The
// lines of a moment are said in the order of this table: the first one not told yet that fits,
// or, for a moment that tells `all`, every one of them that fits, one after the other.
//
// A recorded line never says a name: the names are the players' own and cannot be recorded
// ahead. Say people by their words ({sib, select, m {him} other {her}}), not by name. She never
// says cube: a place, the glass.

import { tr } from '../i18n/i18n.js';

// a performance tag in a line's text: a lowercase word or a few in brackets, `[very slowly]`
export const TAG = /\s*\[[a-z][a-z ]*\]\s*/g;
// a line's text without its tags: what is shown, and what the voice says
export const untagged = text => text.replace(TAG, ' ').trim();
// the tags a line's text carries, in order ('very slowly', 'sad' ...)
export const tagsOf = text => [...text.matchAll(TAG)].map(m => m[0].trim().slice(1, -1));
// a line said in the current language, in its form `form`, without its tags
export const lineText = (line, form) => untagged(tr(line.text, line.forms?.[form]));

// the sibling's two forms: the owner's gender (docs/story.md, "The people")
export const SIBLING = { m: { sib: 'm' }, f: { sib: 'f' } };

// The moments she speaks at, and how (game/narrator.js tells her of them):
//   pri    which goes first when several wait: the story (3), a boss (2), what happens (1), chatter (0)
//   ttl    s a line may wait for its turn before it is too late to say (none: it waits)
//   quiet  s nothing must have been said before (chatter waits for a pause)
//   calm   only while no enemy is after the hero
//   all    every line that fits, in order (a scene), not just the next one
export const MOMENTS = {
  opening: { pri: 3, all: true },             // a world's town, the first time: her first words
  town: { pri: 1, ttl: 6, quiet: 4 },         // close to one of the villagers ({ who }: world/town.js VILLAGERS)
  camp: { pri: 2, ttl: 25 },                  // in the merchant camp, the first time
  road: { pri: 2, ttl: 25 },                  // out on the road, where the enemies start
  wander: { pri: 0, ttl: 8, quiet: 35, calm: true },   // a place not seen before ({ act, depth })
  theme: { pri: 2, ttl: 20 },                 // a theme's first place ({ theme }: its id)
  depth: { pri: 3, all: true },               // a depth reached for the first time ({ depth })
  foe: { pri: 1, ttl: 6 },                    // a species after the hero for the first time ({ species })
  fight: { pri: 0, ttl: 4, quiet: 40 },       // in a fight, now and then
  kill: { pri: 1, ttl: 5 },                   // enemies defeated ({ many }: three or more at once)
  hurt: { pri: 1, ttl: 4, quiet: 20 },        // the hero's health low
  death: { pri: 2, ttl: 15 },                 // the hero died
  level: { pri: 1, ttl: 8 },                  // a level gained
  chest: { pri: 1, ttl: 8 },                  // a chest opened
  loot: { pri: 1, ttl: 8 },                   // a rare weapon or piece of armor picked up
  quest: { pri: 1, ttl: 10 },                 // a quest taken
  horde: { pri: 2, ttl: 5 },                  // a horde woke up
  fall: { pri: 1, ttl: 6 },                   // fell through a gap into the place below
  idle: { pri: 0, ttl: 3, quiet: 30, calm: true },     // standing about for a while
  home: { pri: 1, ttl: 10, quiet: 10 },       // back in town from out there
  guardian: { pri: 2, ttl: 15 },              // a side guardian ({ what: 'near' | 'beaten' })
  arena: { pri: 3, ttl: 30, all: true },      // a boss's arena entered, the boss still there ({ boss })
  boss: { pri: 2, ttl: 4 },                   // in a boss's fight ({ boss, what }: 'start', an attack's name, 'split' { stage })
  beaten: { pri: 3, all: true },              // a boss beaten ({ boss })
  trial: { pri: 2, ttl: 8 },                  // a trial room ({ what: 'sealed' | 'resolved' | 'failed' })
};

const brother = (m, f) => `{sib, select, m {${m}} other {${f}}}`;

export const LINES = [
  // --- the opening: the town, a new world -------------------------------------------------------
  {
    id: 'opening.looked-like', on: 'opening',
    text: "There you are! ...No. I'm sorry. For a moment you looked just like {sib, select, m {him} other {her}}.",
    note: 'The first line of a new world, as the grandchild steps into the town. Glad, then caught out: she mistook you for her little brother (sister), and is embarrassed.',
    instruct: 'Speak gladly at first, then caught out, a little embarrassed and apologetic.',
    forms: SIBLING,
  },
  {
    id: 'opening.my-town', on: 'opening',
    text: "This is my town. I keep it in glass, like everything I don't want to lose.",
    note: 'Right after the first line, still in the town. Proud and fond: the town is the one memory that never fades.',
    instruct: 'Speak proudly and fondly, warm and unhurried.',
  },
  {
    id: 'opening.hidden', on: 'opening',
    text: "Past the trees is what I've forgotten: the Hidden. Nobody can see into it.",
    note: 'The opening goes on: she explains the dark beyond the places one has seen. Matter-of-fact, a little rueful.',
    instruct: 'Speak matter-of-factly, a little rueful.',
  },
  {
    id: 'opening.hum', on: 'opening',
    text: 'Can you hear that hum? The Heart is beating again, deep down.',
    note: 'The opening goes on. Hushed, wondering: the Heart at the core of the world has started to beat again.',
    instruct: 'Speak in a hushed, wondering voice, softly.',
  },
  {
    id: 'opening.road', on: 'opening',
    text: "Something down there wants to be remembered. Follow the road, and I'll follow you.",
    note: 'The last line of the opening: off you go. Warm, encouraging, a little mysterious.',
    instruct: 'Speak warmly and encouragingly, with a hint of mystery.',
    seed: { de: 1 },
  },

  // --- the town and the camp --------------------------------------------------------------------
  {
    id: 'town.inn', on: 'town', when: { who: 'innkeeper' },
    text: 'The inn. There was always soup on, whatever the hour.',
    note: 'Walking past the innkeeper in the town. Cosy, fond.',
    instruct: 'Speak cosily and fondly, relaxed and warm.',
  },
  {
    id: 'town.smith', on: 'town', when: { who: 'smith' },
    text: 'The Smith let us work his bellows once. Only once.',
    note: 'Walking past the Smith at his anvil. A childhood mischief; she still finds it funny.',
    instruct: 'Speak with amused mischief, as if still finding it funny.',
  },
  {
    id: 'town.rabbits', on: 'town', when: { who: 'keeper' },
    text: "The rabbits! We named every single one. Then we couldn't tell them apart.",
    note: 'Walking past the pet keeper and the rabbit pen. Delighted, laughing at herself.',
    instruct: 'Speak with delight, laughing a little at yourself.',
  },
  {
    id: 'town.horses', on: 'town', when: { who: 'groom' },
    text: `${brother('My little brother', 'My little sister')} always wanted to ride the big grey horse. I held the reins and prayed.`,
    note: 'Walking past the groom and the horses. The little one was fearless, she was the worried big sister.',
    instruct: 'Speak fondly, with an old worry still in your voice.',
    forms: SIBLING,
  },
  {
    id: 'camp.first', on: 'camp',
    text: 'The traders came every summer. And we never had a single coin.',
    note: 'The first time in the merchant camp, just out of town. Wistful and amused.',
    instruct: 'Speak wistfully, fond and a little amused.',
  },
  {
    id: 'camp.potions', on: 'town', when: { who: 'alchemist' },
    text: 'Never go out there without a potion or two. Trust me.',
    note: 'Walking past the Alchemist\'s potion tent in the camp. A grandmother\'s practical advice, firm.',
    instruct: 'Speak firmly, like a grandmother giving practical advice.',
  },
  {
    id: 'camp.enchanter', on: 'town', when: { who: 'enchanter' },
    text: 'The Enchanter. She makes a plain blade sing, for a price.',
    note: 'Walking past the Enchanter in the camp. Impressed, a little conspiratorial about the price.',
    instruct: 'Speak impressed, a little conspiratorial, lowering your voice at the end.',
  },

  // --- the road out of town (depth 0) -----------------------------------------------------------
  {
    id: 'road.wild', on: 'road',
    text: 'Out here it gets wild. Keep your weapon handy: the grass bites.',
    note: 'The first place on the road where enemies are about. A warning, but cheerful.',
    instruct: 'Speak cheerfully, as a friendly warning.',
  },
  {
    id: 'wander.road.summer', on: 'wander', when: { act: 0 },
    text: 'We ran through these meadows every summer. The grass came up to my chin.',
    note: 'Wandering the road out of town, the meadows. Happy childhood memory.',
    instruct: 'Speak happily, fond of the memory.',
  },
  {
    id: 'wander.road.small', on: 'wander', when: { act: 0 },
    text: `${brother('My brother', 'My sister')} was so small then. ${brother('He', 'She')} held my hand on every bridge.`,
    note: 'Wandering the road, over the bridges between the islands. Tender; the first time the little one comes up.',
    instruct: 'Speak tenderly and softly.',
    forms: SIBLING,
  },
  {
    id: 'wander.road.floating', on: 'wander', when: { act: 0 },
    text: 'Look at it all, floating as if it were nothing. Children never ask how.',
    note: 'Wandering the road among the floating islands. Amused wonder.',
    instruct: 'Speak with amused wonder.',
  },
  {
    id: 'wander.road.edge', on: 'wander', when: { act: 0 },
    text: "Don't go too near the edge. I'd hate to remember you falling.",
    note: 'Wandering the road near the islands\' edges. A grandmother\'s worry, half joking.',
    instruct: 'Speak with a grandmotherly worry, half joking.',
  },
  {
    id: 'wander.road.hay', on: 'wander', when: { act: 0 },
    text: 'I can still smell the hay. Funny, what stays.',
    note: 'Wandering the road. Quiet, a little surprised at her own memory.',
    instruct: 'Speak quietly, a little surprised at your own memory.',
  },
  {
    id: 'wander.road.clear', on: 'wander', when: { act: 0 },
    text: 'Look how clear the glass is here. I must have been happy.',
    note: 'Wandering the road. Gentle, a little sad: happiness she can only see from afar now.',
    instruct: 'Speak gently, a little sad.',
  },

  // --- the first enemies, and fighting -----------------------------------------------------------
  {
    id: 'foe.snake', on: 'foe', when: { species: 'snake' },
    text: 'Grass snakes. Mother said they were more afraid of us. They were not.',
    note: 'The first snake comes after the hero (the road out of town). Dry humour.',
    instruct: 'Speak with dry humour.',
  },
  {
    id: 'foe.spider', on: 'foe', when: { species: 'spider' },
    text: "Spiders. I'm not saying I screamed. I'm saying somebody did.",
    note: 'The first spider comes after the hero. Comic, embarrassed.',
    instruct: 'Speak comically, a little embarrassed.',
  },
  {
    id: 'foe.stunder', on: 'foe', when: { species: 'stunder' },
    text: 'That big one charges! Step aside, and let it run into something.',
    note: 'The first Stunder (a heavy beast that rams and knocks you over). Quick fight advice.',
    instruct: 'Speak quickly and urgently, giving advice.',
  },
  {
    id: 'foe.wolk', on: 'foe', when: { species: 'wolk' },
    text: 'A little thundercloud. Watch the ground: it crackles before it strikes.',
    note: 'The first Wolk (a small cloud that calls lightning down on a ring on the floor). Advice, curious.',
    instruct: 'Speak curiously, giving advice.',
  },
  {
    id: 'foe.tornado', on: 'foe', when: { species: 'tornado' },
    text: "A whirlwind! Don't let it catch you. It doesn't put you down gently.",
    note: 'The first Tornado (it throws you about). Advice, wry.',
    instruct: 'Speak quickly, a little wry.',
  },
  {
    id: 'foe.squirtle', on: 'foe', when: { species: 'squirtle' },
    text: "Squirtles! They spit. It's rude, and it stings.",
    note: 'The first Squirtle (a water creature that spits). Indignant, comic.',
    instruct: 'Speak indignantly, in a comic way.',
  },
  {
    id: 'foe.flimmer', on: 'foe', when: { species: 'flimmer' },
    text: 'Flimmers always come in threes. Just like my aunties.',
    note: 'The first troop of Flimmers (they come three at a time). A joke about her family.',
    instruct: 'Speak with a playful, joking tone.',
  },
  {
    id: 'foe.lantern', on: 'foe', when: { species: 'fireface' },
    text: "A lantern with a face. It burns, so don't get cosy.",
    note: 'The first Lantern-face (in the Dark forest: a glowing face that scorches). Wary, wry.',
    instruct: 'Speak warily, a little wry.',
    seed: { de: 2 },
  },
  {
    id: 'kill.first', on: 'kill',
    text: 'There! You fight just like your grandfather. He broke a lot of vases.',
    note: 'The first enemy the hero defeats in this world. Proud, then a fond joke about her late husband.',
    instruct: 'Speak proudly, then fondly joking.',
  },
  {
    id: 'kill.many', on: 'kill', when: { many: true },
    text: "Look at you! I'd tell you to be careful, but you wouldn't listen.",
    note: 'Several enemies defeated at once. Impressed, teasing.',
    instruct: 'Speak impressed and teasing.',
  },
  {
    id: 'fight.watch', on: 'fight',
    text: 'Watch them before they strike. Everything gives itself away.',
    note: 'In a fight. Calm advice: every enemy shows what it is about to do.',
    instruct: 'Speak calmly, giving advice.',
  },
  {
    id: 'fight.move', on: 'fight',
    text: 'Keep moving! Standing still is how they get you.',
    note: 'In a fight. Urgent advice.',
    instruct: 'Speak urgently and quickly.',
  },
  {
    id: 'fight.elbows', on: 'fight',
    text: `You fight like ${brother('my little brother', 'my little sister')}. All elbows, and no fear at all.`,
    note: 'In a fight. Fond: the grandchild reminds her of the little one again.',
    instruct: 'Speak fondly, smiling.',
    forms: SIBLING,
  },
  {
    id: 'fight.back', on: 'fight',
    text: 'Too many of them? Step back, and let them come to you one by one.',
    note: 'In a fight with several enemies. Advice.',
    instruct: 'Speak calmly but quickly, giving advice.',
  },
  {
    id: 'fight.potions', on: 'fight',
    text: "Don't save your potions for later. Later is now.",
    note: 'In a fight. Practical, a little stern.',
    instruct: 'Speak practically, a little stern.',
  },
  {
    id: 'hurt.pale', on: 'hurt',
    text: "Careful! You've gone all pale. Drink something.",
    note: 'The hero\'s health is low. Worried, motherly: drink a potion.',
    instruct: 'Speak worried and motherly, a little hurried.',
  },
  {
    id: 'hurt.back', on: 'hurt',
    text: "Back off a little. Nobody's counting.",
    note: 'The hero\'s health is low again. Calm advice: retreating is fine.',
    instruct: 'Speak calmly and reassuringly.',
  },
  {
    id: 'hurt.felt', on: 'hurt',
    text: 'Ouch. I felt that one too.',
    note: 'The hero\'s health is low once more. Wincing, sympathetic.',
    instruct: 'Speak wincing, sympathetic.',
  },
  {
    id: 'death.not-how', on: 'death',
    text: "No, no. That's not how it went. Let me start again.",
    note: 'The hero died, the first time. She corrects her own memory: you go back to where she is sure of it.',
    instruct: 'Speak gently, correcting yourself, calm and sure.',
  },
  {
    id: 'death.wrong', on: 'death',
    text: "Wait, that's wrong. That didn't happen.",
    note: 'The hero died again. Firm, a little flustered.',
    instruct: 'Speak firmly, a little flustered.',
  },
  {
    id: 'death.again', on: 'death',
    text: 'No... I remember it differently. Once more.',
    note: 'The hero died again. Thoughtful, determined.',
    instruct: 'Speak thoughtfully, then determined.',
  },
  {
    id: 'death.stubborn', on: 'death',
    text: 'You were always stubborn. Good. Up you get.',
    note: 'The hero died again. Encouraging, proud.',
    instruct: 'Speak encouragingly and proudly.',
  },
  {
    id: 'level.first', on: 'level',
    text: "You're getting stronger. Or I'm imagining you stronger. Either is fine.",
    note: 'The hero gains a level, the first time in this world. Proud, playful about her memory.',
    instruct: 'Speak proudly, playful at the end.',
    seed: { de: 1 },
  },
  {
    id: 'level.again', on: 'level',
    text: 'Stronger again. Your grandfather would never stop talking about it.',
    note: 'Another level gained. Proud, fond of her late husband.',
    instruct: 'Speak proudly and fondly.',
  },
  {
    id: 'chest.first', on: 'chest',
    text: 'A chest! We hid treasures everywhere. Mostly buttons.',
    note: 'The first chest opened. Delighted, then funny.',
    instruct: 'Speak with delight, then amused.',
  },
  {
    id: 'chest.again', on: 'chest',
    text: "Another chest. I don't remember filling that one. How exciting.",
    note: 'Another chest opened. Curious, amused.',
    instruct: 'Speak curious and amused.',
  },
  {
    id: 'loot.first', on: 'loot',
    text: "Oh, that's a good one. Don't trade it for sweets.",
    note: 'A rare weapon or piece of armor picked up, the first time. Impressed, teasing.',
    instruct: 'Speak impressed and teasing.',
  },
  {
    id: 'quest.first', on: 'quest',
    text: 'Help them, will you? They were always good to us.',
    note: 'The first quest taken from a villager. Warm, grateful to the people of her town.',
    instruct: 'Speak warmly and gratefully.',
  },
  {
    id: 'horde.first', on: 'horde',
    text: "That's a lot of them! Find a narrow spot, so they come one at a time.",
    note: 'A horde woke up, the first time. Alarmed, then quick advice.',
    instruct: 'Speak alarmed, then quickly giving advice.',
  },
  {
    id: 'horde.again', on: 'horde',
    text: 'Another crowd. Running away is allowed, you know.',
    note: 'Another horde woke up. Dry.',
    instruct: 'Speak dryly.',
  },
  {
    id: 'fall.first', on: 'fall',
    text: 'Whoops! A gap in my memory. Mind those.',
    note: 'The hero fell through a hole into the place below. Startled, then apologetic: her memory has holes.',
    instruct: 'Speak startled, then apologetic.',
  },
  {
    id: 'fall.again', on: 'fall',
    text: 'Down you go again. I really must mend those holes.',
    note: 'The hero fell through a hole again. Self-deprecating.',
    instruct: 'Speak self-deprecating, amused at yourself.',
  },
  {
    id: 'idle.time', on: 'idle',
    text: "Take your time. I'm not going anywhere. Not yet.",
    note: 'The hero has stood still for a while. Patient, with a quiet sad edge at the end.',
    instruct: 'Speak patiently and kindly, a little sad at the end.',
    seed: { de: 1 },
  },
  {
    id: 'idle.forget', on: 'idle',
    text: 'I do that too. Stand somewhere, and forget why.',
    note: 'The hero stands still for a while again. Gently funny about her own forgetting.',
    instruct: 'Speak gently, amused at your own forgetting.',
  },
  {
    id: 'home.first', on: 'home',
    text: 'Home. The one place I never forget.',
    note: 'Back in the town from out there, the first time. Relieved, warm.',
    instruct: 'Speak relieved and warm.',
  },
  {
    id: 'home.soup', on: 'home',
    text: "Back so soon? Good. Rest a little, the soup's on.",
    note: 'Back in the town again. Cosy.',
    instruct: 'Speak cosily and warmly.',
  },
  {
    id: 'guardian.near', on: 'guardian', when: { what: 'near' },
    text: "Something guards that gate. I think I put it there, so I wouldn't have to go on.",
    note: 'A side guardian\'s arena, the first time: a bad memory she put in the way. Thoughtful.',
    instruct: 'Speak thoughtfully, a little uneasy.',
  },
  {
    id: 'guardian.beaten', on: 'guardian', when: { what: 'beaten' },
    text: 'There. The gate is open. One fear fewer.',
    note: 'A side guardian beaten, its gate open. Relieved.',
    instruct: 'Speak relieved.',
  },
  {
    id: 'guardian.again', on: 'guardian', when: { what: 'near' },
    text: 'Another guard. I was a very careful child.',
    note: 'Another side guardian\'s arena. Wry.',
    instruct: 'Speak wryly.',
  },
  {
    id: 'trial.sealed', on: 'trial', when: { what: 'sealed' },
    text: "Oh, this memory holds on to you. You'll have to live through it.",
    note: 'A trial room seals itself around the hero (a flood, a collapse ...). Tense.',
    instruct: 'Speak tense and serious.',
  },
  {
    id: 'trial.resolved', on: 'trial', when: { what: 'resolved' },
    text: 'There. That memory let go of you.',
    note: 'A trial room mastered, the way on open. Relieved.',
    instruct: 'Speak relieved and calm.',
  },
  {
    id: 'trial.failed', on: 'trial', when: { what: 'failed' },
    text: 'Never mind. Memories can be stubborn. Try again.',
    note: 'A trial room failed. Encouraging.',
    instruct: 'Speak encouragingly.',
  },

  // --- Gusto, at the first well (depth 0) --------------------------------------------------------
  {
    id: 'arena.gusto.place', on: 'arena', when: { boss: 'gusto' },
    text: 'Oh. I know this place. This is where he waited.',
    note: 'Entering Gusto\'s arena at the first well, before the fight. A child\'s fear coming back; quiet.',
    instruct: 'Speak quietly, an old fear coming back.',
    seed: { de: 1 },
  },
  {
    id: 'arena.gusto.bed', on: 'arena', when: { boss: 'gusto' },
    text: 'Under the bed, in the dark. A grin, and nothing else.',
    note: 'Right after: what Gusto was, the grin in the dark under her bed. Spooky, hushed, like telling a ghost story.',
    instruct: 'Speak in a hushed, spooky voice, like telling a ghost story.',
  },
  {
    id: 'boss.gusto.start', on: 'boss', when: { boss: 'gusto', what: 'start' },
    text: "Gusto! I drew him, so he'd be less scary. It didn't work.",
    note: 'Gusto\'s fight starts. She drew her nightmares as a child; comic, a little scared still.',
    instruct: 'Speak comically, still a little scared.',
  },
  {
    id: 'boss.gusto.grab', on: 'boss', when: { boss: 'gusto', what: 'grab' },
    text: 'When his arms go wide, step back! He grabs.',
    note: 'Gusto winds up his grab (arms flung wide). Urgent fight advice.',
    instruct: 'Speak urgently, quick warning.',
  },
  {
    id: 'boss.gusto.stuck', on: 'boss', when: { boss: 'gusto', what: 'stuck' },
    text: 'He missed, and fell flat on his face! Hit him now!',
    note: 'Gusto\'s grab caught nothing and he crashed down, helpless for a moment. Gleeful, urgent.',
    instruct: 'Speak gleeful and urgent.',
  },
  {
    id: 'boss.gusto.summon', on: 'boss', when: { boss: 'gusto', what: 'summon' },
    text: "Little triangles! Don't let them crowd you.",
    note: 'Gusto spits out Custo triangles. Advice.',
    instruct: 'Speak quickly, giving advice.',
  },
  {
    id: 'boss.gusto.inhale', on: 'boss', when: { boss: 'gusto', what: 'inhale' },
    text: "He's breathing you in! Step sideways, not back.",
    note: 'Gusto sucks the hero towards his mouth: stepping sideways gets out of it. Urgent advice.',
    instruct: 'Speak urgently, quick advice.',
  },
  {
    id: 'boss.gusto.split', on: 'boss', when: { boss: 'gusto', what: 'split' },
    text: 'Three of him! Only one is real. The others pop if you so much as touch them.',
    note: 'Gusto splits into three at half his health; two are fakes that burst at any hit. Alarmed, then advice.',
    instruct: 'Speak alarmed, then quickly giving advice.',
  },
  {
    id: 'boss.gusto.vortex', on: 'boss', when: { boss: 'gusto', what: 'vortex' },
    text: "He's blowing a gale! Get out of the way.",
    note: 'Gusto blows a vortex out of his hands (second phase). Urgent.',
    instruct: 'Speak urgently.',
  },
  {
    id: 'boss.gusto.after', on: 'beaten', when: { boss: 'gusto' },
    text: 'I was so sure he was real. I suppose he was.',
    note: 'After Gusto, the grin under the bed, is beaten. A child\'s fear, remembered fondly; a little sad at the end.',
    instruct: 'Speak fondly, a little sad at the end.',
  },
  {
    id: 'beaten.gusto.well', on: 'beaten', when: { boss: 'gusto' },
    text: "The well is open now. Jump in. I'll be right here.",
    note: 'Right after: the way down is open. Encouraging, reassuring.',
    instruct: 'Speak encouragingly and reassuringly.',
  },

  // --- depth 1: summer -----------------------------------------------------------------------------
  {
    id: 'depth.1.summer', on: 'depth', when: { depth: 1 },
    text: 'Down the well, and into summer. This is when I was small.',
    note: 'The first time at depth 1, the start of the first act (her childhood). Bright, nostalgic.',
    instruct: 'Speak brightly, nostalgic.',
  },
  {
    id: 'depth.1.tiny', on: 'depth', when: { depth: 1 },
    text: `Everything was bigger then. Except ${brother('my little brother', 'my little sister')}, who was tiny.`,
    note: 'Right after. Fond, smiling.',
    instruct: 'Speak fondly, smiling.',
    forms: SIBLING,
  },
  {
    id: 'wander.act1.bird', on: 'wander', when: { act: 1 },
    text: `That summer I made a bird of glass, my very first. It came out crooked, and ${brother('my little brother', 'my little sister')} loved it anyway.`,
    note: 'Wandering act I. The glass bird, the first thing she ever made, a present for the little one. Tender; this bird matters later.',
    instruct: 'Speak tenderly and softly.',
    forms: SIBLING,
  },
  {
    id: 'wander.act1.dinner', on: 'wander', when: { act: 1 },
    text: 'Mother called us in for dinner. We pretended not to hear.',
    note: 'Wandering act I. Mischievous.',
    instruct: 'Speak mischievously.',
  },
  {
    id: 'wander.act1.stones', on: 'wander', when: { act: 1 },
    text: `We collected flat stones, for skipping. ${brother('My brother', 'My sister')} kept the best ones in a sock.`,
    note: 'Wandering act I. Fond, amused.',
    instruct: 'Speak fondly, amused.',
    forms: SIBLING,
  },
  {
    id: 'wander.act1.we', on: 'wander', when: { act: 1 },
    text: "We always came this way, we... Never mind. It doesn't matter.",
    note: 'Wandering act I. She starts to speak of the two of them and stops herself: the first hint of the loss. Breaks off, then brushes it aside.',
    instruct: 'Speak softly, breaking off, then brushing it aside.',
    seed: { de: 1 },
  },
  {
    id: 'wander.act1.hazy', on: 'wander', when: { act: 1 },
    text: 'This part is hazy. Give me a moment... There.',
    note: 'Wandering act I. Her memory falters, then comes back. Concentrating, then relieved.',
    instruct: 'Speak concentrating, then relieved.',
    seed: { de: 1 },
  },
  {
    id: 'wander.act1.days', on: 'wander', when: { act: 1 },
    text: "The days were longer then. I'm quite sure of it.",
    note: 'Wandering act I. Wistful, a little funny.',
    instruct: 'Speak wistfully, a little funny.',
  },
  {
    id: 'wander.act1.word', on: 'wander', when: { act: 1 },
    text: "We had a secret word, for when we were scared. I've forgotten it. Isn't that silly?",
    note: 'Wandering act I. Light at first, sad underneath: she has lost something she shared with the little one.',
    instruct: 'Speak lightly at first, sad underneath.',
  },
  {
    id: 'wander.act1.grandpa', on: 'wander', when: { act: 1 },
    text: 'Your grandfather would have liked this. He liked anything that floated.',
    note: 'Wandering act I. Fond of her late husband.',
    instruct: 'Speak fondly and warmly.',
  },

  // --- the themes of act I: the first place of each -------------------------------------------------
  {
    id: 'theme.meadow', on: 'theme', when: { theme: 'meadow' },
    text: 'Still the meadows. We had picnics here, and the ants always won.',
    note: 'The first place of the Meadow islands below the town. Happy, comic.',
    instruct: 'Speak happily, amused.',
  },
  {
    id: 'theme.clouds', on: 'theme', when: { theme: 'clouds' },
    text: 'We lay in the grass and named the clouds. And then one day, we walked on them.',
    note: 'The first place of the Cloud kingdom. Dreamy wonder.',
    instruct: 'Speak dreamily, with wonder.',
  },
  {
    id: 'theme.lagoon', on: 'theme', when: { theme: 'lagoon' },
    text: `The lagoon. ${brother('My little brother', 'My little sister')} couldn't swim yet, so I carried ${brother('him', 'her')} on my back.`,
    note: 'The first place of the Lagoon isles. Tender, proud of being the big sister.',
    instruct: 'Speak tenderly, a little proud.',
    forms: SIBLING,
    seed: { 'de.f': 1 },
  },
  {
    id: 'theme.karst', on: 'theme', when: { theme: 'karst' },
    text: 'The terraces. Water on steps, all the way down. We raced paper boats here.',
    note: 'The first place of the Karst terraces. Playful.',
    instruct: 'Speak playfully.',
  },
  {
    id: 'theme.forest', on: 'theme', when: { theme: 'darkforest' },
    text: `The dark forest. I held ${brother("my little brother's", "my little sister's")} hand all the way, and said I wasn't scared.`,
    note: 'The first place of the Dark forest (always night). Hushed; she was scared, and brave for the little one.',
    instruct: 'Speak in a hushed voice, brave but a little scared.',
    forms: SIBLING,
  },
  {
    id: 'theme.peaks', on: 'theme', when: { theme: 'peaks' },
    text: 'Snow! Our very first. Our snowman lasted longer than our mittens.',
    note: 'The first place of the Snowy peaks. Excited, funny.',
    instruct: 'Speak excitedly, amused.',
  },
  {
    id: 'theme.highlands', on: 'theme', when: { theme: 'highlands' },
    text: 'The prayer flags. Grandmother tied a wish to every one. I wonder which came true.',
    note: 'The first place of the Prayer highlands. Thoughtful.',
    instruct: 'Speak thoughtfully.',
  },
  {
    id: 'theme.saltflats', on: 'theme', when: { theme: 'saltflats' },
    text: 'The salt flats. Father brought us here once. White, all the way to the sky.',
    note: 'The first place of the Salt flats: a trip with her father. Awed, quiet.',
    instruct: 'Speak quietly, in awe.',
  },
  {
    id: 'theme.badlands', on: 'theme', when: { theme: 'badlands' },
    text: "The badlands. Red rock and dust. We were explorers, and we'd lost our map.",
    note: 'The first place of the Badlands. Adventurous, playful.',
    instruct: 'Speak adventurously and playfully.',
  },
  {
    id: 'theme.canyon', on: 'theme', when: { theme: 'canyon' },
    text: 'The canyon. Shout, and it shouts back. Ours always came back giggling.',
    note: 'The first place of the Deep canyon. Fond, laughing.',
    instruct: 'Speak fondly, laughing a little.',
  },

  // --- Totnar, at the second well (depth 1) ------------------------------------------------------------
  {
    id: 'arena.totnar', on: 'arena', when: { boss: 'totnar' },
    text: 'That summer was so dry, the grass crackled. And then something caught fire.',
    note: 'Entering Totnar\'s arena, before the fight. Telling it like a story, ominous at the end.',
    instruct: 'Speak like telling a story, ominous at the end.',
  },
  {
    id: 'boss.totnar.start', on: 'boss', when: { boss: 'totnar', what: 'start' },
    text: 'Totnar. A heart smouldering in dead sticks. I was so angry that summer.',
    note: 'Totnar\'s fight starts: the anger that kept smouldering. Honest, a little ashamed.',
    instruct: 'Speak honestly, a little ashamed.',
  },
  {
    id: 'boss.totnar.gloom', on: 'boss', when: { boss: 'totnar', what: 'gloom' },
    text: "He's put the sun out! Stay near the fires, and watch for his skulls.",
    note: 'Totnar makes it dark. Urgent advice.',
    instruct: 'Speak urgently, giving advice.',
  },
  {
    id: 'boss.totnar.throw', on: 'boss', when: { boss: 'totnar', what: 'throw' },
    text: 'Skulls! They come alive where they land. Keep moving.',
    note: 'Totnar throws a skull; it becomes a snapping skull where it lands. Advice.',
    instruct: 'Speak quickly, giving advice.',
  },
  {
    id: 'boss.totnar.roll', on: 'boss', when: { boss: 'totnar', what: 'split', stage: 2 },
    text: "A skull's off! Now he rolls. Dodge him, then hit him while he's dizzy.",
    note: 'Totnar loses his first skull and starts rolling at the hero; after a roll he sits dizzy. Excited, advice.',
    instruct: 'Speak excitedly, giving advice.',
  },
  {
    id: 'boss.totnar.spiders', on: 'boss', when: { boss: 'totnar', what: 'spiders' },
    text: 'Twig spiders, pouring out of him! Thin them out.',
    note: 'Totnar tears himself open and twig spiders pour out. Disgusted, advice.',
    instruct: 'Speak disgusted, then quickly giving advice.',
  },
  {
    id: 'boss.totnar.storm', on: 'boss', when: { boss: 'totnar', what: 'split', stage: 3 },
    text: 'The last skull. Watch the rings on the ground, and step out before the lightning.',
    note: 'Totnar loses his second skull; now he calls lightning down on rings round the hero. Tense advice.',
    instruct: 'Speak tense, giving advice.',
  },
  {
    id: 'beaten.totnar.out', on: 'beaten', when: { boss: 'totnar' },
    text: 'It burned out in the end. Anger does, if you let it.',
    note: 'After Totnar is beaten. Calm, wise.',
    instruct: 'Speak calmly and wisely.',
  },
  {
    id: 'beaten.totnar.sorry', on: 'beaten', when: { boss: 'totnar' },
    text: 'I said sorry to Mother afterwards. That one, I did say.',
    note: 'Right after. Quiet; the stress on "that one": there is another sorry she never said (to the little one).',
    instruct: 'Speak quietly, with something left unsaid.',
  },

  // --- depth 2: further than allowed ----------------------------------------------------------------
  {
    id: 'depth.2.deeper', on: 'depth', when: { depth: 2 },
    text: "Deeper. We weren't allowed this far. So of course we came.",
    note: 'The first time at depth 2. Mischievous.',
    instruct: 'Speak mischievously.',
    seed: { de: 1 },
  },
  {
    id: 'depth.2.promise', on: 'depth', when: { depth: 2 },
    text: `I promised to look after ${brother('my little brother', 'my little sister')}. I meant it, every single time.`,
    note: 'Right after. Earnest, with a sad edge she does not explain.',
    instruct: 'Speak earnestly, with a sad edge.',
    forms: SIBLING,
  },

  // --- Squarlo, at the third well (depth 2) ------------------------------------------------------------
  {
    id: 'arena.squarlo', on: 'arena', when: { boss: 'squarlo' },
    text: 'Look how small he is. Surely nothing to worry about.',
    note: 'Entering Squarlo\'s arena: he is tiny, a little worry. Light, a touch too light: she is fooling herself.',
    instruct: 'Speak lightly, a touch too lightly.',
  },
  {
    id: 'boss.squarlo.start', on: 'boss', when: { boss: 'squarlo', what: 'start' },
    text: "Squarlo. Just a little worry, that's all. Don't let him make waves.",
    note: 'Squarlo\'s fight starts. Brisk.',
    instruct: 'Speak briskly.',
  },
  {
    id: 'boss.squarlo.tide', on: 'boss', when: { boss: 'squarlo', what: 'tide' },
    text: "The water's rising! Up a hill, quick!",
    note: 'Squarlo calls the tide: the arena floods, the hilltops stay dry. Urgent.',
    instruct: 'Speak urgently and quickly.',
  },
  {
    id: 'boss.squarlo.rest', on: 'boss', when: { boss: 'squarlo', what: 'rest' },
    text: "He's out of breath. Now's your chance!",
    note: 'Squarlo sits down to catch his breath: he takes more damage. Urgent, gleeful.',
    instruct: 'Speak urgent and gleeful.',
    seed: { de: 3 },
  },
  {
    id: 'boss.squarlo.blow', on: 'boss', when: { boss: 'squarlo', what: 'blow' },
    text: 'Water from his hands! Step out of the way before it comes.',
    note: 'Squarlo gathers a jet of water in his hands. Advice.',
    instruct: 'Speak quickly, giving advice.',
  },
  {
    id: 'boss.squarlo.summon', on: 'boss', when: { boss: 'squarlo', what: 'summon' },
    text: 'More squirtles. Worries bring their friends.',
    note: 'Squarlo calls squirtles out of the floor. Wry.',
    instruct: 'Speak wryly.',
  },
  {
    id: 'boss.squarlo.grow', on: 'boss', when: { boss: 'squarlo', what: 'split' },
    text: 'And there it is. The little worry, all grown up.',
    note: 'Squarlo grows into a giant at half his health. Resigned, darkly funny.',
    instruct: 'Speak resigned, darkly amused.',
  },
  {
    id: 'boss.squarlo.stomp', on: 'boss', when: { boss: 'squarlo', what: 'stomp' },
    text: "Watch the shadow of his foot! Don't be under it when it comes down.",
    note: 'Giant Squarlo lifts his foot to stomp; its shadow shows where it lands. Urgent advice.',
    instruct: 'Speak urgently, giving advice.',
  },
  {
    id: 'boss.squarlo.jump', on: 'boss', when: { boss: 'squarlo', what: 'jump' },
    text: "He's jumping! Keep away from his shadow.",
    note: 'Giant Squarlo jumps at the hero; his shadow shows where he lands. Urgent.',
    instruct: 'Speak urgently.',
  },
  {
    id: 'boss.squarlo.after', on: 'beaten', when: { boss: 'squarlo' },
    text: "It was such a little thing. Then it wasn't.",
    note: 'After Squarlo, the little worry that grew, is beaten. Wry, then quiet.',
    instruct: 'Speak wryly, then quietly.',
  },
  {
    id: 'beaten.squarlo.look', on: 'beaten', when: { boss: 'squarlo' },
    text: 'Worries shrink when you look at them. It took me years to learn that.',
    note: 'Right after. Gentle wisdom, passed on.',
    instruct: 'Speak gently and wisely.',
  },

  // --- depth 3: as far as she has remembered so far ---------------------------------------------------
  {
    id: 'depth.3.cloudy', on: 'depth', when: { depth: 3 },
    text: 'Further down, the glass gets cloudy. Let me think.',
    note: 'The first time at depth 3. Concentrating; her memory gets harder from here.',
    instruct: 'Speak slowly, concentrating.',
  },
  {
    id: 'depth.3.later', on: 'depth', when: { depth: 3 },
    text: "The rest will come back to me as we go. It always does. Eventually.",
    note: 'Right after. Reassuring, with a little self-mockery.',
    instruct: 'Speak reassuringly, a little self-mocking.',
  },
];

// the line with this id (undefined: none)
const BY_ID = new Map(LINES.map(l => [l.id, l]));
export const lineById = id => BY_ID.get(id);

// does a moment's data fit a line's `when`?
export function fits(when, data = {}) {
  if (!when) return true;
  for (const [k, want] of Object.entries(when)) {
    const v = data[k];
    if (Array.isArray(want)) {
      const range = want.length === 2 && want.every(x => typeof x === 'number') && typeof v === 'number';
      if (range ? v < want[0] || v > want[1] : !want.includes(v)) return false;
    } else if (v !== want) return false;
  }
  return true;
}

// What she says at moment `on` about `data`: the lines not told yet (`told`: a Set of ids, also
// those waiting their turn) that fit, in the table's order: all of them for a moment that tells
// `all`, else the first. [] if she has nothing (more) to say.
export function linesFor(on, data = {}, told = new Set(), lines = LINES) {
  const fit = lines.filter(l => l.on === on && !told.has(l.id) && fits(l.when, data));
  return MOMENTS[on]?.all ? fit : fit.slice(0, 1);
}

// a line's clip (core/narration.js forms): its id, or `<id>.<form>`
export const clipKey = (line, form) => line.forms && form ? `${line.id}.${form}` : line.id;
// the form of a line that has forms, for the sibling `sib` ('m' or 'f')
export const formOf = (line, sib) => !line.forms ? null : Object.keys(line.forms).find(f => line.forms[f].sib === sib) ?? Object.keys(line.forms)[0];
