// The bosses, live: the game's own models (src/render/gustomodel.js and the others, dressed by
// src/render/enemymodel.js dressEnemy in their colours), their clips played by a three.js mixer,
// and what the game moves on their bones on top of the clips (src/render/bossbones.js: Gusto's
// tentacles, Totnar's rolling ball and the skulls and sticks he loses). The numbers (health,
// level, size) come from the game's profiles (src/core/enemies.js). Drag to turn him.
import * as THREE from 'three';
import { GUSTO, TOTNAR, SQUARLO, SQUARLO_GIANT, FLIP, FOGGERY, MANSK, enemyProfile, guardianLevel } from '../../src/core/enemies.js';
import { BOSSES } from '../../src/core/bosses.js';
import { gustoModel } from '../../src/render/gustomodel.js';
import { totnarModel } from '../../src/render/totnarmodel.js';
import { squarloModel } from '../../src/render/squarlomodel.js';
import { flipModel } from '../../src/render/flipmodel.js';
import { foggeryModel } from '../../src/render/foggerymodel.js';
import { manskModel } from '../../src/render/manskmodel.js';
import { dressEnemy } from '../../src/render/enemymodel.js';
import { findTentacles, shakeTentacles, findShed, hideShed, findBall, turnBall } from '../../src/render/bossbones.js';
import { html, loop, t as tr, lang } from '../deck.js';

