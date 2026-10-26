// The narrator's lines (core/narration.js, docs/story.md): the Glassmaker's voice. Each line's note
// there says when it comes and how it should feel. She never says Würfel; the glossary's words for
// the story are hers. The German is recorded too (docs/narration.md): write it to be spoken.
export default {
  // the opening
  "There you are! ...No. I'm sorry. For a moment you looked just like {sib, select, m {him} other {her}}.":
    'Da bist du ja! ...Nein. Entschuldige. Einen Moment lang sahst du genau aus wie {sib, select, m {er} other {sie}}.',
  "This is my town. I keep it in glass, like everything I don't want to lose.":
    'Das ist meine Stadt. Ich bewahre sie in Glas auf, wie alles, was ich nicht verlieren will.',
  "Past the trees is what I've forgotten: the Hidden. Nobody can see into it.":
    'Hinter den Bäumen liegt, was ich vergessen habe: das Verborgene. Niemand kann hineinsehen.',
  'Can you hear that hum? The Heart is beating again, deep down.': 'Hörst du das Summen? Das Herz schlägt wieder, tief unten.',
  "Something down there wants to be remembered. Follow the road, and I'll follow you.":
    'Da unten wartet etwas darauf, dass sich jemand erinnert. Folg der Straße, ich folge dir.',

  // the town and the camp
  'The inn. There was always soup on, whatever the hour.': 'Das Gasthaus. Da stand immer eine Suppe auf dem Herd, ganz egal, wie spät es war.',
  'The Smith let us work his bellows once. Only once.': 'Der Schmied hat uns einmal sein Feuer anfachen lassen. Ein einziges Mal.',
  "The rabbits! We named every single one. Then we couldn't tell them apart.":
    'Die Kaninchen! Wir haben jedem einzelnen einen Namen gegeben. Und dann konnten wir sie nicht mehr auseinanderhalten.',
  '{sib, select, m {My little brother} other {My little sister}} always wanted to ride the big grey horse. I held the reins and prayed.':
    '{sib, select, m {Mein kleiner Bruder wollte} other {Meine kleine Schwester wollte}} immer auf dem großen grauen Pferd reiten. Ich hielt die Zügel und betete.',
  'The traders came every summer. And we never had a single coin.': 'Die Händler kamen jeden Sommer. Und wir hatten nie auch nur eine einzige Münze.',
  'Never go out there without a potion or two. Trust me.': 'Geh nie ohne ein, zwei Tränke da hinaus. Glaub mir.',
  'The Enchanter. She makes a plain blade sing, for a price.': 'Die Verzauberin. Sie bringt eine schlichte Klinge zum Singen, gegen Bezahlung.',

  // the road out of town
  'Out here it gets wild. Keep your weapon handy: the grass bites.': 'Hier draußen wird es wild. Halt deine Waffe bereit: Das Gras beißt.',
  'We ran through these meadows every summer. The grass came up to my chin.': 'Durch diese Wiesen sind wir jeden Sommer gerannt. Das Gras ging mir bis ans Kinn.',
  '{sib, select, m {My brother} other {My sister}} was so small then. {sib, select, m {He} other {She}} held my hand on every bridge.':
    '{sib, select, m {Mein Bruder war} other {Meine Schwester war}} damals so klein. Auf jeder Brücke hielt {sib, select, m {er} other {sie}} meine Hand.',
  'Look at it all, floating as if it were nothing. Children never ask how.': 'Sieh nur, wie das alles schwebt, als wäre es nichts. Kinder fragen nie, wie das geht.',
  "Don't go too near the edge. I'd hate to remember you falling.": 'Geh nicht zu nah an den Rand. Ich will mich nicht daran erinnern, wie du hinunterfällst.',
  'I can still smell the hay. Funny, what stays.': 'Ich kann das Heu noch riechen. Komisch, was so hängen bleibt.',
  'Look how clear the glass is here. I must have been happy.': 'Sieh nur, wie klar das Glas hier ist. Ich muss glücklich gewesen sein.',

  // the first enemies, and fighting
  'Grass snakes. Mother said they were more afraid of us. They were not.': 'Grasnattern. Mutter sagte, die hätten mehr Angst vor uns. Hatten sie nicht.',
  "Spiders. I'm not saying I screamed. I'm saying somebody did.": 'Spinnen. Ich sage nicht, dass ich geschrien habe. Ich sage nur, dass jemand geschrien hat.',
  'That big one charges! Step aside, and let it run into something.': 'Der Große da stürmt los! Geh zur Seite und lass ihn gegen etwas rennen.',
  'A little thundercloud. Watch the ground: it crackles before it strikes.': 'Eine kleine Gewitterwolke. Achte auf den Boden: Es knistert, bevor der Blitz kommt.',
  "A whirlwind! Don't let it catch you. It doesn't put you down gently.": 'Ein Wirbelwind! Lass dich nicht erwischen. Er setzt dich nicht sanft wieder ab.',
  "Squirtles! They spit. It's rude, and it stings.": 'Squirtles! Die spucken. Das ist unhöflich, und es brennt.',
  'Flimmers always come in threes. Just like my aunties.': 'Flimmer kommen immer zu dritt. Genau wie meine Tanten.',
  "A lantern with a face. It burns, so don't get cosy.": 'Eine Laterne mit Gesicht. Sie brennt, also mach es dir nicht gemütlich.',
  'There! You fight just like your grandfather. He broke a lot of vases.': 'Na also! Du kämpfst genau wie dein Großvater. Der hat viele Vasen zerbrochen.',
  "Look at you! I'd tell you to be careful, but you wouldn't listen.": 'Sieh dich an! Ich würde ja sagen, pass auf, aber du hörst ja doch nicht.',
  'Watch them before they strike. Everything gives itself away.': 'Beobachte sie, bevor sie zuschlagen. Alles verrät sich vorher.',
  'Keep moving! Standing still is how they get you.': 'Bleib in Bewegung! Wer stillsteht, wird erwischt.',
  'You fight like {sib, select, m {my little brother} other {my little sister}}. All elbows, and no fear at all.':
    'Du kämpfst wie {sib, select, m {mein kleiner Bruder} other {meine kleine Schwester}}. Lauter Ellbogen und kein bisschen Angst.',
  'Too many of them? Step back, and let them come to you one by one.': 'Zu viele auf einmal? Geh einen Schritt zurück und lass sie einzeln zu dir kommen.',
  "Don't save your potions for later. Later is now.": 'Heb dir deine Tränke nicht für später auf. Später ist jetzt.',
  "Careful! You've gone all pale. Drink something.": 'Vorsicht! Du bist ja ganz blass. Trink etwas.',
  "Back off a little. Nobody's counting.": 'Zieh dich ein bisschen zurück. Niemand zählt mit.',
  'Ouch. I felt that one too.': 'Autsch. Das habe ich auch gespürt.',
  "No, no. That's not how it went. Let me start again.": 'Nein, nein. So war das nicht. Ich fange noch einmal an.',
  "Wait, that's wrong. That didn't happen.": 'Halt, das stimmt nicht. So ist das nicht passiert.',
  'No... I remember it differently. Once more.': 'Nein... ich erinnere mich anders. Noch einmal.',
  'You were always stubborn. Good. Up you get.': 'Du warst schon immer stur. Gut so. Hoch mit dir.',
  "You're getting stronger. Or I'm imagining you stronger. Either is fine.": 'Du wirst stärker. Oder ich stelle dich mir stärker vor. Beides ist recht.',
  'Stronger again. Your grandfather would never stop talking about it.': 'Schon wieder stärker. Dein Großvater würde gar nicht mehr aufhören, davon zu erzählen.',
  'A chest! We hid treasures everywhere. Mostly buttons.': 'Eine Truhe! Wir haben überall Schätze versteckt. Meistens Knöpfe.',
  "Another chest. I don't remember filling that one. How exciting.": 'Noch eine Truhe. Ich weiß gar nicht mehr, was ich da hineingetan habe. Wie spannend.',
  "Oh, that's a good one. Don't trade it for sweets.": 'Oh, das ist ein gutes Stück. Tausch es bloß nicht gegen Süßigkeiten.',
  'Help them, will you? They were always good to us.': 'Hilf ihnen, ja? Sie waren immer gut zu uns.',
  "That's a lot of them! Find a narrow spot, so they come one at a time.": 'Das sind aber viele! Such dir eine enge Stelle, dann kommen sie einzeln.',
  'Another crowd. Running away is allowed, you know.': 'Schon wieder so viele. Weglaufen ist übrigens erlaubt.',
  'Whoops! A gap in my memory. Mind those.': 'Hoppla! Eine Lücke in meiner Erinnerung. Pass auf die auf.',
  'Down you go again. I really must mend those holes.': 'Und wieder hinunter. Ich muss diese Löcher wirklich flicken.',
  "Take your time. I'm not going anywhere. Not yet.": 'Lass dir Zeit. Ich gehe nirgendwohin. Noch nicht.',
  'I do that too. Stand somewhere, and forget why.': 'Das mache ich auch. Irgendwo stehen und vergessen, warum.',
  'Home. The one place I never forget.': 'Zu Hause. Der einzige Ort, den ich nie vergesse.',
  "Back so soon? Good. Rest a little, the soup's on.": 'Schon zurück? Gut. Ruh dich ein bisschen aus, die Suppe steht auf dem Herd.',
  "Something guards that gate. I think I put it there, so I wouldn't have to go on.":
    'Etwas bewacht dieses Tor. Ich glaube, ich habe es selbst dorthin gestellt, damit ich nicht weitergehen muss.',
  'There. The gate is open. One fear fewer.': 'So. Das Tor ist offen. Eine Angst weniger.',
  'Another guard. I was a very careful child.': 'Noch eine Wache. Ich war ein sehr vorsichtiges Kind.',
  "Oh, this memory holds on to you. You'll have to live through it.": 'Oh, diese Erinnerung hält dich fest. Da musst du jetzt durch.',
  'There. That memory let go of you.': 'So. Die Erinnerung hat dich losgelassen.',
  'Never mind. Memories can be stubborn. Try again.': 'Macht nichts. Erinnerungen können stur sein. Versuch es noch einmal.',

  // Gusto
  'Oh. I know this place. This is where he waited.': 'Oh. Diesen Ort kenne ich. Hier hat er gewartet.',
  'Under the bed, in the dark. A grin, and nothing else.': 'Unter dem Bett, im Dunkeln. Ein Grinsen, sonst nichts.',
  "Gusto! I drew him, so he'd be less scary. It didn't work.": 'Gusto! Ich habe ihn gemalt, damit er weniger gruselig ist. Hat nicht geklappt.',
  'When his arms go wide, step back! He grabs.': 'Wenn er die Arme ausbreitet, geh zurück! Er packt zu.',
  'He missed, and fell flat on his face! Hit him now!': 'Daneben, und er liegt auf der Nase! Jetzt schlag zu!',
  "Little triangles! Don't let them crowd you.": 'Kleine Dreiecke! Lass dich nicht von ihnen umzingeln.',
  "He's breathing you in! Step sideways, not back.": 'Er saugt dich ein! Geh zur Seite, nicht zurück.',
  'Three of him! Only one is real. The others pop if you so much as touch them.': 'Drei von ihm! Nur einer ist echt. Die anderen platzen, sobald du sie nur berührst.',
  "He's blowing a gale! Get out of the way.": 'Er bläst einen Sturm! Geh aus dem Weg.',
  'I was so sure he was real. I suppose he was.': 'Ich war mir so sicher, dass es ihn wirklich gibt. Vielleicht gab es ihn ja auch.',
  "The well is open now. Jump in. I'll be right here.": 'Der Brunnen ist jetzt offen. Spring hinein. Ich bin gleich bei dir.',

  // depth 1
  'Down the well, and into summer. This is when I was small.': 'Den Brunnen hinunter, mitten in den Sommer. Da war ich noch klein.',
  'Everything was bigger then. Except {sib, select, m {my little brother} other {my little sister}}, who was tiny.':
    'Damals war alles größer. Nur {sib, select, m {mein kleiner Bruder} other {meine kleine Schwester}} nicht, {sib, select, m {der} other {die}} war winzig.',
  'That summer I made a bird of glass, my very first. It came out crooked, and {sib, select, m {my little brother} other {my little sister}} loved it anyway.':
    'In jenem Sommer habe ich einen Vogel aus Glas gemacht, meinen allerersten. Er war ganz schief, und {sib, select, m {mein kleiner Bruder hat} other {meine kleine Schwester hat}} ihn trotzdem geliebt.',
  'Mother called us in for dinner. We pretended not to hear.': 'Mutter rief uns zum Abendessen. Wir taten so, als hörten wir nichts.',
  'We collected flat stones, for skipping. {sib, select, m {My brother} other {My sister}} kept the best ones in a sock.':
    'Wir haben flache Steine gesammelt, zum Hüpfen übers Wasser. Die besten hat {sib, select, m {mein Bruder} other {meine Schwester}} in einer Socke aufbewahrt.',
  "We always came this way, we... Never mind. It doesn't matter.": 'Hier sind wir immer entlanggegangen, wir... Ach, egal. Ist nicht wichtig.',
  'This part is hazy. Give me a moment... There.': 'Dieser Teil ist verschwommen. Einen Moment... So.',
  "The days were longer then. I'm quite sure of it.": 'Die Tage waren damals länger. Da bin ich mir ganz sicher.',
  "We had a secret word, for when we were scared. I've forgotten it. Isn't that silly?":
    'Wir hatten ein geheimes Wort, für wenn wir Angst hatten. Ich habe es vergessen. Ist das nicht albern?',
  'Your grandfather would have liked this. He liked anything that floated.': 'Deinem Großvater hätte das gefallen. Er mochte alles, was schwebt.',

  // the themes of act I
  'Still the meadows. We had picnics here, and the ants always won.': 'Immer noch die Wiesen. Hier haben wir gepicknickt, und die Ameisen haben immer gewonnen.',
  'We lay in the grass and named the clouds. And then one day, we walked on them.': 'Wir lagen im Gras und gaben den Wolken Namen. Und eines Tages sind wir auf ihnen gelaufen.',
  "The lagoon. {sib, select, m {My little brother} other {My little sister}} couldn't swim yet, so I carried {sib, select, m {him} other {her}} on my back.":
    'Die Lagune. {sib, select, m {Mein kleiner Bruder} other {Meine kleine Schwester}} konnte noch nicht schwimmen, also trug ich {sib, select, m {ihn} other {sie}} auf dem Rücken.',
  'The terraces. Water on steps, all the way down. We raced paper boats here.': 'Die Terrassen. Wasser auf Stufen, ganz bis hinunter. Hier haben wir Papierschiffchen um die Wette fahren lassen.',
  "The dark forest. I held {sib, select, m {my little brother's} other {my little sister's}} hand all the way, and said I wasn't scared.":
    'Der dunkle Wald. Ich habe {sib, select, m {meinem kleinen Bruder} other {meiner kleinen Schwester}} den ganzen Weg die Hand gehalten und gesagt, ich hätte keine Angst.',
  'Snow! Our very first. Our snowman lasted longer than our mittens.': 'Schnee! Unser allererster. Unser Schneemann hat länger gehalten als unsere Handschuhe.',
  'The prayer flags. Grandmother tied a wish to every one. I wonder which came true.': 'Die Gebetsfahnen. Großmutter hat an jede einen Wunsch gebunden. Ich frage mich, welcher wahr geworden ist.',
  'The salt flats. Father brought us here once. White, all the way to the sky.': 'Die Salzebene. Vater hat uns einmal hierher mitgenommen. Weiß, bis zum Himmel.',
  "The badlands. Red rock and dust. We were explorers, and we'd lost our map.": 'Das Ödland. Roter Fels und Staub. Wir waren Entdecker und hatten unsere Karte verloren.',
  'The canyon. Shout, and it shouts back. Ours always came back giggling.': 'Die Schlucht. Wenn man ruft, ruft sie zurück. Bei uns kam immer ein Kichern zurück.',

  // Totnar
  'That summer was so dry, the grass crackled. And then something caught fire.': 'Der Sommer war so trocken, dass das Gras knisterte. Und dann fing etwas Feuer.',
  'Totnar. A heart smouldering in dead sticks. I was so angry that summer.': 'Totnar. Ein Herz, das in toten Zweigen glüht. Ich war so wütend in jenem Sommer.',
  "He's put the sun out! Stay near the fires, and watch for his skulls.": 'Er hat die Sonne ausgemacht! Bleib bei den Feuern und pass auf seine Schädel auf.',
  'Skulls! They come alive where they land. Keep moving.': 'Schädel! Wo sie landen, werden sie lebendig. Bleib in Bewegung.',
  "A skull's off! Now he rolls. Dodge him, then hit him while he's dizzy.": 'Ein Schädel ist ab! Jetzt rollt er. Weich ihm aus und schlag zu, solange ihm schwindlig ist.',
  'Twig spiders, pouring out of him! Thin them out.': 'Zweigspinnen, überall! Erledige sie, bevor es zu viele werden.',
  'The last skull. Watch the rings on the ground, and step out before the lightning.': 'Der letzte Schädel. Achte auf die Ringe am Boden und geh heraus, bevor der Blitz kommt.',
  'It burned out in the end. Anger does, if you let it.': 'Am Ende ist es ausgebrannt. Das macht Wut, wenn man sie lässt.',
  'I said sorry to Mother afterwards. That one, I did say.': 'Danach habe ich mich bei Mutter entschuldigt. Das eine Mal schon.',

  // depth 2
  "Deeper. We weren't allowed this far. So of course we came.": 'Tiefer. So weit durften wir nicht. Also sind wir natürlich hergekommen.',
  'I promised to look after {sib, select, m {my little brother} other {my little sister}}. I meant it, every single time.':
    'Ich habe versprochen, auf {sib, select, m {meinen kleinen Bruder} other {meine kleine Schwester}} aufzupassen. Ich habe es jedes Mal ernst gemeint.',

  // Squarlo
  'Look how small he is. Surely nothing to worry about.': 'Sieh nur, wie klein er ist. Kein Grund zur Sorge, oder?',
  "Squarlo. Just a little worry, that's all. Don't let him make waves.": 'Squarlo. Nur eine kleine Sorge, mehr nicht. Lass ihn keine Wellen schlagen.',
  "The water's rising! Up a hill, quick!": 'Das Wasser steigt! Schnell, auf einen Hügel!',
  "He's out of breath. Now's your chance!": 'Ihm geht die Puste aus. Jetzt hast du deine Chance!',
  'Water from his hands! Step out of the way before it comes.': 'Wasser aus seinen Händen! Geh aus dem Weg, bevor es kommt.',
  'More squirtles. Worries bring their friends.': 'Noch mehr Squirtles. Sorgen bringen ihre Freunde mit.',
  'And there it is. The little worry, all grown up.': 'Da haben wir es. Die kleine Sorge, ganz groß geworden.',
  "Watch the shadow of his foot! Don't be under it when it comes down.": 'Achte auf den Schatten seines Fußes! Steh nicht darunter, wenn er herunterkommt.',
  "He's jumping! Keep away from his shadow.": 'Er springt! Halt dich von seinem Schatten fern.',
  "It was such a little thing. Then it wasn't.": 'Es war so eine kleine Sache. Und dann nicht mehr.',
  'Worries shrink when you look at them. It took me years to learn that.': 'Sorgen schrumpfen, wenn man sie ansieht. Das habe ich erst nach Jahren gelernt.',

  // depth 3
  'Further down, the glass gets cloudy. Let me think.': 'Weiter unten wird das Glas trüb. Lass mich nachdenken.',
  'The rest will come back to me as we go. It always does. Eventually.': 'Der Rest fällt mir unterwegs wieder ein. Das tut er immer. Irgendwann.',

  // the opening film (film/opening.js): the glassmaker, a man, long after, recording in the dark
  'Nobody says my name any more. That is all right. Names do not keep in glass.':
    'Niemand sagt mehr meinen Namen. Das ist schon recht. Namen halten sich nicht in Glas.',
  'The star-readers saw the stone first. They read the sky for a hundred nights, and it never changed its mind.':
    'Die Sternleser sahen den Stein zuerst. Hundert Nächte lang lasen sie den Himmel, und er blieb dabei.',
  'Then they came to my door. Not to the guild. To me. I knew the old way of star-glass: glass that keeps what it holds, and rises.':
    'Dann kamen sie zu mir. Nicht zur Zunft. Zu mir. Ich kannte die alte Kunst des Sternglases: Glas, das bewahrt, was es umschließt, und steigt.',
  'I closed it round all I could. A town. A forest. A piece of the sea. My hands made every pane of the glass you live in.':
    'Ich schloss es um alles, was ich konnte. Eine Stadt. Einen Wald. Ein Stück vom Meer. Meine Hände haben jede Scheibe des Glases gemacht, das dich umschließt.',
  'I gave the ark its wings. When it rose, I went with it, to keep the glass whole.':
    'Ich gab der Arche ihre Flügel. Als sie aufstieg, ging ich mit, um das Glas heil zu halten.',
  'The wings were mine as well. They broke, and the ark fell, and I fell with it, below everything.':
    'Auch die Flügel stammten von mir. Sie brachen, die Arche fiel, und ich fiel mit ihr, tiefer als alles andere.',
  'Most of the pieces held. But the world is broken apart now, scattered through the dark.':
    'Die meisten Stücke haben gehalten. Aber die Welt ist jetzt zerbrochen, verstreut im Dunkel.',
  'So I blow my words into glass, and let them rise. I do not know where they come to rest.':
    'Also blase ich meine Worte in Glas und lasse sie steigen. Ich weiß nicht, wo sie zur Ruhe kommen.',
  'If this reaches you: I am down below, where no light reaches. Find me.':
    'Wenn dich das erreicht: Ich bin tief unten, wo kein Licht hinkommt. Finde mich.',
};
