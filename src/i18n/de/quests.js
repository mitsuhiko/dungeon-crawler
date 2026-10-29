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
  'in the merchant camp': 'im Händlerlager',

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
  'No quests going on. Talk to the villagers in town and in the merchant camp: a ! over one means a quest for you.':
    'Gerade läuft kein Auftrag. Sprich mit den Leuten in der Stadt und im Händlerlager: Ein ! über jemandem heißt, da gibt es einen Auftrag für dich.',
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
};