const depthOf = boss => Number(Object.keys(BOSSES).find(d => BOSSES[d] === boss));
// what each clip shows, and how to beat it (keys: the model's clip names, render/*model.js)
const BOSS = {
  gusto: { kind: GUSTO, model: gustoModel, clips: {
    walk: ['He floats. His eight tentacles never touch the floor and never stop shaking.', 'Er schwebt. Seine acht Tentakel berühren nie den Boden und zittern ununterbrochen.'],
    grab: ['Grab: he flings his arms wide and leans back. That is the warning: step out of reach! If he catches you, he lifts you up and throws you down.', 'Griff: Er reißt die Arme weit auf und lehnt sich zurück. Das ist die Warnung: Geh aus seiner Reichweite! Erwischt er dich, hebt er dich hoch und wirft dich zu Boden.'],
    stuck: ['A grab that catches nothing: he falls flat on his face. Hit him now, every blow does half again as much!', 'Ein Griff ins Leere: Er fällt flach aufs Gesicht. Jetzt zuschlagen, jeder Treffer macht anderthalbmal so viel!'],
    inhale: ['Breathing in: keep away from him too long and he sucks you towards his mouth. Step sideways out of his breath.', 'Einatmen: Bleibst du zu lange weg, saugt er dich zu seinem Mund. Geh seitwärts aus seinem Atem.'],
    summon: ['He spits out little Custo triangles, up to three. At half his health he splits into three Gustos: only one is real, the others go up in a cloud at one hit.', 'Er spuckt kleine Custo-Dreiecke aus, bis zu drei. Bei halber Gesundheit teilt er sich in drei Gustos: Nur einer ist echt, die anderen lösen sich beim ersten Treffer in eine Wolke auf.'],
    blow: ['Vortex (after the split): air spirals into his hands, then he blows you back. Step out of the cone before it blows.', 'Wirbel (nach dem Teilen): Luft wirbelt in seine Hände, dann bläst er dich weg. Geh aus dem Kegel, bevor er bläst.'],
    death: ['Beaten! The well down opens.', 'Besiegt! Der Brunnen nach unten öffnet sich.'],
  } },
  totnar: { kind: TOTNAR, model: totnarModel, clips: {
    walk: ['A tumbleweed of sticks and leaves, with three skulls. His heart of embers burns in the middle.', 'Ein Steppenläufer aus Stöcken und Blättern, mit drei Schädeln. In der Mitte glüht sein Herz aus Glut.'],
    throw: ['Skull throw: he pulls a skull out of his sticks and hurls it. Where it lands, it comes alive as a snapping skull.', 'Schädelwurf: Er zieht einen Schädel aus seinen Stöcken und schleudert ihn. Wo er landet, wird er lebendig: ein schnappender Schädel.'],
    gloom: ['The dark: he sucks the light into his heart and the whole room goes dark. Braziers burn round his arena, and your own light shines.', 'Die Dunkelheit: Er saugt das Licht in sein Herz, und der ganze Raum wird dunkel. Um seine Arena brennen Feuerschalen, und dein eigenes Licht leuchtet.'],
    summon: ['He tears his ball open: twig spiders pour out (with two skulls), bramble Stunders (with one).', 'Er reißt seine Kugel auf: Zweig-Spinnen strömen heraus (mit zwei Schädeln), Dornen-Stunder (mit einem).'],
    roll: ['Roll (with two skulls): he spins up in place, then rolls at you. Get out of his way! After the roll he sits dizzy: hit him.', 'Rollen (mit zwei Schädeln): Er dreht sich auf der Stelle auf, dann rollt er auf dich zu. Geh ihm aus dem Weg! Nach dem Rollen sitzt er schwindlig da: Schlag zu.'],
    storm: ['Storm (with one skull): crackling rings under you, then lightning from the sky. Step out of the rings!', 'Sturm (mit einem Schädel): Knisternde Ringe unter dir, dann Blitze vom Himmel. Geh aus den Ringen!'],
    death: ['Beaten! The light comes back for good.', 'Besiegt! Das Licht kommt für immer zurück.'],
  } },
  squarlo: { kind: SQUARLO, giant: SQUARLO_GIANT, model: squarloModel, clips: {
    walk: ['Tiny and very fast: faster than you can run. No water drowns him.', 'Winzig und sehr schnell: schneller, als du rennen kannst. Kein Wasser kann ihn ertränken.'],
    swim: ['In deep water he paddles about.', 'In tiefem Wasser paddelt er herum.'],
    blow: ['Jet: water gathers in his hands, then a jet blows you back. Step out of its way before it blows.', 'Strahl: Wasser sammelt sich in seinen Händen, dann bläst dich ein Strahl zurück. Geh aus dem Weg, bevor er bläst.'],
    cast: ['He calls the tide! The water rises over the flats: get up a hill. Nothing hurts him while he calls it.', 'Er ruft die Flut! Das Wasser steigt über die Ebene: Rauf auf einen Hügel! Solange er ruft, tut ihm nichts weh.'],
    summon: ['He slaps the floor and Squirtles pop out of it.', 'Er schlägt auf den Boden, und Squirtles springen heraus.'],
    rest: ['Out of breath: after the tide (and every few attacks) he has to sit down. Hit him now, every blow does more!', 'Außer Atem: Nach der Flut (und alle paar Angriffe) muss er sich hinsetzen. Jetzt zuschlagen, jeder Treffer macht mehr!'],
    stride: ['At half his health he grows into a giant, six cells tall, and stomps about.', 'Bei halber Gesundheit wächst er zu einem Riesen, sechs Felder hoch, und stapft herum.'],
    stomp: ['Stomp (as a giant): his foot\'s shadow follows you. Get out from under it! Then his foot is stuck: hit it.', 'Stampfen (als Riese): Der Schatten seines Fußes folgt dir. Raus da! Danach steckt sein Fuß fest: Schlag drauf.'],
    death: ['Beaten! His water drains away.', 'Besiegt! Sein Wasser läuft ab.'],
  } },
  flip: { kind: FLIP, model: flipModel, clips: {
    walk: ['Three rings of little rings. He floats, and now and then his rings start to turn.', 'Drei Ringe aus kleinen Ringen. Er schwebt, und ab und zu fangen seine Ringe an, sich zu drehen.'],
    throw: ['Ball: he leans back and throws a ball of light out of his top ring. At half his health he throws three at once.', 'Ball: Er lehnt sich zurück und wirft einen Lichtball aus seinem oberen Ring. Bei halber Gesundheit wirft er drei auf einmal.'],
    flip: ['Flip! He cartwheels, and the whole world turns over: a wall becomes the floor, and his tractor beam sets you down on it. Upside down, on the floating island; sometimes up on a balcony. Then the walls round you break open.', 'Flip! Er schlägt ein Rad, und die ganze Welt kippt um: Eine Wand wird zum Boden, und sein Traktorstrahl setzt dich darauf ab. Kopfüber auf der schwebenden Insel, manchmal oben auf einem Balkon. Dann brechen die Wände um dich herum auf.'],
    hole: ['Black holes (at half his health): it goes dark, and they pull you in. Run away! Swallowed, you come out of another one after the world has flipped.', 'Schwarze Löcher (bei halber Gesundheit): Es wird dunkel, und sie ziehen dich hinein. Lauf weg! Verschluckt, kommst du aus einem anderen wieder heraus, nachdem die Welt gekippt ist.'],
    summon: ['He bows and light blue Sky wollas come out of his rings.', 'Er verbeugt sich, und hellblaue Himmels-Wollas kommen aus seinen Ringen.'],
    death: ['Beaten! His rings fall apart, and the world turns the right way up again.', 'Besiegt! Seine Ringe fallen auseinander, und die Welt dreht sich wieder richtig herum.'],
  } },
  foggery: { kind: FOGGERY, model: foggeryModel, clips: {
    walk: ['A frog, a little taller than you, with big yellow eyes on top of his head. He waits at the foot of his tower. Once you are on the ramp the lava rises, Fire-faces wait for you up the ramp, and he waddles up after you.', 'Ein Frosch, ein bisschen größer als du, mit großen gelben Augen oben auf dem Kopf. Er wartet unten an seinem Turm. Sobald du auf der Rampe bist, steigt die Lava, Feuergesichter warten oben auf der Rampe auf dich, und er watschelt hinter dir her.'],
    eyeL: ['He plucks out one of his eyes and throws it at you! It grows back.', 'Er reißt sich ein Auge heraus und wirft es nach dir! Es wächst wieder nach.'],
    eyeR: ['The other eye, while the first one grows back.', 'Das andere Auge, während das erste nachwächst.'],
    summon: ['He puffs up and croaks: Fire-faces come out of his mouth.', 'Er bläst sich auf und quakt: Feuergesichter kommen aus seinem Maul.'],
    float: ['At a third of his health he curls up into a ball with a shield. Two Fire-cats guard him: kill both, then hit him quickly before new ones come!', 'Bei einem Drittel seiner Gesundheit rollt er sich zu einer Kugel mit einem Schild zusammen. Zwei Feuerkatzen beschützen ihn: Besiege beide und schlag ihn schnell, bevor neue kommen!'],
    spit: ['Fireball! At a sixth of his health he spits three at once, and the lava swallows the tower: jump onto the floating platforms!', 'Feuerball! Bei einem Sechstel seiner Gesundheit spuckt er drei auf einmal, und die Lava verschluckt den Turm: Spring auf die schwebenden Plattformen!'],
    geyser: ['Fire geysers: glowing rings follow you on the floor. Get out of them before the fire shoots up!', 'Feuergeysire: Glühende Ringe folgen dir auf dem Boden. Raus da, bevor das Feuer hochschießt!'],
    cats: ['He spins round and calls two new Fire-cats. While one of them lives, nothing hurts him.', 'Er dreht sich und ruft zwei neue Feuerkatzen. Solange eine davon lebt, kann ihm nichts etwas anhaben.'],
    death: ['Beaten! The lava drains away, and his well opens on the floor of the caldera.', 'Besiegt! Die Lava fließt ab, und sein Brunnen öffnet sich unten im Krater.'],
  } },
  // (his ribbons are no part of the model: the game runs them as ropes, so here his horns are only broken off)
  mansk: { kind: MANSK, model: manskModel, broken: new Set(['lash', 'whirl']), names: { spit: ['spit out', 'ausspucken'], orbs: ['balls of light', 'Lichtkugeln'],
    slow: ['slow time', 'Zeitlupe'], lash: ['ribbons', 'Bänder'], whirl: ['whirl', 'wirbeln'], rise: ['fly up', 'aufsteigen'], break: ['horns break', 'Hörner brechen'] }, clips: {
    walk: ['A mask, floating with nobody behind it, on the stage of a museum. His horns wave like weed.', 'Eine Maske, die schwebt, ohne dass jemand dahinter ist, auf der Bühne eines Museums. Seine Hörner wehen wie Seegras.'],
    inhale: ['Breathing in: he lands, rears back with his mouth open wide (the warning), then sucks you towards his mouth. Run away, or step sideways out of his breath!', 'Einatmen: Er landet, lehnt sich mit weit offenem Mund zurück (die Warnung) und saugt dich dann zu seinem Mund. Lauf weg oder geh seitwärts aus seinem Atem!'],
    spit: ['Got you: in his mouth he chews you twice and spits you out. That hurts a lot!', 'Erwischt: In seinem Mund kaut er dich zweimal und spuckt dich aus. Das tut sehr weh!'],
    orbs: ['Balls of light gather at his horns, hang there a moment, then shoot at you and burst. A ring on the floor shows where: get out of it!', 'An seinen Hörnern sammeln sich Lichtkugeln, schweben einen Moment, schießen dann auf dich und platzen. Ein Ring auf dem Boden zeigt, wo: Raus da!'],
    summon: ['He spins round, and Tornados whirl up round him.', 'Er dreht sich, und um ihn herum wirbeln Tornados hoch.'],
    rise: ['At two thirds of his health he roars and flies up, out of your sword\'s reach. Shoot him, or wait until he lands.', 'Bei zwei Dritteln seiner Gesundheit brüllt er und fliegt hoch, außer Reichweite deines Schwerts. Schieß auf ihn oder warte, bis er landet.'],
    slow: ['Slow time: his diamond glows, and you and his Tornados go slower. He does not!', 'Zeitlupe: Sein Diamant leuchtet, und du und seine Tornados werden langsamer. Er nicht!'],
    break: ['At a third of his health his horns break, and long red ribbons come out, like the ties of a mask.', 'Bei einem Drittel seiner Gesundheit brechen seine Hörner ab, und lange rote Bänder kommen heraus, wie die Bänder einer Maske.'],
    lash: ['Ribbons: they reach for you, wrap round you and squeeze, then let you go. Keep out of their reach in front of him!', 'Bänder: Sie greifen nach dir, wickeln sich um dich und quetschen dich, dann lassen sie dich los. Bleib vorne aus ihrer Reichweite!'],
    whirl: ['Whirl: he spins round twice, his ribbons sweeping all round him. Get away from him!', 'Wirbeln: Er dreht sich zweimal, und seine Bänder fegen rund um ihn herum. Weg von ihm!'],
    death: ['Beaten! He sinks to the floor, his ribbons falling slack.', 'Besiegt! Er sinkt zu Boden, und seine Bänder fallen schlaff herab.'],
  } },
};
const NAMES = { walk: ['move', 'laufen'], death: ['death', 'Tod'], grab: ['grab', 'Griff'], stuck: ['fallen', 'hingefallen'], inhale: ['breathe in', 'einatmen'],
  summon: ['summon', 'rufen'], blow: ['blow', 'blasen'], throw: ['throw', 'werfen'], gloom: ['dark', 'dunkel'], roll: ['roll', 'rollen'],
  storm: ['storm', 'Sturm'], swim: ['swim', 'schwimmen'], cast: ['tide', 'Flut'], rest: ['rest', 'ausruhen'], stride: ['stride', 'stapfen'], stomp: ['stomp', 'stampfen'],
  flip: ['flip', 'kippen'], hole: ['black hole', 'schwarzes Loch'], eyeL: ['left eye', 'linkes Auge'], eyeR: ['right eye', 'rechtes Auge'],
  float: ['ball', 'Kugel'], spit: ['fireball', 'Feuerball'], geyser: ['geysers', 'Geysire'], cats: ['fire cats', 'Feuerkatzen'] };
