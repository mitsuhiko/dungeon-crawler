// The rooms of the kids' guide, in the order we suggest walking through them. Like the game,
// the guide goes down one depth per room: each room borrows the look of a game depth (theme).
// index.html draws the map from this list; deck.js uses it for the "next room" portal.
// `de` holds the German texts (the pages themselves carry both languages, see deck.js). Icons
// are relative to this file (see iconUrl).
export const DECKS = [
  { file: 'start.html', theme: 'meadow', depth: 0, icon: '../assets/items/item_town_portal.png',
    title: 'Welcome to Town', teaser: 'What The Glass Bird is, what it is made of, and how this guide works.',
    de: { title: 'Willkommen in der Stadt', teaser: 'Was der Glasvogel ist, woraus es besteht und wie dieser Rundgang funktioniert.' } },
  { file: 'architecture.html', theme: 'meadow', depth: 1, icon: '../assets/items/weapon_staff_arcane.png',
    title: 'How It Fits Together', teaser: 'The parts of the game, what each one does, and how they work together.',
    de: { title: 'Wie alles zusammenpasst', teaser: 'Die Teile des Spiels, was jeder macht und wie sie zusammenarbeiten.' } },
  { file: 'code.html', theme: 'meadow', depth: 2, icon: '../assets/items/item_stick_long.png',
    title: 'Reading Code', teaser: 'Names, objects, lists, little machines and decisions: how to read the game\'s real code.',
    de: { title: 'Code lesen', teaser: 'Namen, Objekte, Listen, kleine Maschinen und Entscheidungen: wie man den echten Code des Spiels liest.' } },
  { file: 'loop.html', theme: 'peaks', depth: 3, icon: '../assets/items/item_potion_health.png',
    title: 'The Heartbeat', teaser: 'The game redraws itself 60 times a second. What happens in one tick?',
    de: { title: 'Der Herzschlag', teaser: 'Das Spiel malt sich 60-mal pro Sekunde neu. Was passiert in einem Takt?' } },
  { file: 'space.html', theme: 'badlands', depth: 4, icon: '../assets/items/weapon_arrow.png',
    title: 'Where Things Are', teaser: 'Coordinates, arrows, distances and angles: the maths that tells the game where everything is.',
    de: { title: 'Wo die Dinge sind', teaser: 'Koordinaten, Pfeile, Entfernungen und Winkel: die Mathe, die dem Spiel sagt, wo alles ist.' } },
  { file: 'random.html', theme: 'canyon', depth: 5, icon: '../assets/items/item_crystal_diamond.png',
    title: 'Magic Numbers', teaser: 'Random that is not really random: seeds, dice and bags of marbles.',
    de: { title: 'Zauberzahlen', teaser: 'Zufall, der nicht wirklich zufällig ist: Seeds, Würfel und Murmelbeutel.' } },
  { file: 'memory.html', theme: 'canyon', depth: 6, icon: '../assets/items/item_coin_silver.png',
    title: 'What the Game Remembers', teaser: 'A whole world from one seed, and a notebook of what you changed. Plus: how your bag works.',
    de: { title: 'Was sich das Spiel merkt', teaser: 'Eine ganze Welt aus einem Seed und ein Notizbuch für das, was du verändert hast. Dazu: wie deine Tasche funktioniert.' } },
  { file: 'world.html', theme: 'roots', depth: 7, icon: '../assets/items/item_crystal_amethyst.png',
    title: 'Building the World', teaser: 'How a computer invents a whole world of cubes, and checks that you can finish it.',
    de: { title: 'Die Welt erschaffen', teaser: 'Wie ein Computer eine ganze Welt aus Würfeln erfindet und prüft, dass man sie schaffen kann.' } },
  { file: 'paths.html', theme: 'roots', depth: 8, icon: '../assets/items/item_stick_forked.png',
    title: 'Finding the Way', teaser: 'How monsters and the generator find a way from here to there.',
    de: { title: 'Den Weg finden', teaser: 'Wie Monster und der Weltbauer einen Weg von hier nach dort finden.' } },
  { file: 'physics.html', theme: 'frozen', depth: 9, icon: '../assets/items/item_potion_stamina.png',
    title: 'Run, Jump, Fall', teaser: 'Gravity, jumping, sliding along walls, and floppy ragdolls.',
    de: { title: 'Rennen, Springen, Fallen', teaser: 'Schwerkraft, Sprünge, an Wänden entlangrutschen und schlabbrige Ragdolls.' } },
  { file: 'combat.html', theme: 'frozen', depth: 10, icon: '../assets/items/weapon_sword_long.png',
    title: 'Swords & Fighting', teaser: 'How a swing works, how an arrow flies, how the game knows you hit, and why hits feel good.',
    de: { title: 'Schwerter & Kämpfe', teaser: 'Wie ein Schwerthieb funktioniert, wie ein Pfeil fliegt, woher das Spiel weiß, dass du triffst, und warum Treffer sich gut anfühlen.' } },
  { file: 'enemies.html', theme: 'swamp', depth: 11, icon: '../assets/items/item_crystal_ruby.png',
    title: 'Monster Brains', teaser: 'Monsters that wander, notice you, chase you and give up.',
    de: { title: 'Monster-Gehirne', teaser: 'Monster, die herumlaufen, dich bemerken, dich jagen und aufgeben.' } },
  { file: 'loot.html', theme: 'cenote', depth: 13, icon: '../assets/items/treasure_chest.png',
    title: 'Treasure & Weapons', teaser: 'Rarities, affixes and funny names: a machine that makes weapons.',
    de: { title: 'Schätze & Waffen', teaser: 'Seltenheiten, Affixe und lustige Namen: eine Maschine, die Waffen baut.' } },
  { file: 'stronger.html', theme: 'nests', depth: 14, icon: '../assets/items/weapon_sword_greatsword.png',
    title: 'Growing Stronger', teaser: 'Experience, levels and curves: how the game keeps getting harder, and you keep up.',
    de: { title: 'Stärker werden', teaser: 'Erfahrung, Level und Kurven: wie das Spiel immer schwerer wird und du mithältst.' } },
  { file: 'drawing.html', theme: 'nests', depth: 15, icon: '../assets/items/item_crystal_sapphire.png',
    title: 'Drawing the World', teaser: 'Triangles, cameras, lights, and cutting holes in roofs so you can see.',
    de: { title: 'Die Welt malen', teaser: 'Dreiecke, Kameras, Licht und Löcher in Dächern, damit du etwas siehst.' } },
  { file: 'light.html', theme: 'ossuary', depth: 15, icon: '../assets/items/quest_lantern.png',
    title: 'Light and Shadow', teaser: 'How a computer paints light, why many lamps are hard, and the shadows worked out once and kept in a lightmap.',
    de: { title: 'Licht und Schatten', teaser: 'Wie ein Computer Licht malt, warum viele Lampen schwierig sind, und Schatten, die einmal ausgerechnet und in einer Lichtkarte aufgehoben werden.' } },
  { file: 'network.html', theme: 'mines', depth: 16, icon: '../assets/items/held_crystal_ball.png',
    title: 'Playing Together', teaser: 'Two computers, one adventure: messages, lag, and who is the boss of a monster.',
    de: { title: 'Zusammen spielen', teaser: 'Zwei Computer, ein Abenteuer: Nachrichten, Lag und wer über ein Monster bestimmt.' } },
  { file: 'sound.html', theme: 'ruins', depth: 17, icon: '../assets/items/item_coin_gold.png',
    title: 'Sounds, Music & Voices', teaser: 'Every sound is made from math. Music that changes with danger. Voices an AI spoke ahead of time.',
    de: { title: 'Geräusche, Musik & Stimmen', teaser: 'Jedes Geräusch ist aus Mathe gemacht. Musik, die sich mit der Gefahr ändert. Stimmen, die eine KI im Voraus gesprochen hat.' } },
  { file: 'art.html', theme: 'volcanic', depth: 18, icon: '../assets/items/item_crystal_emerald.png',
    title: 'Making Monsters', teaser: 'Models built by code in Blender, from blobs of digital clay.',
    de: { title: 'Monster bauen', teaser: 'Modelle, die Code in Blender baut, aus Klumpen digitaler Knete.' } },
  { file: 'animation.html', theme: 'abyss', depth: 19, icon: '../assets/items/weapon_bow_recurve.png',
    title: 'Coming Alive', teaser: 'Mixing walk and run, feet that don\'t slide, and getting up from a ragdoll.',
    de: { title: 'Lebendig werden', teaser: 'Gehen und Rennen mischen, Füße, die nicht rutschen, und Aufstehen aus der Ragdoll.' } },
  { file: 'checks.html', theme: 'core', depth: 20, icon: '../assets/items/item_potion_mana.png',
    title: 'Keeping It Working', teaser: 'Tests, seeds, tools to look inside, and save points: how game makers keep a game from breaking.',
    de: { title: 'Damit alles läuft', teaser: 'Tests, Seeds, Werkzeuge zum Hineinschauen und Speicherpunkte: wie Spielemacher verhindern, dass ein Spiel kaputtgeht.' } },
];

