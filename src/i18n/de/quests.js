// The quests (core/quests.js): what the people ask, their names and roles, the places, the
// landmarks and clues. A quest's words are nouns and sentences put together when it is read
// (src/i18n/i18n.js): 'auf {where:dem}' is 'auf Tiefe 3' or 'auf dem Weg aus der Stadt' (then
// 'zum', 'vom', 'beim': src/i18n/de/grammar.js finish).
export default {
  // the people (core/npcs.js): their roles, a woman's own ('she|...'), how they are related
  '{name} the {role}': '{role} {name}',
  hermit: { text: 'Einsiedler', g: 'm' },
  'she|hermit': { text: 'Einsiedlerin', g: 'f' },
  explorer: { text: 'Entdecker', g: 'm' },
  'she|explorer': { text: 'Entdeckerin', g: 'f' },
  miner: { text: 'Bergarbeiter', g: 'm' },
  'she|miner': { text: 'Bergarbeiterin', g: 'f' },
  pilgrim: { text: 'Pilger', g: 'm' },
  'she|pilgrim': { text: 'Pilgerin', g: 'f' },
  trapper: { text: 'Fallensteller', g: 'm' },
  'she|trapper': { text: 'Fallenstellerin', g: 'f' },
  scholar: { text: 'Forscher', g: 'm' },
  'she|scholar': { text: 'Forscherin', g: 'f' },
  carter: { text: 'Kutscher', g: 'm' },
  'she|carter': { text: 'Kutscherin', g: 'f' },
  messenger: { text: 'Bote', g: 'm', obl: 'Boten' },
  'she|messenger': { text: 'Botin', g: 'f' },
  friend: { text: 'Freund', g: 'm' },
  'she|friend': { text: 'Freundin', g: 'f' },
  apprentice: { text: 'Schüler', g: 'm' },
  'she|apprentice': { text: 'Schülerin', g: 'f' },
  cousin: { text: 'Cousin', g: 'm' },
  'she|cousin': { text: 'Cousine', g: 'f' },
  daughter: { text: 'Tochter', g: 'f' },
  son: { text: 'Sohn', g: 'm' },
  brother: { text: 'Bruder', g: 'm' },
  sister: { text: 'Schwester', g: 'f' },
  grandson: { text: 'Enkel', g: 'm' },
  granddaughter: { text: 'Enkelin', g: 'f' },
  somebody: 'jemand',
  Somebody: 'Jemand',

  // the villagers who give quests (core/quests.js GIVERS); the Smith, the Alchemist and the
  // Enchanter are the traders' (items.js)
  Innkeeper: { text: 'Wirt', g: 'm' },
  Groom: { text: 'Stallbursche', g: 'm', obl: 'Stallburschen' },
  'Pet keeper': { text: 'Tierpfleger', g: 'm' },
  "on the inn's porch in town": 'auf der Veranda des Gasthauses in der Stadt',
  'at the stable in town': 'am Stall in der Stadt',
  'at the anvil in town': 'am Amboss in der Stadt',
  'by the pet shop in town': 'bei der Tierhandlung in der Stadt',
  'at the market in town': 'auf dem Markt in der Stadt',

  // places: the themes' names are the guide's too (learn/deck.js themeLabel)
  'road out of town': { text: 'Weg aus der Stadt', g: 'm' },
  'at the camp on {where:the}': 'im Lager auf {where:dem}',
  'on {where:the}': 'auf {where:dem}',
  'on {where:the}, {clue}': 'auf {where:dem}, {clue}',
  Meadows: { text: 'Wiesen', g: 'pl' },
  'Meadow islands': { text: 'Wiesen-Inseln', g: 'pl' },
  'Cloud kingdom': { text: 'Wolkenreich', g: 'n' },
  'Lagoon isles': { text: 'Lagunen-Inseln', g: 'pl' },
  'Karst terraces': { text: 'Karstterrassen', g: 'pl' },
  'Dark forest': { text: 'Dunkler Wald', adj: 'Dunkl', g: 'm' },
  'Snowy peaks': { text: 'Schneegipfel', g: 'pl' },
  'Prayer highlands': { text: 'Gebetsfahnen-Hochland', g: 'n' },
  Badlands: { text: 'Ödland', g: 'n' },
  'Salt flats': { text: 'Salzebene', g: 'f' },
  'Slime marsh': { text: 'Schleimsumpf', g: 'm' },
  'Deep canyon': { text: 'Tiefe Schlucht', adj: 'Tief', g: 'f' },
  'Root caves': { text: 'Wurzelhöhlen', g: 'pl' },
  'Frozen caves': { text: 'Eishöhlen', g: 'pl' },
  'Sunken grotto': { text: 'Versunkene Grotte', adj: 'Versunken', g: 'f' },
  'Fungal swamp': { text: 'Pilzsumpf', g: 'm' },
  'Honey hive': { text: 'Honigstock', g: 'm' },
  'Spider nests': { text: 'Spinnennester', g: 'pl' },
  Ossuary: { text: 'Beinhaus', g: 'n' },
  'Crystal mines': { text: 'Kristallminen', g: 'pl' },
  'Dwarven forge': { text: 'Zwergenschmiede', g: 'f' },
  'Buried ruins': { text: 'Verschüttete Ruinen', adj: 'Verschüttet', g: 'pl' },
  'Jungle cenote': { text: 'Dschungel-Cenote', g: 'f' },
  'Volcanic depths': { text: 'Vulkantiefen', g: 'pl' },
  'Obsidian abyss': { text: 'Obsidian-Abgrund', g: 'm' },

  // the landmarks (the props that stand at a depth's grand site)
  'chained obelisk': { text: 'Kettenobelisk', g: 'm' },
  'void throne': { text: 'Leerenthron', g: 'm' },
  'covered wagon': { text: 'Planwagen', g: 'm' },
  windpump: { text: 'Windpumpe', g: 'f' },
  'balanced rock': { text: 'Wackelstein', g: 'm' },
  'canyon arch': { text: 'Felsbogen', g: 'm' },
  'cliff dwelling': { text: 'Felsenwohnung', g: 'f' },
  'ceiba roots': { text: 'Kapokwurzeln', g: 'pl' },
  'step shrine': { text: 'Stufenschrein', g: 'm' },
  'sky gate': { text: 'Himmelstor', g: 'n' },
  'wind harp': { text: 'Windharfe', g: 'f' },
  furnace: { text: 'Schmelzofen', g: 'm' },
  'great gear': { text: 'Riesenzahnrad', g: 'n' },
  'frozen falls': { text: 'Eisfall', g: 'm' },
  'ice throne': { text: 'Eisthron', g: 'm' },
  'giant shell': { text: 'Riesenmuschel', g: 'f' },
  'sunken bell': { text: 'Meeresglocke', g: 'f' },
  'great chorten': { text: 'Stupa', g: 'm' },
  hermitage: { text: 'Einsiedelei', g: 'f' },
  'mani wall': { text: 'Mani-Mauer', g: 'f' },
  'nomad tent': { text: 'Nomadenzelt', g: 'n' },
  'comb tower': { text: 'Wabenturm', g: 'm' },
  'royal cell': { text: 'Königinnenzelle', g: 'f' },
  'karst tower': { text: 'Karstturm', g: 'm' },
  pavilion: { text: 'Pavillon', g: 'm' },
  shipwreck: { text: 'Schiffswrack', g: 'n' },
  'stilt hut': { text: 'Pfahlhütte', g: 'f' },
  windmill: { text: 'Windmühle', g: 'f' },
  'wishing well': { text: 'Wunschbrunnen', g: 'm' },
  'giant geode': { text: 'Riesengeode', g: 'f' },
  headframe: { text: 'Förderturm', g: 'm' },
  'brood cluster': { text: 'Brutnest', g: 'n' },
  'web gate': { text: 'Netztor', g: 'n' },
  'bone arch': { text: 'Knochenbogen', g: 'm' },
  'crypt shrine': { text: 'Gruftschrein', g: 'm' },
  'expedition camp': { text: 'Expeditionslager', g: 'n' },
  'ice arch': { text: 'Eisbogen', g: 'm' },
  'hollow stump': { text: 'Baumhöhle', g: 'f' },
  'root gate': { text: 'Wurzeltor', g: 'n' },
  'colossus head': { text: 'Kolosskopf', g: 'm' },
  'temple gate': { text: 'Tempeltor', g: 'n' },
  'salt arch': { text: 'Salzbogen', g: 'm' },
  'salt harvest': { text: 'Salzernte', g: 'f' },
  'giant toadstool': { text: 'Riesenpilz', g: 'm' },
  'witch hut': { text: 'Hexenhütte', g: 'f' },
  'fire shrine': { text: 'Feuerschrein', g: 'm' },
  fumarole: { text: 'Fumarole', g: 'f' },
  'lantern tree': { text: 'Laternenbaum', g: 'm' },
  'mossy arch': { text: 'Moosbogen', g: 'm' },
  'forest chapel': { text: 'Waldkapelle', g: 'f' },
  'meteor crater': { text: 'Meteoritenkrater', g: 'm' },
  'giant slime tree': { text: 'Riesiger Schleimbaum', adj: 'Riesig', g: 'm' },

  // where a hiding place is (core/questplan.js clueOf)
  'up on the needle of rock': 'oben auf der Felsnadel',
  'on top of the lone peak': 'oben auf dem einsamen Gipfel',
  'by the great lake': 'am großen See',
  'at the foot of the great mountain': 'am Fuß des großen Bergs',
  'at the foot of the two bridges': 'am Fuß der zwei Brücken',
  'up where the high bridge comes back': 'oben, wo die hohe Brücke zurückkommt',
  'below the great cliff': 'unter der großen Klippe',
  'up on the high plateau': 'oben auf der Hochebene',
  'where the plateau comes down': 'wo die Hochebene abfällt',
  'by the high ground': 'bei der Anhöhe',
  'on the island at the end of the long bridge': 'auf der Insel am Ende der langen Brücke',
  'near {landmark:the}': 'bei {landmark:dem}',
  'where the horde gathers': 'wo sich die Horde sammelt',
  "near {name}'s camp": 'beim Lager von {name}',
  'not far from {who}': 'nicht weit von {who}',
  'by the supply cart': 'beim Vorratskarren',
  'off the main way': 'abseits vom Hauptweg',
  "past the guardians' gates": 'hinter den Toren der Wächter',
  "past the guardian's gate": 'hinter dem Tor des Wächters',
  'not far from where the depth begins': 'nicht weit vom Anfang der Tiefe',
  'close to the way down': 'nah am Weg nach unten',
  'about halfway along': 'ungefähr auf halbem Weg',
  '{a}, {b}': '{a}, {b}',

  // the guardians, in the order they are come to: with "der", so the endings are a weak noun's
  'first guardian': { text: 'erste Wächter', obl: 'ersten Wächter', g: 'm' },
  'second guardian': { text: 'zweite Wächter', obl: 'zweiten Wächter', g: 'm' },
  'third guardian': { text: 'dritte Wächter', obl: 'dritten Wächter', g: 'm' },
  'fourth guardian': { text: 'vierte Wächter', obl: 'vierten Wächter', g: 'm' },
  'next guardian': { text: 'nächste Wächter', obl: 'nächsten Wächter', g: 'm' },
  no: 'keine',
  one: 'ein',
  two: 'zwei',
  three: 'drei',
  four: 'vier',
  five: 'fünf',
  "{owner:the}'s {thing:lower}": '{thing} von {owner:dem}',

  // reach
  'Down to depth {depth}': 'Hinab auf Tiefe {depth}',
  'Travellers talk about {place:the}, down on depth {depth}. Nobody I know has been there. Go and see, and come back to tell me what it is like.':
    'Reisende erzählen von {place:dem}, unten auf Tiefe {depth}. Niemand, den ich kenne, war schon dort. Geh hin und schau es dir an, und dann komm zurück und erzähl mir, wie es dort ist.',
  'I have heard of {place:the}, deep down on depth {depth}. Will you go there for me? Then come back and tell me all about it.':
    'Ich habe von {place:dem} gehört, tief unten auf Tiefe {depth}. Gehst du für mich hin? Dann komm zurück und erzähl mir alles darüber.',
  'Reach depth {depth} ({place:the})': 'Erreiche Tiefe {depth} ({place:der})',

  // landmark
  '{landmark:The}': '{landmark:Der}',
  'Somewhere in {place:the} on depth {depth} there is {landmark:a}. My grandmother told me about it. Find it, stand beside it, and come back to tell me it is really there.':
    'Irgendwo in {place:dem} auf Tiefe {depth} gibt es {landmark:einen}. Meine Großmutter hat mir davon erzählt. Finde {landmark:ihn}, stell dich daneben und komm zurück, um mir zu sagen, dass es {landmark:ihn} wirklich gibt.',
  'They say {landmark:a} stands in {place:the}, on depth {depth}. I would love to know what it looks like. Find it for me and come back.':
    'Man sagt, in {place:dem} auf Tiefe {depth} steht {landmark:ein}. Ich wüsste so gern, wie {landmark:er} aussieht. Finde {landmark:ihn} für mich und komm zurück.',
  'Find {landmark:the} on depth {depth}': 'Finde {landmark:den} auf Tiefe {depth}',

  // guardian
  'Beat {boss}': 'Besiege {boss}',
  'The guardian of the well': 'Der Wächter am Brunnen',
  '{boss} guards the way down from {where:the}, and nobody gets past. Beat {boss}, and come back to tell me the way is open.':
    '{boss} bewacht den Weg hinab von {where:dem}, und niemand kommt vorbei. Besiege {boss} und komm zurück, um mir zu sagen, dass der Weg frei ist.',
  'The way down from {where:the} is guarded by something big. Beat the guardian of the well and come back to tell me.':
    'Der Weg hinab von {where:dem} wird von etwas Großem bewacht. Besiege den Wächter am Brunnen und komm zurück, um es mir zu sagen.',
  'A guardian sits by the well at the end of {where:the}. Nobody gets down while it is there. Beat it, then come back.':
    'Am Ende von {where:dem} sitzt ein Wächter beim Brunnen. Solange er da ist, kommt niemand hinab. Besiege ihn, dann komm zurück.',
  'Defeat {boss} on {where:the}': 'Besiege {boss} auf {where:dem}',
  'Defeat the Temp Boss on {where:the}': 'Besiege den Temp-Boss auf {where:dem}',
  'A gate on {where:the}': 'Ein Tor auf {where:dem}',
  'On {where:the} a guardian blocks the way through. There are {n} of them; I mean {which:the} you come to. Beat it so the way is open for everyone, then come back.':
    'Auf {where:dem} versperrt ein Wächter den Weg. Es gibt {n} davon; ich meine {which:den} auf deinem Weg. Besiege ihn, damit der Weg für alle frei ist, dann komm zurück.',
  'On {where:the} a guardian blocks the way through. Beat it so the way is open for everyone, then come back.':
    'Auf {where:dem} versperrt ein Wächter den Weg. Besiege ihn, damit der Weg für alle frei ist, dann komm zurück.',
  '{which:The} on {where:the} has scared off everyone who went that way. Beat it, and come back to tell me.':
    '{which:Der} auf {where:dem} hat alle verjagt, die dort entlanggegangen sind. Besiege ihn und komm zurück, um es mir zu sagen.',
  'Defeat {which:the} on {where:the}': 'Besiege {which:den} auf {where:dem}',

  // horde
  'A horde of {enemy:pl}': 'Eine Horde {enemy:pl}',
  'A whole horde of {enemy:pl} has gathered on {where:the}. Left alone they only get bolder. Break it up, and come back to tell me.':
    'Eine ganze Horde {enemy:pl} hat sich auf {where:dem} versammelt. Wenn man sie in Ruhe lässt, werden sie nur frecher. Zerschlag sie und komm zurück, um es mir zu sagen.',
  'People coming back from {where:the} talk of a horde of {enemy:pl}. Scatter them, every last one, then come back.':
    'Die Leute, die von {where:dem} zurückkommen, reden von einer Horde {enemy:pl}. Verjag sie, bis zum letzten, dann komm zurück.',
  'Break the horde of {enemy:pl} on {where:the}': 'Zerschlag die Horde {enemy:pl} auf {where:dem}',

  // find
  'The lost {thing:lower}': '{thing, select, m {Der verlorene} f {Die verlorene} n {Das verlorene} other {Die verlorenen}} {thing}',
  '{label:cap}': '{label:Der}',
  'I lost my {thing:lower} down on {where:the}, {clue}. Could you look for {thing:it} and bring {thing:it} back to me?':
    'Ich habe {thing:meinen} unten auf {where:dem} verloren, {clue}. Kannst du {thing:ihn} suchen und zu mir zurückbringen?',
  'My {thing:lower}! I dropped {thing:it} when I ran from the monsters on {where:the}, {clue}. Please bring {thing:it} back.':
    '{thing:Mein}! Ich habe {thing:ihn} fallen lassen, als ich auf {where:dem} vor den Monstern weggerannt bin, {clue}. Bitte bring {thing:ihn} zurück.',
  'I only put my {thing:lower} down for a moment on {where:the}, {clue}, and then something came at me and I ran. Would you fetch {thing:it} for me?':
    'Ich habe {thing:meinen} nur kurz auf {where:dem} abgestellt, {clue}, und dann kam etwas auf mich zu und ich bin weggerannt. Holst du {thing:ihn} für mich?',
  'A big bird snatched my {thing:lower} and let {thing:it} fall on {where:the}, {clue}. Can you get {thing:it} back for me?':
    'Ein großer Vogel hat {thing:meinen} geschnappt und auf {where:dem} fallen lassen, {clue}. Kannst du {thing:ihn} für mich zurückholen?',
  'My {relation:lower} {person} left {person:his} {thing:lower} on {where:the}, {clue}. {person} is too scared to go back. Would you fetch {thing:it}?':
    '{relation:Mein} {person} hat {person, select, f {{thing:ihren}} other {{thing:seinen}}} auf {where:dem} liegen lassen, {clue}. {person} traut sich nicht mehr dorthin. Holst du {thing:ihn}?',
  '{person}, my {relation:lower}, was carrying {person:his} {thing:lower} down to {where:the} and dropped {thing:it} {clue}. Please bring {thing:it} back to me.':
    '{person}, {relation:mein}, hat {person, select, f {{thing:ihren}} other {{thing:seinen}}} hinunter auf {where:den} getragen und {thing:ihn} verloren, {clue}. Bitte bring {thing:ihn} zu mir zurück.',
  'Somebody saw {label} lying on {where:the}, {clue}. {person} is my {relation:lower}. Would you bring {thing:it} back for us?':
    'Jemand hat {label:den} auf {where:dem} liegen sehen, {clue}. {person} ist {relation:mein}. Bringst du {thing:ihn} für uns zurück?',
  'Find {label} on {where:the}': 'Finde {label:den} auf {where:dem}',

  // rescue
  'Where is {person}?': 'Wo ist {person}?',
  'My {relation:lower} {person} went down to {where:the} and has not come back. Somebody saw {person:him} {clue}. Please find {person:him}! I will wait here.':
    '{relation:Mein} {person} ist hinunter auf {where:den} gegangen und nicht zurückgekommen. Jemand hat {person:ihn} gesehen, {clue}. Bitte finde {person:ihn}! Ich warte hier.',
  '{person}, my {relation:lower}, wanted to see {where:the} and never came back. The last I heard, {clue}. Bring {person:him} home to me, please.':
    '{person}, {relation:mein}, wollte {where:den} sehen und kam nie zurück. Zuletzt hieß es: {clue}. Bitte bring {person:ihn} zu mir nach Hause.',
  'First {before}, and now my {relation:lower} {person} is gone too! {person} went down to {where:the}, and somebody saw {person:him} {clue}. Would you look once more?':
    'Erst {before}, und jetzt ist auch {relation:mein} {person} verschwunden! {person} ist hinunter auf {where:den} gegangen, und jemand hat {person:ihn} gesehen, {clue}. Suchst du noch einmal?',
  'You brought {before} home to me, so I know you can do it. Now {person}, my {relation:lower}, is lost on {where:the}, {clue}. Please!':
    'Du hast mir {before} nach Hause gebracht, also weiß ich, dass du es kannst. Jetzt hat sich {person}, {relation:mein}, auf {where:dem} verirrt, {clue}. Bitte!',
  'Find {person} on {where:the}': 'Finde {person} auf {where:dem}',

  // treasure
  'A map with a cross': 'Eine Karte mit einem Kreuz',
  'I found this scrap of an old map. The cross is on {where:the}, {clue}. I am too old to go digging; whatever is there is yours.':
    'Ich habe diesen Fetzen einer alten Karte gefunden. Das Kreuz ist auf {where:dem}, {clue}. Ich bin zu alt zum Graben; was dort ist, gehört dir.',
  'Look at this map scrap! Treasure, on {where:the}, {clue}. Find it, and keep what is in it.':
    'Schau dir diesen Kartenfetzen an! Ein Schatz, auf {where:dem}, {clue}. Finde ihn und behalte, was drin ist.',
  'Find the treasure on {where:the}': 'Finde den Schatz auf {where:dem}',

  // bounty
  'Wanted: {name}': 'Gesucht: {name}',
  '{bounty:cap} has been seen on {where:the}, {clue}. It is bigger and meaner than the others of its kind. Beat it, and come back for the reward.':
    '{bounty:cap} wurde auf {where:dem} gesehen, {clue}. Es ist größer und gemeiner als die anderen seiner Art. Besiege es und komm zurück, um dir die Belohnung zu holen.',
  'There is a reward on {name}! {kind:A} the size of a cart, on {where:the}, {clue}. Bring me word it is gone.':
    'Auf {name} ist eine Belohnung ausgesetzt! {kind:Ein}, so groß wie ein Karren, auf {where:dem}, {clue}. Sag mir Bescheid, wenn es weg ist.',
  'Defeat {name} on {where:the}': 'Besiege {name} auf {where:dem}',

  // delivery
  '{thing:cap} for {name}': '{thing} für {name}',
  'Could you take {thing:this} {thing:lower} to {to}, {at}? {name} has been waiting for {thing:it} for a long time.':
    'Kannst du {thing:diesen} zu {to} bringen, {at}? {name} wartet schon lange darauf.',
  '{thing:This} {thing:lower} must get to {to}, {at}. Nobody else dares to go that far down. {name} will thank you for it.':
    '{thing:Dieser} muss zu {to}, {at}. Sonst traut sich niemand so weit hinunter. {name} wird dir dankbar sein.',
  '{to} ({at}) asked me for {thing:this} {thing:lower}, and I promised to send {thing:it}. Would you carry {thing:it} down there for me?':
    '{to} ({at}) hat mich um {thing:diesen} gebeten, und ich habe versprochen, {thing:ihn} zu schicken. Trägst du {thing:ihn} für mich hinunter?',
  'I owe {name} a favour. {thing:This} {thing:lower} should make us even. You will find {to} {at}.':
    'Ich schulde {name} einen Gefallen. Mit {thing:diesem} sind wir quitt. Du findest {to} {at}.',
  '{name}: At last! Thank you so much. Here, this is for your trouble.': '{name}: Endlich! Vielen Dank. Hier, das ist für deine Mühe.',
  '{name}: For me? I hoped {thing:it} would come. Take this, you have earned it.': '{name}: Für mich? Ich habe so gehofft, dass {thing:er} kommt. Nimm das, du hast es dir verdient.',
  '{name}: Oh, wonderful! I was beginning to think nobody would come. Here, take this.': '{name}: Oh, wunderbar! Ich dachte schon, es kommt keiner mehr. Hier, nimm das.',
  'Bring {thing:the} to {to} on {where:the}': 'Bring {thing:den} zu {to} auf {where:dem}',

  // relay
  'Ask {name}': 'Frag {name}',
  'My {thing:lower} {thing:is} gone, and {to} ({at}) saw where {thing:they} went. Ask {name}, find {thing:it}, and bring {thing:it} back to me.':
    '{thing:Mein} {thing, select, pl {sind} other {ist}} weg, und {to} ({at}) hat gesehen, wohin. Frag {name}, finde {thing:ihn} und bring {thing:ihn} zu mir zurück.',
  '{to} found my {thing:lower} once before! Go and ask, {at}. Then bring {thing:it} back to me, please.':
    '{to} hat {thing:meinen} schon einmal gefunden! Geh hin und frag, {at}. Dann bring {thing:ihn} bitte zu mir zurück.',
  'Somebody took my {thing:lower} down below. {to} hears all the gossip down there, {at}. Ask, then bring {thing:it} back to me.':
    'Jemand hat {thing:meinen} nach unten mitgenommen. {to} hört dort unten allen Klatsch, {at}. Frag nach, dann bring {thing:ihn} zu mir zurück.',
  '{name}: Your {thing:lower}? I saw {thing:it} on {where:the}, {clue}.': '{name}: {thing:Dein}? {thing:Ihn} habe ich auf {where:dem} gesehen, {clue}.',
  'Ask {to} on {where:the}': 'Frag {to} auf {where:dem}',
  'Find {thing:the} on {where:the}, {clue}': 'Finde {thing:den} auf {where:dem}, {clue}',

  // gather
  '{thing:Pl} on {where:the}': '{thing:Pl} auf {where:dem}',
  'A cart tipped over on {where:the}, and {n} {thing:pl} went rolling off all over the place. One was seen {clue}. Could you gather them up and bring them back to me?':
    'Auf {where:dem} ist ein Karren umgekippt, und {n} {thing:pl} sind überallhin gerollt. Eins davon wurde {clue} gesehen. Sammelst du sie ein und bringst sie mir zurück?',
  'The monsters on {where:the} ran off with my {thing:pl}, {n} of them, and dropped them here and there. Bring back every one! I think one is {clue}.':
    'Die Monster auf {where:dem} haben mir {n} {thing:pl} geklaut und hier und da fallen lassen. Bring alle zurück! Ich glaube, eins ist {clue}.',
  'I need {n} {thing:pl}, and there are some lying about on {where:the}, one of them {clue}. Would you collect them for me?':
    'Ich brauche {n} {thing:pl}, und auf {where:dem} liegen welche herum, eins davon {clue}. Sammelst du sie für mich ein?',
  'A great gust of wind blew {n} of my {thing:pl} all over {where:the}. I saw one come down {clue}. Please find them all!':
    'Ein großer Windstoß hat {n} {thing:pl} von mir über {where:den} verstreut. Eins habe ich {clue} herunterkommen sehen. Bitte finde sie alle!',
  'Collect {n} {thing:pl} on {where:the}': 'Sammle {n} {thing:pl} auf {where:dem}',

  // defense
  'The sealed storehouse': 'Das versiegelte Lagerhaus',
  'Behind a sealed door on {where:the} {keeper} keeps a hidden storehouse, and the monsters have found it. Here is the way in: take it, and help {keeper} hold the cart until they give up.':
    'Hinter einer versiegelten Tür auf {where:dem} hat {keeper} ein verstecktes Lagerhaus, und die Monster haben es gefunden. Hier ist der Weg hinein: Nimm ihn und hilf {keeper}, den Karren zu halten, bis sie aufgeben.',
  "There is a door on {where:the} that nobody can open. I can. Behind it, {keeper}'s storehouse is under attack. Go in and keep them off the cart!":
    'Auf {where:dem} gibt es eine Tür, die niemand öffnen kann. Ich schon. Dahinter wird das Lagerhaus von {keeper} angegriffen. Geh hinein und halt sie vom Karren fern!',
  "Defend {keeper}'s storehouse on {where:the}": 'Verteidige das Lagerhaus von {keeper} auf {where:dem}',
  'Raiders at the cart': 'Plünderer am Karren',
  'Every night the monsters come for my supply cart. I cannot hold them off alone! When you are ready, stand by the cart and I will ring the bell. Keep them off it until they give up.':
    'Jede Nacht kommen die Monster zu meinem Vorratskarren. Allein schaffe ich das nicht! Wenn du bereit bist, stell dich zum Karren, dann läute ich die Glocke. Halt sie vom Karren fern, bis sie aufgeben.',
  'They have been at my cart again, and next time there will be more of them. Will you stand by it with me? Keep them away from it, wave after wave.':
    'Sie waren schon wieder an meinem Karren, und nächstes Mal kommen noch mehr. Stellst du dich mit mir dazu? Halt sie fern, Welle um Welle.',
  "Defend {keeper}'s cart on {where:the}": 'Verteidige den Karren von {keeper} auf {where:dem}',

  // a quest done that comes back, and how a quest stands
  '{title} (again)': '{title} (noch einmal)',
  'Back again? {text}': 'Schon wieder da? {text}',
  Offered: 'Angeboten',
  'Done: back to {giver:the}': 'Erledigt: zurück zu {giver:dem}',
  Complete: 'Abgeschlossen',
  Failed: 'Gescheitert',

  // the quests in the game (game/quests.js, game/questpanel.js, game/questworld.js, game/action.js)
  'Open the chest': 'Truhe öffnen',
  'Talk to {who:the}': 'Sprich mit {who:dem}',
  Collect: 'Aufheben',
  'They are coming!': 'Sie kommen!',
  'Wave {n} of {of}!': 'Welle {n} von {of}!',
  'Wave {n} beaten! Get ready...': 'Welle {n} geschafft! Mach dich bereit …',
  'Supply cart': 'Vorratskarren',
  easy: 'leicht',
  medium: 'mittel',
  hard: 'schwer',
  'You are back! Did you do what I asked?': 'Da bist du ja wieder! Hast du gemacht, worum ich dich gebeten habe?',
  'I could use some help...': 'Ich könnte Hilfe gebrauchen …',
  'How is it going?': 'Wie läuft es?',
  'Nothing for you just now. Come back when you have been further down.': 'Gerade habe ich nichts für dich. Komm wieder, wenn du weiter unten warst.',
  "{name}'s quests": 'Aufträge von {name}',
  'Nothing else going on.': 'Sonst läuft nichts.',
  'No quests going on. Talk to the villagers in town: a ! over one means a quest for you.':
    'Gerade läuft kein Auftrag. Sprich mit den Leuten in der Stadt: Ein ! über jemandem heißt, da gibt es einen Auftrag für dich.',
  'No quests done yet.': 'Noch keine Aufträge erledigt.',
  'Nothing archived. Archive a quest to put it away; it waits here until you bring it back.': 'Nichts abgelegt. Leg einen Auftrag ab, um ihn wegzupacken; er wartet hier, bis du ihn zurückholst.',
  'Select a quest to read it.': 'Wähl einen Auftrag, um ihn zu lesen.',
  'and whatever the treasure holds': 'und was immer im Schatz ist',
  'Go back to {giver:the} ({where}) to hand it in.': 'Geh zurück zu {giver:dem} ({where}), um ihn abzugeben.',
  'Go back to {giver:the} to hand it in.': 'Geh zurück zu {giver:dem}, um ihn abzugeben.',
  'Archived: put away. It counts nothing until you bring it back.': 'Abgelegt: weggepackt. Er zählt nichts, bis du ihn zurückholst.',
  'Done! {back}': 'Erledigt! {back}',
  'When it is done, come back to {giver:the} for the reward.': 'Wenn er erledigt ist, komm zurück zu {giver:dem}, um die Belohnung zu holen.',
  'It failed. Restart it to try again from the beginning.': 'Er ist gescheitert. Fang ihn neu an, um es noch einmal von vorn zu versuchen.',
  'Complete: everyone in the game got the reward.': 'Abgeschlossen: Alle im Spiel haben die Belohnung bekommen.',
  Accept: 'Annehmen',
  'Hand in': 'Abgeben',
  Restart: 'Neu anfangen',
  Following: 'Wird verfolgt',
  Follow: 'Verfolgen',
  Archive: 'Ablegen',
  Unarchive: 'Zurückholen',
  'From {giver:the} · {where} · {difficulty}': 'Von {giver:dem} · {where} · {difficulty}',
  '{item} ({rarity} {base})': '{item} ({base}, {rarity})',
  Goal: 'Ziel',
  Carrying: 'Dabei',
  Reward: 'Belohnung',
  'a quest': 'ein Auftrag',
  '{giver:the}': '{giver:dem}',
  '{name}: Thank you!': '{name}: Danke!',
  '{name}: Thank you! I will go back now. Here, take this.': '{name}: Danke! Ich gehe jetzt zurück. Hier, nimm das.',
  'whoever asked': 'wer auch immer gefragt hat',
  'That is all of them! Bring them back to {giver:the}': 'Das sind alle! Bring sie zurück zu {giver:dem}',
  'Found one! {have} of {need}': 'Eins gefunden! {have} von {need}',
  'Found {thing:the}! Bring {thing:it} back to {giver:the}': '{thing:Den} gefunden! Bring {thing:ihn} zurück zu {giver:dem}',

  // more of the kinds' titles and stories (core/quests.js KINDS), some only in some voices
  'What lies in {place:the}?': 'Was liegt in {place:dem}?',
  'Into {place:the}': 'Hinein in {place:den}',
  'Nobody has ever come back from {place:the} with a proper story. Go down to depth {depth} and be the first!':
    'Noch nie ist jemand aus {place:dem} mit einer richtigen Geschichte zurückgekommen. Geh hinunter auf Tiefe {depth} und hol dir die erste!',
  'I keep dreaming of {place:the}, down on depth {depth}. Is it real? Go and see, then tell me.':
    'Ich träume immer wieder von {place:dem}, unten auf Tiefe {depth}. Gibt es das wirklich? Geh hin und schau nach, dann erzähl es mir.',
  'Every map I own stops above depth {depth}. They say {place:the} is down there. Go and fill in the blank for me!':
    'Alle meine Karten hören über Tiefe {depth} auf. Man sagt, dort unten gibt es {place:den}. Geh hin und füll die Lücke für mich!',
  'The travellers who come in for soup all whisper about {place:the}, down on depth {depth}. I want to know if they are making it up. Go and look!':
    'Die Reisenden, die zum Suppenessen kommen, flüstern alle von {place:dem}, unten auf Tiefe {depth}. Ich will wissen, ob sie sich das ausdenken. Geh nachschauen!',
  'Is {landmark:the} real?': 'Gibt es {landmark:den} wirklich?',
  'A visit to {landmark:the}': 'Ein Besuch bei {landmark:dem}',
  'There is a song about {landmark:a} in {place:the}, on depth {depth}. Find it, stand beside it, and come back to tell me if the song is true.':
    'Es gibt ein Lied über {landmark:einen} in {place:dem} auf Tiefe {depth}. Finde {landmark:ihn}, stell dich daneben und komm zurück, um mir zu sagen, ob das Lied stimmt.',
  'I painted {landmark:a} once, from a story. Now I want to know if I got it right. It stands in {place:the}, on depth {depth}. Go and look closely!':
    'Ich habe einmal {landmark:einen} gemalt, nach einer Geschichte. Jetzt will ich wissen, ob ich es richtig gemacht habe. Du findest {landmark:ihn} in {place:dem} auf Tiefe {depth}. Geh hin und schau genau!',
  'My book has a whole chapter on {landmark:the} in {place:the}, on depth {depth}, and I have never seen it. Embarrassing! Go and stand beside it for me.':
    'Mein Buch hat ein ganzes Kapitel über {landmark:den} in {place:dem} auf Tiefe {depth}, und ich habe {landmark:ihn} nie gesehen. Peinlich! Geh hin und stell dich für mich daneben.',
  'Pilgrims walk all the way to {landmark:the} in {place:the}, on depth {depth}. I never made it. Go there for me, stand beside it, and come back.':
    'Pilger wandern den ganzen Weg bis zu {landmark:dem} in {place:dem} auf Tiefe {depth}. Ich habe es nie geschafft. Geh für mich hin, stell dich daneben und komm zurück.',
  'Down past {boss}': 'Hinab, an {boss} vorbei',
  'Everybody who wants to go deeper than {where:the} has to get past {boss}. Nobody has. Will you be the one? Then come back and tell me.':
    'Wer tiefer als {where:der} will, muss an {boss} vorbei. Das hat noch keiner geschafft. Schaffst du es? Dann komm zurück und erzähl es mir.',
  'Open the way on {where:the}': 'Mach den Weg frei auf {where:dem}',
  'The traders have to go the long way round {where:the}, because {which:the} sits on the short way. They grumble all day. Beat it, then come back!':
    'Die Händler müssen auf {where:dem} den langen Umweg nehmen, weil {which:der} auf dem kurzen Weg sitzt. Sie meckern den ganzen Tag. Besiege ihn, dann komm zurück!',
  '{which:The} on {where:the}: I made a sword for the last one who tried. I would like it back, and the gate open. Go on.':
    '{which:Der} auf {where:dem}: Ich habe dem Letzten, der es versucht hat, ein Schwert geschmiedet. Ich hätte es gern zurück, und das Tor offen. Na los.',
  'Too many {enemy:pl}': 'Zu viele {enemy:pl}',
  'The {enemy:pl} on {where:the} have stopped hiding and started marching about. Before they get ideas, break them up. Then come back!':
    'Die {enemy:pl} auf {where:dem} verstecken sich nicht mehr, sie marschieren herum. Zerschlag sie, bevor sie auf dumme Gedanken kommen. Dann komm zurück!',
  'I counted the {enemy:pl} on {where:the} and gave up at a hundred. They keep my snares empty. Thin them out, every one, then come back.':
    'Ich habe die {enemy:pl} auf {where:dem} gezählt und bei hundert aufgegeben. Wegen ihnen bleiben meine Schlingen leer. Erledige sie, alle, dann komm zurück.',
  'The {enemy:pl} on {where:the} chewed through my tunnel props. All of them! Break up that horde before they start on the roof.':
    'Die {enemy:pl} auf {where:dem} haben meine Grubenstempel durchgenagt. Alle! Zerschlag die Horde, bevor sie sich die Decke vornehmen.',
  'Where is my {thing:lower}?': '{thing, select, pl {Wo sind} other {Wo ist}} {thing:mein}?',
  'I hid my {thing:lower} on {where:the}, {clue}, so nobody would find {thing:it}. It worked: not even I can. Would you look?':
    'Ich habe {thing:meinen} auf {where:dem} versteckt, {clue}, damit {thing:ihn} niemand findet. Hat geklappt: Nicht mal ich finde {thing:ihn}. Schaust du nach?',
  'My {thing:lower} rolled off a ledge on {where:the}, {clue}, and I was too scared to climb after {thing:it}. Will you?':
    '{thing:Mein} {thing, select, pl {sind} other {ist}} auf {where:dem} von einem Felsvorsprung gerollt, {clue}, und ich hatte zu viel Angst, hinterherzuklettern. Machst du es?',
  'I lent my {thing:lower} to a traveller who swore to bring {thing:it} back. Now I hear {thing:it} is lying on {where:the}, {clue}. Typical! Fetch {thing:it}?':
    'Ich habe {thing:meinen} einem Reisenden geliehen, der geschworen hat, {thing:ihn} zurückzubringen. Jetzt höre ich, {thing:er} {thing, select, pl {liegen} other {liegt}} auf {where:dem}, {clue}. Typisch! Holst du {thing:ihn}?',
  'One of the rabbits got out with my {thing:lower} and dropped {thing:it} on {where:the}, {clue}. How a rabbit got that far, I do not know. Bring {thing:it} back?':
    'Eins der Kaninchen ist mit {thing:meinem} ausgebüxt und hat {thing:ihn} auf {where:dem} fallen lassen, {clue}. Wie ein Kaninchen so weit kommt, weiß ich nicht. Bringst du {thing:ihn} zurück?',
  'I was measuring something very important on {where:the}, {clue}, and left my {thing:lower} behind. Science waits for nobody. Except you. Fetch {thing:it}?':
    'Ich habe auf {where:dem} etwas sehr Wichtiges vermessen, {clue}, und dabei {thing:meinen} liegen lassen. Die Wissenschaft wartet auf niemanden. Außer auf dich. Holst du {thing:ihn}?',
  '{person}, my {relation:lower}, cried all night. {person:His} {thing:lower} is lying somewhere on {where:the}, {clue}. Would you get {thing:it} back?':
    '{person}, {relation:mein}, hat die ganze Nacht geweint. {person, select, f {{thing:Ihr}} other {{thing:Sein}}} {thing, select, pl {liegen} other {liegt}} irgendwo auf {where:dem}, {clue}. Holst du {thing:ihn} zurück?',
  '{person} is lost': '{person} ist verschwunden',
  'Bring {person} home': 'Bring {person} nach Hause',
  '{person}, my {relation:lower}, went chasing a glowing moth down to {where:the}, and that was days ago! The last anyone saw, {clue}. Please find {person:him}.':
    '{person}, {relation:mein}, ist einer leuchtenden Motte hinunter auf {where:den} nachgejagt, und das ist Tage her! Zuletzt gesehen: {clue}. Bitte finde {person:ihn}.',
  'I sent my {relation:lower} {person} to check the snares on {where:the}. {person} should have been back by dark. The tracks lead {clue}. Find {person:him}?':
    'Ich habe {relation:meinen} {person} geschickt, um die Schlingen auf {where:dem} nachzusehen. {person} hätte bei Einbruch der Dunkelheit zurück sein sollen. Die Spuren enden {clue}. Findest du {person:ihn}?',
  'My {relation:lower} {person} went to map {where:the} on {person:his} own. {person:His} last note says {clue}. Then nothing. Please find {person:him}!':
    '{relation:Mein} {person} wollte {where:den} allein kartieren. {person, select, f {Ihre} other {Seine}} letzte Notiz sagt: {clue}. Dann nichts mehr. Bitte finde {person:ihn}!',
  'X marks the spot': 'Das Kreuz markiert die Stelle',
  'An old map scrap': 'Ein alter Kartenfetzen',
  'Buried on {where:the}': 'Vergraben auf {where:dem}',
  'This scrap of map fell out of an old book. The cross is on {where:the}, {clue}. Whatever is there, you can have it. I only want the story.':
    'Dieser Kartenfetzen ist aus einem alten Buch gefallen. Das Kreuz ist auf {where:dem}, {clue}. Was auch immer dort ist, du kannst es haben. Ich will nur die Geschichte hören.',
  'My grandfather drew this map and never went back for what he hid. The cross is on {where:the}, {clue}. If you find it, it is yours.':
    'Mein Großvater hat diese Karte gezeichnet und nie geholt, was er versteckt hat. Das Kreuz ist auf {where:dem}, {clue}. Wenn du es findest, gehört es dir.',
  'A traveller paid for a bowl of soup with this map. Soup! The cross is on {where:the}, {clue}. Go and see what is there; keep it.':
    'Ein Reisender hat eine Schüssel Suppe mit dieser Karte bezahlt. Suppe! Das Kreuz ist auf {where:dem}, {clue}. Geh nachsehen, was dort ist; behalte es.',
  'This map was in a crate I bought for its nails. The cross is on {where:the}, {clue}. Treasure is not my trade; iron is. Go and keep what you find.':
    'Diese Karte lag in einer Kiste, die ich wegen der Nägel gekauft habe. Das Kreuz ist auf {where:dem}, {clue}. Schätze sind nicht mein Handwerk, Eisen schon. Geh hin und behalte, was du findest.',
  '{name} must go': '{name} muss weg',
  'The trouble with {name}': 'Ärger mit {name}',
  '{name} has a bad temper and worse breath. It prowls on {where:the}, {clue}. Make it go away for good, and the reward is yours.':
    '{name} hat schlechte Laune und noch schlechteren Atem. Es streift auf {where:dem} herum, {clue}. Sorg dafür, dass es für immer verschwindet, dann gehört die Belohnung dir.',
  '{bounty:cap} lives on {where:the}, {clue}. It has chased off three hunters and one very brave goat. Will you try? You, not the goat.':
    '{bounty:cap} lebt auf {where:dem}, {clue}. Es hat schon drei Jäger und eine sehr mutige Ziege verjagt. Versuchst du es? Du, nicht die Ziege.',
  '{name} stole a whole wheel of cheese from a cart on {where:the} and ran off {clue}, laughing. Monsters cannot laugh! This one can. Beat it!':
    '{name} hat auf {where:dem} einen ganzen Käselaib von einem Karren geklaut und ist lachend davongerannt, {clue}. Monster können nicht lachen! Dieses schon. Besiege es!',
  'I set three snares for {name}, on {where:the}, {clue}. It ate the snares. Then the bait. Then my hat. Beat it, and bring me the good news.':
    'Ich habe {name} drei Schlingen gestellt, auf {where:dem}, {clue}. Es hat die Schlingen gefressen. Dann den Köder. Dann meinen Hut. Besiege es und bring mir die gute Nachricht.',
  '{name} bent my best blade like a spoon. {kind:A}, on {where:the}, {clue}. Beat it, and I will forget the blade.':
    '{name} hat meine beste Klinge verbogen wie einen Löffel. {kind:Ein}, auf {where:dem}, {clue}. Besiege es, dann vergesse ich die Klinge.',
  'Here, wrap {thing:this} {thing:lower} up well. It is for {to}, {at}. Do not peek! Well, you may peek a little.':
    'Hier, pack {thing:diesen} gut ein. Das ist für {to}, {at}. Nicht reinschauen! Na gut, ein bisschen darfst du.',
  '{name} writes to me every year, and every year I forget to write back. This year I am sending {thing:this} {thing:lower} instead. You will find {to} {at}.':
    '{name} schreibt mir jedes Jahr, und jedes Jahr vergesse ich zu antworten. Dieses Jahr schicke ich stattdessen {thing:diesen}. Du findest {to} {at}.',
  '{name}: {said}': '{name}: {said}',
  'A word with {name}': 'Ein Wort mit {name}',
  '{to} ({at}) has sharp eyes and a long memory, and my {thing:lower} went missing down there. Ask {name}, then bring {thing:it} home.':
    '{to} ({at}) hat scharfe Augen und ein gutes Gedächtnis, und {thing:mein} {thing, select, pl {sind} other {ist}} dort unten verschwunden. Frag {name}, dann bring {thing:ihn} nach Hause.',
  '{name}: Oh, that! I saw {thing:it} just the other day, on {where:the}, {clue}. Hurry, before something eats {thing:it}.':
    '{name}: Ach, {thing:der}! Ja, ich habe {thing:ihn} neulich gesehen, auf {where:dem}, {clue}. Beeil dich, bevor {thing:ihn} etwas frisst.',
  'Scattered {thing:pl}': 'Verstreute {thing:pl}',
  'I am making something wonderful, and I need {n} {thing:pl} for it. There are some on {where:the}, one {clue}. What am I making? A surprise!':
    'Ich baue etwas Wunderbares und brauche dafür {n} {thing:pl}. Auf {where:dem} liegen welche, eins {clue}. Was ich baue? Eine Überraschung!',
  'My cart lost a wheel on {where:the}, and while I fixed it, {n} {thing:pl} bounced off the back. One went {clue}. Pick them up for me?':
    'Mein Karren hat auf {where:dem} ein Rad verloren, und während ich es repariert habe, sind hinten {n} {thing:pl} heruntergehüpft. Eins ist {clue} gelandet. Sammelst du sie für mich auf?',
  'Behind the sealed door': 'Hinter der versiegelten Tür',
  '{keeper} gave me the key to a sealed door on {where:the}, in case of trouble. Well, this is trouble: the monsters are at the storehouse behind it. Go in and help!':
    '{keeper} hat mir den Schlüssel zu einer versiegelten Tür auf {where:dem} gegeben, für den Notfall. Tja, das ist der Notfall: Die Monster sind am Lagerhaus dahinter. Geh hinein und hilf!',
  'Hold the cart': 'Halt den Karren',
  "{keeper}'s cart": 'Der Karren von {keeper}',
  'My cart is full of good things, and the monsters can smell it from a depth away. They will come again soon. Stand with me by the cart and keep them off it!':
    'Mein Karren ist voller guter Sachen, und die Monster riechen das eine ganze Tiefe weit. Sie kommen bald wieder. Stell dich mit mir zum Karren und halt sie fern!',
  'Bell, cart, monsters: that is my whole life down here. Today it could be bell, cart, you! Stand by the cart and keep them off it until they give up.':
    'Glocke, Karren, Monster: Das ist mein ganzes Leben hier unten. Heute könnte es Glocke, Karren, du sein! Stell dich zum Karren und halt sie fern, bis sie aufgeben.',

  // how the givers talk (core/questvoices.js): hello, bye, thanks, and when you come to talk
  '{hello} {body}': '{hello} {body}',
  '{body} {bye}': '{body} {bye}',
  '{hello} {body} {bye}': '{hello} {body} {bye}',
  '{giver:The}: {said}': '{giver:Der}: {said}',
  'Sit down, take a stool.': 'Setz dich, nimm dir einen Hocker.',
  'Oh, it is you! Just the one I wanted to see.': 'Oh, du bist es! Genau dich wollte ich sehen.',
  'Psst. Lean in, I have heard something.': 'Psst. Komm näher, ich hab was gehört.',
  'There is a warm bowl of soup in it for you.': 'Dafür gibt es eine warme Schüssel Suppe.',
  'And not a word to the groom. He gossips.': 'Und kein Wort zum Stallburschen. Der tratscht.',
  'Ha! I knew you would do it. The soup is on the house tonight.': 'Ha! Ich wusste, dass du es schaffst. Die Suppe geht heute aufs Haus.',
  'Wonderful! Wait until the others hear about this.': 'Wunderbar! Wenn das erst die anderen hören!',
  'Sit down a moment, I have a favour to ask.': 'Setz dich kurz, ich hätte da eine Bitte.',
  'Back already? Tell me everything!': 'Schon zurück? Erzähl mir alles!',
  'Still out there on that errand of mine? The soup will keep.': 'Noch für mich unterwegs? Die Suppe bleibt warm.',
  'Nothing new today. Come back when you have been further down; travellers bring stories.':
    'Heute gibt es nichts Neues. Komm wieder, wenn du weiter unten warst; Reisende bringen Geschichten mit.',
  'Easy, easy... Oh, sorry, I was talking to the horse.': 'Ruhig, ganz ruhig … Oh, Entschuldigung, ich hab mit dem Pferd geredet.',
  'Hello! Mind the hooves.': 'Hallo! Pass auf die Hufe auf.',
  'The horses like you. I can tell by their ears.': 'Die Pferde mögen dich. Das sehe ich an ihren Ohren.',
  'The horses and I will be waiting.': 'Die Pferde und ich warten auf dich.',
  'Take a carrot for the road. No? More for the horses, then.': 'Nimm eine Karotte für unterwegs. Nein? Dann mehr für die Pferde.',
  'You did it! Even the old mare looks impressed.': 'Du hast es geschafft! Sogar die alte Stute sieht beeindruckt aus.',
  'Thank you! I would give you a horse, but they would miss me.': 'Danke! Ich würde dir ein Pferd schenken, aber sie würden mich vermissen.',
  'Could you help me? The horses cannot, they have no hands.': 'Kannst du mir helfen? Die Pferde können es nicht, sie haben keine Hände.',
  'You are back! The horses heard you coming.': 'Du bist zurück! Die Pferde haben dich kommen hören.',
  'No hurry. Well, a little hurry.': 'Keine Eile. Na ja, ein bisschen Eile.',
  'Nothing for you just now. I have six horses to brush.': 'Gerade habe ich nichts für dich. Ich muss sechs Pferde striegeln.',
  'Hm. Strong arms. Good.': 'Hm. Starke Arme. Gut.',
  'Stand back from the sparks.': 'Weg von den Funken.',
  'Clang! Sorry. What? Oh. Listen.': 'Kling! Entschuldige. Was? Ach so. Hör zu.',
  'Do not come back dented.': 'Komm nicht verbeult zurück.',
  'Go on, then. The iron will not wait.': 'Na los. Das Eisen wartet nicht.',
  'Hm. Good work. Solid.': 'Hm. Gute Arbeit. Solide.',
  'Not bad. Not bad at all. Here.': 'Nicht schlecht. Gar nicht schlecht. Hier.',
  'Got a job for you. Hard work, fair pay.': 'Hab Arbeit für dich. Harte Arbeit, fairer Lohn.',
  'Back. Done?': 'Zurück. Erledigt?',
  'Still working on it? So am I.': 'Noch dran? Ich auch.',
  'Nothing. Go deeper, then ask again.': 'Nichts. Geh tiefer, dann frag wieder.',
  'Shh, the rabbits are sleeping.': 'Pst, die Kaninchen schlafen.',
  'Hello! Careful, the ferret bites. Only a little.': 'Hallo! Vorsicht, das Frettchen beißt. Nur ein bisschen.',
  'Oh! You look like somebody animals trust.': 'Oh! Du siehst aus wie jemand, dem Tiere vertrauen.',
  'The bunnies send their best wishes.': 'Die Häschen lassen dich grüßen.',
  'Be kind to anything small and fluffy down there. Unless it bites.': 'Sei nett zu allem, was da unten klein und flauschig ist. Außer es beißt.',
  'Oh, thank you! The rabbits are doing a happy dance.': 'Oh, danke! Die Kaninchen machen einen Freudentanz.',
  'You are wonderful. The ferret thinks so too, he just will not say.': 'Du bist wunderbar. Das Frettchen findet das auch, es sagt es nur nicht.',
  'Could you help? It is important. Well, the rabbits think so.': 'Kannst du helfen? Es ist wichtig. Na ja, die Kaninchen finden das.',
  'You are back! Quick, before the ferret gets out!': 'Du bist zurück! Schnell, bevor das Frettchen rauskommt!',
  'How is it going? The rabbits keep asking.': 'Wie läuft es? Die Kaninchen fragen dauernd.',
  'Nothing today. Feeding time!': 'Heute nichts. Fütterungszeit!',
  'Do not touch the green one. Or the blue one. Now, listen.': 'Nicht den grünen anfassen. Und nicht den blauen. So, hör zu.',
  'Sniff. Do you smell burnt sugar? Never mind.': 'Schnupper. Riechst du verbrannten Zucker? Egal.',
  'Ah, perfect timing. My cauldron just stopped smoking.': 'Ah, genau richtig. Mein Kessel hat gerade aufgehört zu qualmen.',
  'If you meet anything that glows, do not lick it.': 'Wenn dir etwas begegnet, das leuchtet: nicht ablecken.',
  'Try not to come back a different colour.': 'Versuch, nicht in einer anderen Farbe zurückzukommen.',
  'Marvellous! That deserves a fizzy drink.': 'Großartig! Darauf einen Brausetrank.',
  'Splendid! I will name a potion after you. A nice one.': 'Prächtig! Ich benenne einen Trank nach dir. Einen netten.',
  'I need a pair of brave hands. Mine are sticky.': 'Ich brauche ein Paar mutige Hände. Meine kleben.',
  'Back in one piece! And the right colour!': 'Heil zurück! Und in der richtigen Farbe!',
  'Still at it? Good. So is my cauldron.': 'Noch dabei? Gut. Mein Kessel auch.',
  'Nothing for you just now, unless you want to taste something.': 'Gerade nichts für dich, außer du willst etwas probieren.',
  'The stars whispered you would come.': 'Die Sterne haben geflüstert, dass du kommst.',
  'Hush. The crystal ball is cloudy today, but I see you clearly.': 'Still. Die Kristallkugel ist heute trüb, aber dich sehe ich klar.',
  'Ah. Your shadow has a lovely shape.': 'Ah. Dein Schatten hat eine schöne Form.',
  'May the glass keep you.': 'Möge das Glas dich bewahren.',
  'Walk softly. The deep has ears.': 'Geh leise. Die Tiefe hat Ohren.',
  'Just as the crystal ball said. Well, nearly.': 'Genau wie die Kristallkugel gesagt hat. Na ja, fast.',
  'The stars are pleased. So am I.': 'Die Sterne sind zufrieden. Ich auch.',
  'The crystal ball showed me a task, and then it showed me you.': 'Die Kristallkugel hat mir eine Aufgabe gezeigt, und dann dich.',
  'I saw you coming. In the ball, and also through the gate.': 'Ich habe dich kommen sehen. In der Kugel, und auch durchs Tor.',
  'The ball says you are not done yet. The ball is always right.': 'Die Kugel sagt, du bist noch nicht fertig. Die Kugel hat immer recht.',
  'The ball is quiet. Come back when you have been deeper.': 'Die Kugel schweigt. Komm wieder, wenn du tiefer unten warst.',
  'Hm? Oh. A visitor. It has been years.': 'Hm? Oh. Besuch. Das ist Jahre her.',
  'Sit, sit. My knees do not like company, but I do.': 'Setz dich, setz dich. Meine Knie mögen keinen Besuch, aber ich schon.',
  'Shh. Listen to the quiet... Right. Now then.': 'Pst. Hör auf die Stille … So. Also dann.',
  'I will be here. I am always here.': 'Ich bin hier. Ich bin immer hier.',
  'Go slowly. Slow is how one gets old.': 'Geh langsam. Wer langsam geht, wird alt.',
  'Well, well. You came back. Most do not.': 'Sieh an. Du bist zurückgekommen. Die meisten kommen nicht zurück.',
  'Thank you. Here, take this; I have no use for it.': 'Danke. Hier, nimm das; ich brauche es nicht.',
  'You look like you have time. I have a little task.': 'Du siehst aus, als hättest du Zeit. Ich hätte da eine kleine Aufgabe.',
  'Back? Already? Or was it a year?': 'Zurück? Schon? Oder war das ein Jahr?',
  'No hurry. I have waited this long.': 'Keine Eile. Ich habe schon so lange gewartet.',
  'Nothing. Sit a while, if you like.': 'Nichts. Setz dich ein Weilchen, wenn du magst.',
  'Ah, a fellow adventurer!': 'Ah, noch jemand, der Abenteuer sucht!',
  'You there! Do you like maps? I love maps.': 'Du da! Magst du Karten? Ich liebe Karten.',
  'Hello! I have a blister, so you will have to go instead.': 'Hallo! Ich habe eine Blase am Fuß, also musst du statt mir gehen.',
  'Remember everything! I want every detail.': 'Merk dir alles! Ich will jede Einzelheit hören.',
  'Adventure awaits! Mine waits for my blister.': 'Das Abenteuer wartet! Meins wartet auf meine Blase.',
  'Splendid! That goes in my journal, with a drawing.': 'Prächtig! Das kommt in mein Tagebuch, mit Zeichnung.',
  'Ha! I knew you had the boots for it.': 'Ha! Ich wusste, du hast die richtigen Stiefel dafür.',
  'I have an expedition for you. A small one. Well, not that small.': 'Ich habe eine Expedition für dich. Eine kleine. Na ja, nicht so klein.',
  'You are back! Tell me everything!': 'Du bist zurück! Erzähl alles!',
  'Still exploring? Good. Do not rush the best bits.': 'Noch am Erkunden? Gut. Lass dir bei den schönsten Stellen Zeit.',
  'Nothing right now. My map has a hole where the deeper parts go.': 'Gerade nichts. Meine Karte hat ein Loch, wo die tieferen Teile hingehören.',
  'Watch your head, the roof is low.': 'Pass auf deinen Kopf auf, die Decke ist niedrig.',
  'Ho there! Mind the tracks.': 'He da! Vorsicht, die Schienen.',
  'Dusty down here, eh? You get used to it.': 'Staubig hier unten, was? Man gewöhnt sich dran.',
  'Keep your lamp lit.': 'Lass deine Lampe brennen.',
  'If the rocks start singing, run.': 'Wenn die Steine anfangen zu singen: lauf.',
  'Ha! Good as gold, you are.': 'Ha! Du bist Gold wert.',
  'Much obliged. Here, I dug this up for you.': 'Vielen Dank. Hier, das hab ich für dich ausgegraben.',
  'A job for you, if you are not afraid of the dark.': 'Eine Arbeit für dich, wenn du keine Angst im Dunkeln hast.',
  'Back from the deep! Well?': 'Zurück aus der Tiefe! Und?',
  'Still digging? Me too.': 'Noch am Graben? Ich auch.',
  'Nothing today. Only rocks, and more rocks.': 'Heute nichts. Nur Steine, und noch mehr Steine.',
  'Peace be with you.': 'Friede sei mit dir.',
  'May your road be gentle. Mine was not, which is why I need you.': 'Möge dein Weg sanft sein. Meiner war es nicht, darum brauche ich dich.',
  'I was praying for help, and here you are.': 'Ich habe um Hilfe gebetet, und da bist du.',
  'I will light a lamp for you.': 'Ich zünde eine Lampe für dich an.',
  'Go safely, and come back safely.': 'Geh behütet, und komm behütet zurück.',
  'My prayers were heard! Thank you.': 'Meine Gebete wurden erhört! Danke.',
  'Bless you, and bless your boots.': 'Gesegnet seist du, und deine Stiefel auch.',
  'Would you help me? My feet are tired from the road.': 'Hilfst du mir? Meine Füße sind müde vom Weg.',
  'You have come back! I lit a lamp for you.': 'Du bist zurückgekommen! Ich habe eine Lampe für dich angezündet.',
  'Patience is a kind of prayer. I am praying a lot.': 'Geduld ist auch eine Art Gebet. Ich bete gerade sehr viel.',
  'Nothing today. Rest here a moment, the lamps are warm.': 'Heute nichts. Ruh dich kurz aus, die Lampen sind warm.',
  'Quiet now, you will scare off the game.': 'Leise, sonst verscheuchst du das Wild.',
  'Careful where you step. Snares.': 'Pass auf, wo du hintrittst. Schlingen.',
  'Hm, fresh tracks. Yours, I think.': 'Hm, frische Spuren. Deine, glaube ich.',
  'Stay downwind of anything big.': 'Bleib unter dem Wind, wenn etwas Großes in der Nähe ist.',
  'Follow the tracks, not the noise.': 'Folg den Spuren, nicht dem Lärm.',
  'Good hunting! You have earned this.': 'Waidmannsheil! Das hast du dir verdient.',
  'Clean work. I could not have done better. Well, a little.': 'Saubere Arbeit. Besser hätte ich es nicht gemacht. Na ja, ein bisschen.',
  'I have a job, if you can walk quietly.': 'Ich hab eine Aufgabe, wenn du leise gehen kannst.',
  'Back. I heard you a mile off.': 'Zurück. Ich hab dich schon von Weitem gehört.',
  'Patience. The best catches take time.': 'Geduld. Die besten Fänge brauchen Zeit.',
  'Nothing today. The snares are empty, and so is my list.': 'Heute nichts. Die Schlingen sind leer, und meine Liste auch.',
  'Ah, excellent, a field assistant.': 'Ah, ausgezeichnet, eine Hilfe für die Feldforschung.',
  'Fascinating! Oh, I meant the moss, not you. Well, both.': 'Faszinierend! Oh, ich meinte das Moos, nicht dich. Na ja, beides.',
  'Have you read my book? No? Nobody has.': 'Hast du mein Buch gelesen? Nein? Niemand hat das.',
  'Take notes. Neat ones, please.': 'Mach dir Notizen. Ordentliche, bitte.',
  'Science thanks you. And so do I.': 'Die Wissenschaft dankt dir. Und ich auch.',
  'Remarkable! This will be a footnote. A long one.': 'Bemerkenswert! Das wird eine Fußnote. Eine lange.',
  'Excellent work. I shall mention you in chapter nine.': 'Ausgezeichnete Arbeit. Ich erwähne dich in Kapitel neun.',
  'I have a question only legs can answer. Yours, preferably.': 'Ich habe eine Frage, die nur Beine beantworten können. Am liebsten deine.',
  'Back! Results, please.': 'Zurück! Ergebnisse, bitte.',
  'Still collecting data? Take your time. Accuracy matters.': 'Noch beim Datensammeln? Lass dir Zeit. Genauigkeit zählt.',
  'Nothing for now. I am still reading.': 'Gerade nichts. Ich lese noch.',
  'Whoa! Oh, sorry, I thought you were a monster.': 'Hoppla! Oh, Verzeihung, ich dachte, du bist ein Monster.',
  'Hello, hello! Mind the wheels.': 'Hallo, hallo! Vorsicht, die Räder.',
  'Business is slow down here. Help is welcome.': 'Hier unten laufen die Geschäfte schlecht. Hilfe ist willkommen.',
  'I will keep the cart steady.': 'Ich halte den Karren ruhig.',
  'Safe roads to you.': 'Gute Fahrt.',
  'Much obliged! Here, straight off the cart.': 'Vielen Dank! Hier, frisch vom Karren.',
  'You saved my skin. And my flour, and my cider.': 'Du hast mir die Haut gerettet. Und mein Mehl, und meinen Most.',
  'I have work for you, paid in coin.': 'Ich hab Arbeit für dich, bezahlt in Münzen.',
  'There you are! How did it go?': 'Da bist du ja! Wie ist es gelaufen?',
  'Still out there? The cart and I are not going anywhere.': 'Noch unterwegs? Der Karren und ich laufen nicht weg.',
  'Nothing right now. Want to buy a wheel? No? Fair.': 'Gerade nichts. Willst du ein Rad kaufen? Nein? Verständlich.',
  '{name}: You found me! I was so scared. I will go straight back. Here, take this.': '{name}: Du hast mich gefunden! Ich hatte solche Angst. Ich gehe gleich zurück. Hier, nimm das.',
  '{name}: Is it safe? With you here, it is. I will go home now. Take this, please.': '{name}: Ist es sicher? Mit dir hier schon. Ich gehe jetzt nach Hause. Nimm das, bitte.',
  '{name}: Finally! My feet hurt and I am hungry. Thank you! Here, for you.': '{name}: Endlich! Mir tun die Füße weh, und ich habe Hunger. Danke! Hier, für dich.',

  // twists (core/quests.js TWISTS): guards, an ambush, somebody hurt
  '{story} {twist}': '{story} {twist}',
  '{person} may be hurt. Take a health potion along!': '{person} ist vielleicht verletzt. Nimm einen Heiltrank mit!',
  '{goal} (bring a health potion)': '{goal} (bring einen Heiltrank mit)',
  'Something waits there for whoever comes along. Keep your weapon ready.': 'Dort wartet etwas auf jeden, der vorbeikommt. Halt deine Waffe bereit.',
  'And it never goes anywhere without its gang of {enemy:pl}.': 'Und es ist nie ohne seine Bande unterwegs: lauter {enemy:pl}.',
  'And hurry: {enemy:pl} prowl all round {person:him}, and {person} will not come out while they are there.':
    'Und beeil dich: Um {person:ihn} herum streifen {enemy:pl}, und solange sie da sind, kommt {person} nicht heraus.',
  'Careful: a pack of {enemy:pl} has settled right there. Chase them off first.': 'Vorsicht: Genau dort hat sich ein Rudel {enemy:pl} niedergelassen. Verjag sie zuerst.',
  '{goal}, guarded by {enemy:pl}': '{goal} (bewacht: {enemy:pl})',
  'Its guards are still here! Beat them first.': 'Es wird noch bewacht! Besiege zuerst die Monster drumherum.',
  'An ambush!': 'Ein Hinterhalt!',
  '{name}: Help! Not while they are still here!': '{name}: Hilfe! Nicht, solange die noch hier sind!',
  '{name} is hurt and cannot walk. Bring a health potion!': '{name} ist verletzt und kann nicht laufen. Bring einen Heiltrank!',
  'Something is guarded here...': 'Hier wird etwas bewacht …',

  // the trial rooms (core/quests.js KINDS.trial): where they are, as said after "a room"
  'where the water rises': 'wo das Wasser steigt',
  'where the water stands up to the ceiling': 'wo das Wasser bis zur Decke steht',
  'where the floor falls away': 'wo der Boden wegbricht',
  'where you jump from stone to stone': 'wo man von Stein zu Stein springt',
  'where the cold bites': 'wo die Kälte beißt',
  'where the lightning strikes': 'wo der Blitz einschlägt',
  'where a beacon must be held': 'wo ein Leuchtfeuer gehalten werden muss',
  'where a warden guards a relic': 'wo ein Wärter ein Relikt bewacht',
  'where the fog sinks': 'wo der Nebel sinkt',
  'where the ice is slippery': 'wo das Eis glatt ist',
  'where mirrors bend a beam of light': 'wo Spiegel einen Lichtstrahl lenken',
  'where the braziers wait to be lit': 'wo Feuerschalen darauf warten, entzündet zu werden',
  'where crates wait to be pushed onto plates': 'wo Kisten darauf warten, auf Platten geschoben zu werden',
  'where a gate shuts too quickly': 'wo ein Tor zu schnell zufällt',
  'where runestones wait to be pressed in order': 'wo Runensteine darauf warten, der Reihe nach gedrückt zu werden',
  'where something strange waits': 'wo etwas Seltsames wartet',
  Trial: 'Prüfung',
  'The room on {where:the}': 'Der Raum auf {where:dem}',
  '{trial}': '{trial}',
  'There is a trial room on {where:the}, {room}. Nobody I know has ever got through it. Will you? Then come back and tell me how.':
    'Auf {where:dem} gibt es einen Prüfungsraum, {room}. Niemand, den ich kenne, hat ihn je geschafft. Schaffst du es? Dann komm zurück und erzähl mir, wie.',
  'My grandfather swore nobody could beat the trial room on {where:the}, {room}. Prove him wrong, and come back to tell me!':
    'Mein Großvater hat geschworen, dass niemand den Prüfungsraum auf {where:dem} schafft, {room}. Beweis ihm das Gegenteil und komm zurück, um es mir zu erzählen!',
  'People coming up from {where:the} talk about a trial room there, {room}. They all say it cannot be done. I say it can. Show them!':
    'Die Leute, die von {where:dem} heraufkommen, reden von einem Prüfungsraum dort, {room}. Alle sagen, das geht nicht. Ich sage, es geht. Zeig es ihnen!',
  'I have a theory about the trial room on {where:the}, {room}. The theory needs testing, and testing needs legs. Get through it, then come back with the results.':
    'Ich habe eine Theorie über den Prüfungsraum auf {where:dem}, {room}. Die Theorie muss geprüft werden, und dafür braucht es Beine. Schaff ihn, dann komm mit den Ergebnissen zurück.',
  'The trial room on {where:the}, {room}, beat me three times. Three! Your turn. Come back and tell me the trick.':
    'Der Prüfungsraum auf {where:dem}, {room}, hat mich dreimal geschlagen. Dreimal! Du bist dran. Komm zurück und verrat mir den Trick.',
  'The crystal ball shows me a trial room on {where:the}, {room}, and somebody getting through it. The somebody looks a lot like you.':
    'Die Kristallkugel zeigt mir einen Prüfungsraum auf {where:dem}, {room}, und jemanden, der ihn schafft. Dieser Jemand sieht dir sehr ähnlich.',
  'Get through the trial room on {where:the} ({trial})': 'Schaff den Prüfungsraum auf {where:dem} ({trial})',

  // the glassmaker's glass (core/quests.js KINDS.glass)
  'The humming bubble': 'Die summende Blase',
  'Something shines on {where:the}, {clue}: a bubble of glass, they say, that hums when you come near. Like the one that floated over the plaza! Go and hear what it says, then tell me.':
    'Auf {where:dem} leuchtet etwas, {clue}: eine Blase aus Glas, sagt man, die summt, wenn man näher kommt. Wie die, die über dem Platz schwebte! Geh hin und hör, was sie sagt, dann erzähl es mir.',
  'A traveller swears a bubble of glass on {where:the}, {clue}, whispered to him. Whispered! Go and listen to it, and come back to tell me what it said.':
    'Ein Reisender schwört, eine Blase aus Glas auf {where:dem} hätte ihm etwas zugeflüstert, {clue}. Geflüstert! Geh hin und hör zu, und komm zurück, um mir zu sagen, was sie gesagt hat.',
  'The crystal ball keeps showing me a bubble of star-glass on {where:the}, {clue}. It wants to be heard. Go and listen, then tell me.':
    'Die Kristallkugel zeigt mir immer wieder eine Blase aus Sternglas auf {where:dem}, {clue}. Sie will gehört werden. Geh hin und hör zu, dann erzähl es mir.',
  'At night I see a light down on {where:the}, {clue}, like a little moon in a bubble. I am too slow to go. Would you, and tell me what it is?':
    'Nachts sehe ich unten auf {where:dem} ein Licht, {clue}, wie ein kleiner Mond in einer Blase. Ich bin zu langsam, um hinzugehen. Gehst du und sagst mir, was es ist?',
  'Star-glass! On {where:the}, {clue}. They say it keeps what it closes round, even a voice. I must know whose. Go and listen, then come back.':
    'Sternglas! Auf {where:dem}, {clue}. Man sagt, es bewahrt, was es umschließt, sogar eine Stimme. Ich muss wissen, wessen. Geh hin und hör zu, dann komm zurück.',
  'Find the bubble of star-glass on {where:the}': 'Finde die Blase aus Sternglas auf {where:dem}',

  // somebody held by a horde (core/quests.js KINDS.prisoners)
  'Taken by the {enemy:pl}': 'Von den {enemy:pl} verschleppt',
  'Free {person}': 'Befrei {person}',
  'The horde of {enemy:pl} on {where:the} carried off my {relation:lower} {person}! Break the horde, every last one of them, and bring {person:him} home.':
    'Die Horde {enemy:pl} auf {where:dem} hat {relation:meinen} {person} verschleppt! Zerschlag die Horde, bis zum letzten, und bring {person:ihn} nach Hause.',
  '{person}, my {relation:lower}, went too close to the horde of {enemy:pl} on {where:the}, and now they will not let {person:him} go. Scatter them and set {person:him} free!':
    '{person}, {relation:mein}, ist der Horde {enemy:pl} auf {where:dem} zu nahe gekommen, und jetzt lassen sie {person:ihn} nicht mehr gehen. Verjag sie und befrei {person:ihn}!',
  'I heard {person} calling from the middle of the horde of {enemy:pl} on {where:the}. My {relation:lower}! I could not get past them. You can. Please!':
    'Ich habe {person} mitten aus der Horde {enemy:pl} auf {where:dem} rufen hören. {relation:Mein}! Ich bin nicht an ihnen vorbeigekommen. Du schaffst das. Bitte!',
  'Free {person} on {where:the}': 'Befrei {person} auf {where:dem}',
  'Find {person} on {where:the}, {clue}': 'Finde {person} auf {where:dem}, {clue}',
};