const LOOPS = new Set(['walk', 'swim', 'stride', 'float']);

export default function mount(el) {
  const W = 640, H = 400, cnv = document.createElement('canvas');
  cnv.style.aspectRatio = `${W} / ${H}`; el.append(cnv);
  const renderer = new THREE.WebGLRenderer({ canvas: cnv, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W, H, false);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0f18');
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 400);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3326, 1.4));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.2); sun.position.set(3, 6, 4); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.4); rim.position.set(-4, 3, -5); scene.add(rim);
  const floor = new THREE.Group(); scene.add(floor);

  const bossRow = html(el, `<div class="row">${Object.keys(BOSS).map(b => `<button data-b="${b}">${BOSS[b].kind.label}</button>`).join('')}<span class="extra"></span></div>`);
  const clipRow = html(el, '<div class="row"></div>');
  const out = html(el, '<div class="out"></div>');
  const extra = bossRow.querySelector('.extra');

  let boss = 'gusto', stage = 1, giant = false, view = null, clip = 'walk', yaw = 0, spinning = true, t0 = 0, turned = 0, rolling = 0;

  // one boss as the game dresses him: his model in his kind's colours, at his size
  function build() {
    const b = BOSS[boss], kind = giant ? b.giant : b.kind, prefab = b.model;
    if (view) { floor.remove(view.model); view.mixer.stopAllAction(); }
    const { model } = dressEnemy(prefab, kind);
    const size = kind.size ?? 1;
    model.scale.multiplyScalar(size);
    floor.add(model);
    const mixer = new THREE.AnimationMixer(model), actions = {};
    const clips = { walk: prefab.walk, ...prefab.gaits, ...prefab.attacks, death: prefab.death };
    for (const [name, c] of Object.entries(clips)) if (c) {
      const a = actions[name] = mixer.clipAction(c);
      if (!LOOPS.has(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    }
    const horns = ['hornL1', 'hornR1'].map(n => model.getObjectByName(n)).filter(Boolean);
    view = { model, mixer, actions, kind, size, horns, tentacles: kind.flail ? findTentacles(model) : [],
      shed: findShed(model, kind.shed), ball: findBall(model, kind.tumble) };
    // the floor: one cell a square, as far as he is big
    floor.remove(...floor.children.filter(o => o !== model));
    const cells = Math.max(4, Math.ceil(kind.height * 1.6));
    const grid = new THREE.GridHelper(cells, cells, 0x3a4658, 0x232b38); grid.position.y = 0.001; floor.add(grid);
    const h = kind.height;
    camera.position.set(0, h * 0.6, h * 2.1 + 0.9); camera.lookAt(0, h * 0.46, 0);
    const lv = guardianLevel(depthOf(boss), 'descent'), p = enemyProfile(kind, lv);
    out.innerHTML = tr(`<b>${kind.label}</b>, the boss of depth ${depthOf(boss)} · level ${lv} · health <b>${p.hp}</b> · <b>${fmt(h)}</b> cells tall`,
      `<b>${kind.label}</b>, der Boss von Tiefe ${depthOf(boss)} · Level ${lv} · Gesundheit <b>${p.hp}</b> · <b>${fmt(h)}</b> Felder hoch`)
      + `<br><span class="say"></span>`;
    play(giant ? 'stride' : 'walk');
  }
  const fmt = v => new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 1 }).format(v);
  function play(name) {
    if (!view.actions[name]) name = 'walk';
    clip = name; t0 = 0;
    for (const [n, a] of Object.entries(view.actions)) if (n !== name) a.fadeOut(0.25);
    view.actions[name].reset().fadeIn(0.25).play();
    clipRow.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.c === name));
    const say = BOSS[boss].clips[name];
    out.querySelector('.say').textContent = say ? tr(...say) : '';
  }
  function pick(b) {
    boss = b; stage = 1; giant = false;
    bossRow.querySelectorAll('button[data-b]').forEach(x => x.classList.toggle('on', x.dataset.b === b));
    const prefab = BOSS[b].model, names = ['walk', ...Object.keys(prefab.gaits ?? {}), ...Object.keys(prefab.attacks), 'death'];
    clipRow.innerHTML = names.map(n => `<button data-c="${n}">${tr(...(BOSS[b].names?.[n] ?? NAMES[n] ?? [n, n]))}</button>`).join('');
    clipRow.querySelectorAll('button').forEach(x => x.onclick = () => {
      if (x.dataset.c === 'stomp' || x.dataset.c === 'stride') { if (!giant) { giant = true; build(); syncExtra(); } }
      else if (giant && x.dataset.c !== 'death' && x.dataset.c !== 'summon' && x.dataset.c !== 'cast' && x.dataset.c !== 'rest') { giant = false; build(); syncExtra(); }
      play(x.dataset.c);
    });
    extra.innerHTML = b === 'totnar'
      ? [1, 2, 3].map(s => `<button data-s="${s}">${tr(`${4 - s} skull${s === 3 ? '' : 's'}`, `${4 - s} Schädel`)}</button>`).join('')
      : b === 'squarlo' ? `<button data-g="1">${tr('giant', 'Riese')}</button>` : '';
    extra.querySelectorAll('[data-s]').forEach(x => x.onclick = () => { stage = +x.dataset.s; build(); syncExtra(); });
    extra.querySelectorAll('[data-g]').forEach(x => x.onclick = () => { giant = !giant; build(); syncExtra(); });
    build(); syncExtra();
  }
  function syncExtra() {
    extra.querySelectorAll('[data-s]').forEach(x => x.classList.toggle('on', +x.dataset.s === stage));
    extra.querySelectorAll('[data-g]').forEach(x => x.classList.toggle('on', giant));
  }
  bossRow.querySelectorAll('button[data-b]').forEach(x => x.onclick = () => pick(x.dataset.b));

  // drag to turn him
  let drag = null;
  cnv.addEventListener('pointerdown', e => { drag = e.clientX; spinning = false; cnv.setPointerCapture(e.pointerId); });
  cnv.addEventListener('pointermove', e => { if (drag === null) return; yaw += (e.clientX - drag) * 0.01; drag = e.clientX; });
  cnv.addEventListener('pointerup', () => { drag = null; });

  let ready = false, clock = 0;
  Promise.all(Object.values(BOSS).map(b => b.model.load())).then(() => {
    const broken = Object.values(BOSS).find(b => !b.model.ready);
    if (broken) { out.textContent = broken.model.error; return; }
    ready = true; pick('gusto');
  });
  loop(el, dt => {
    if (!ready) return;
    clock += dt; t0 += dt;
    if (spinning) yaw = 0.7 * Math.sin(clock * 0.45);   // (turning a little to and fro, his face to you, until dragged)
    view.model.rotation.y = yaw;
    view.mixer.update(dt);
    const a = view.actions[clip];
    if (!LOOPS.has(clip) && clip !== 'death' && t0 > a.getClip().duration + 0.5) play(giant ? 'stride' : 'walk');
    if (clip === 'death' && t0 > a.getClip().duration + 1.5) play(giant ? 'stride' : 'walk');
    // on top of the clip, as the game does (render/enemies.js)
    if (view.tentacles.length) shakeTentacles(view.tentacles, clock, (view.kind.flail ?? 1) * (clip === 'death' ? Math.max(0, 1 - t0) : 1));
    if (view.ball) {   // his roll: spinning up in place, then rolling at the player
      const roll = clip === 'roll' && view.kind.attacks.find(x => x.roll)?.roll, radius = view.kind.tumble * view.size;
      const want = !roll ? 0 : t0 < roll.from ? roll.speed / radius * (t0 / roll.from) ** 2 : t0 < roll.to ? roll.speed / radius : 0;
      rolling += (want - rolling) * Math.min(1, dt * 12);
      turned = (turned + rolling * dt) % (2 * Math.PI);
      turnBall(view.ball, turned);
    }
    hideShed(view.shed, stage);
    if (BOSS[boss].broken?.has(clip)) for (const h of view.horns) h.scale.setScalar(0.001);   // (Mansk's horns broken off)
    renderer.render(scene, camera);
  });
  return () => { renderer.dispose(); renderer.forceContextLoss(); };
}