// a room's texts in a language ('en' or 'de')
export const local = (d, lang) => lang === 'de' && d.de ? { ...d, ...d.de } : d;
// a room's icon as a URL that works from any page
export const iconUrl = d => new URL(d.icon, import.meta.url).href;

// what the three detail levels are called (slides carry data-lv="1|2|3")
export const LEVELS = [
  null,
  { name: 'Big idea', de: 'Große Idee', short: 'Lv 1', color: '#61dc6b' },
  { name: 'How it works', de: 'So funktioniert es', short: 'Lv 2', color: '#51a9ff' },
  { name: 'Real code', de: 'Echter Code', short: 'Lv 3', color: '#fd9f07' },
];

// the game depth each theme name stands for (shown in the top bar)
export const THEME_NAMES = {
  meadow: 'Meadow islands', peaks: 'Snowy peaks', badlands: 'Badlands', roots: 'Root caves', frozen: 'Frozen caves',
  swamp: 'Fungal swamp', nests: 'Spider nests', mines: 'Crystal mines', ruins: 'Buried ruins', volcanic: 'Volcanic depths',
  abyss: 'Obsidian abyss', core: 'The core',
  clouds: 'Cloud kingdom', lagoon: 'Lagoon isles', karst: 'Karst terraces', highlands: 'Prayer highlands',
  saltflats: 'Salt flats', grotto: 'Sunken grotto', hive: 'Honey hive', ossuary: 'Ossuary', forge: 'Dwarven forge',
  cenote: 'Jungle cenote', canyon: 'Deep canyon', darkforest: 'Dark forest', slime: 'Slime marsh',
};
// the German of the names only the guide has: the game's themes are said in the game's words
// (src/i18n/, learn/deck.js themeName), so the guide and the game call a depth the same
export const THEME_NAMES_DE = { core: 'Der Kern' };
