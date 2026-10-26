// The main menu: before the game starts, and after "Save and quit" in the Esc menu
// (game/escmenu.js). The dev tools and ?seed= skip it (state.js mode; ?menu=1 shows it after all).
//   title       Continue (the chosen hero in its world; Start if nobody has been in it yet), Choose World, Join Game, Choose
//               Character, the settings (game/settingsmenu.js), the guide. No hero yet: it
//               says so, and OK goes to make one.
//   worlds      the chosen hero's world: one of the saved ones, a new random one, or a known one
//               (a world name or a number, core/names.js). Back to the title: Continue plays it.
//               Each world's name can be copied (to share it) and the world deleted here too.
//   join        a hero (it becomes the chosen one) and a friend's room code
//   joining     waiting for the friend's game; the hero comes along, the world is theirs (it
//               does not become the hero's world)
//   characters  up to three heroes (core/save.js MAX_HEROES): choose, edit (the name and the
//               gender), delete, make one (a name and a gender)
//   skins       the chosen hero's skin: one of the saved ones (up to core/skin.js MAX_SKINS, in
//               IndexedDB: game/skinfiles.js), or none; each painted on (game/skineditor.js) or
//               deleted here, and a new one painted
// ?join=CODE opens Join Game with the code filled in (state.js: never skipped).
// The menu plays its own song (music/title.scrim), if the music is on.
//
// Behind the menu the cube the chosen hero left its world in (game/showcase.js), and over it the
// hero, with the weapon in its hand (render/portrait.js, in the box heroBox gives): a click on
// it is Choose Character. No hero, or one without a world: random cubes.
import { state, view, player } from './state.js';
import { openSettings, closeSettings } from './settingsmenu.js';
import { fadeOut } from './hud.js';
import { endWorld } from './flow.js';
import { startShowcase, stopShowcase, showcaseCubes, park } from './showcase.js';
import { syncEquippedWeapon } from './equipment.js';
import { showPortrait } from '../render/portrait.js';
import { setCharacterSkin } from '../render/character.js';
import { openSkinEditor } from './skineditor.js';
import { deleteSkinFile, listNamedSkins, deleteNamedSkin, copyNamedSkin, readNamedSkin, cacheNamedSkinPreview } from './skinfiles.js';
import { SkinPreview } from '../render/skinpreview.js';
import { rigReady } from '../render/figure.js';
import { renderer } from '../render/scene.js';
import { skinNameKey, MAX_SKINS } from '../core/skin.js';
import { isInterior } from '../world/town.js';
import { startZoom } from './settings.js';
import { store, play, playAsGuest, stopSaving, newHero, newSavedWorld, forget } from './save.js';
import { playFilm, filmsWanted } from '../film/player.js';
import { FILMS } from '../film/films.js';
import { cleanName, cleanGender, heroLevel, heroStats, savedWorldName, GENDERS, MAX_HEROES, MAX_WORLDS } from '../core/save.js';
import { readSeed } from '../core/names.js';
import { ITEMS } from '../core/items.js';
import { pictureImg } from '../render/itemviews.js';
import { playSong, setMood } from '../audio/music.js';
import { readCode } from '../net/protocol.js';
import { online } from '../net/online.js';
import { joinGame, leaveGame, sessionStatus, onSessionChange } from '../net/session.js';
import { tr, msg, onLanguageChange, language } from '../i18n/i18n.js';
import { GUIDE_LANGUAGES } from '../i18n/languages.js';

const FADE_MS = 380, CONFIRM_MS = 4000, COPIED_MS = 1500;
const $ = id => document.getElementById(id);
const overlay = $('title-overlay'), panel = $('title-panel');
const params = new URLSearchParams(location.search), local = params.get('net') === 'local';

// screen: which one shows; from: where Choose Character goes back to ('title' or 'join');
// form: what is being typed ('hero': a new hero, 'known': a known world, { rename: id }: a hero's
// name and gender); gender: the one picked in the hero's form;
// asked: the delete button that asks again (id, until when); note: what went wrong; copied: the
// world whose name was just copied; invite: ?join=CODE, until joined or given up; code: the
// room code typed so far; joining: the code of the game we wait for
let screen = 'title', from = 'title', form = null, gender = GENDERS[0], asked = { id: null, until: 0 }, note = '', copied = null;
let invite = state.mode === 'menu' ? readCode(params.get('join')) : null, code = invite ?? '', joining = null;
let shownHero = '';   // the hero over the menu, as it was saved (id, when): its bag is the player's
// Choose Skin: the library (null: still coming from IndexedDB), its thumbnails (object URLs, by
// key) and which load is the latest; wearing: a skin is being copied onto the hero
let skins = null, skinPictures = new Map(), skinLoad = 0, wearing = false;

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 90) return tr('just now');
  if (s < 3600) return tr('{n} min ago', { n: Math.round(s / 60) });
  if (s < 86400 * 1.5) return tr('{n} h ago', { n: Math.round(s / 3600) });
  return tr('{n} days ago', { n: Math.round(s / 86400) });
}
function playTime(s) {
  const m = Math.round(s / 60);
  return m < 60 ? tr('{m} min played', { m }) : tr('{h} h {m} min played', { h: Math.floor(m / 60), m: m % 60 });
}
// the item a hero holds (its weapon), shown as its picture
const heroWeapon = h => { const s = h.inventory.slots.find(x => x?.instanceId === h.inventory.equipped); return ITEMS[s?.itemId] ? s.itemId : null; };
const depthText = w => w.deepest ? tr('depth {depth}', { depth: w.deepest }) : tr('town');
const chosen = () => { const id = store.selected(); return id ? store.hero(id) : null; };

// --- showing ------------------------------------------------------------------------------------

export function openMainMenu() {
  state.mode = 'menu';
  document.body.classList.add('in-menu');
  overlay.hidden = false;
  playSong('title'); setMood('explore');   // the menu's own song (music/title.scrim), calm
  screen = invite ? 'join' : 'title';
  form = null; note = ''; shownHero = '';
  render();   // (and the living cubes behind it)
}
// off to play: the screen goes dark (the game's first cube fades it in), the showcase stops
// (the game's world takes its place) and the view is the game's again
function closeMainMenu() {
  fadeOut();
  overlay.hidden = true;
  document.body.classList.remove('in-menu');
  closeSettings();
  stopShowcase();
  showPortrait(false); $('title-hero').hidden = true;
  view.yaw = view.yawTarget = -Math.PI / 4; view.zoom = view.zoomTarget = startZoom();   // (the settings')
  state.mode = 'play';
}

// --- the lists: Choose Character, Choose World and Choose Skin ----------------------------------

function deleteButton(id) {
  const sure = asked.id === id && performance.now() < asked.until;
  return `<button data-act="delete" data-id="${esc(id)}" class="${sure ? 'confirm' : ''}">${sure ? tr('Sure? Click again') : tr('Delete')}</button>`;
}
// a thing to pick: `picture` (HTML, null: none), its name and what is known about it under it;
// `tag`: said after the name; `chosen`: the one picked now
function pick({ act, id = '', chosen = false, picture = null, name, tag = '', info = '' }) {
  return `<button class="title-pick${chosen ? ' chosen' : ''}" data-act="${act}" data-id="${esc(id)}">${picture ?? ''}`
    + `<span><b>${esc(name)}${tag ? ` <em>${tag}</em>` : ''}</b><small>${info}</small></span></button>`;
}
// a row of the list: the pick (or a form in its place) and the buttons beside it
const card = (body, actions = '', kind = '') =>
  `<li class="title-card${kind ? ` ${kind}` : ''}">${body}${actions ? `<div class="title-actions">${actions}</div>` : ''}</li>`;
// a list screen: its title (and what it is for, how many), the cards (none: `empty`), what is
// under them (making a new one) and Back
function listScreen({ title, about = '', cards, empty = '', below = '' }) {
  return `<h2>${title}${about ? ` <small>${about}</small>` : ''}</h2>`
    + (cards.length ? `<ul class="title-cards">${cards.join('')}</ul>` : `<p>${empty}</p>`)
    + `${below}<button data-act="back" class="title-back">${tr('Back')}</button>`;
}
// the most there can be: why there is no "new" button
const tooMany = text => `<p>${text}</p>`;

// the hero's gender, two buttons (picked: aria-pressed): only words change with it, not the figure
const GENDER_LABELS = { m: msg('Male'), f: msg('Female') };
const genderPicker = () => `<div class="title-gender" role="group" aria-label="${esc(tr('Gender'))}">${GENDERS.map(g =>
  `<button data-act="gender" data-id="${g}" aria-pressed="${g === gender}">${tr(GENDER_LABELS[g])}</button>`).join('')}</div>`;

const noHero = () => `<p class="title-none">${tr("You don't have a character yet.")}</p><button class="menu-big" data-act="first-hero">${tr('OK')}</button>`;
// a hero to pick (with its weapon's picture); `chosen`: the one picked now
function heroPick(h, chosen = false) {
  const weapon = heroWeapon(h);
  return pick({ act: 'hero', id: h.id, chosen, picture: weapon ? pictureImg(weapon) : '<i></i>', name: h.name,
    info: `${tr('Level {level}', { level: heroLevel(h) })} · ${playTime(h.playTime)} · ${ago(h.updated)}` });
}
// a skin to pick (its thumbnail: the hero wearing it)
function skinPick(s, chosen) {
  const url = skinPictures.get(s.key);
  return pick({ act: 'skin', id: s.key, chosen, name: s.name, tag: chosen ? tr('wears it now') : '',
    picture: url ? `<img src="${url}" alt="">` : '<i></i>', info: s.savedAt ? tr('saved {when}', { when: ago(s.savedAt) }) : tr('saved skin') });
}

const screens = {
  title() {
    const hero = chosen();
    const more = `<button class="title-item" data-act="settings">${tr('Settings')}</button><a class="title-item title-link" href="learn/${GUIDE_LANGUAGES.includes(language()) ? `?lang=${language()}` : ''}" target="_blank" rel="noopener">${tr('The guide')}</a>`;
    if (!hero) return `<div class="title-list">${noHero()}${more}</div>`;
    const world = store.heroWorld(hero.id), name = esc(hero.name);
    const where = world && `${esc(world.name)} · ${world.heroes.includes(hero.id) ? depthText(world) : tr('not been there yet')}`;
    return `<div class="title-list">
      ${world ? `<button class="menu-big" data-act="continue">${fresh(world.id) ? tr('Start') : tr('Continue')}<small>${name} · ${tr('level {level}', { level: heroLevel(hero) })}</small><small>${where}</small></button>` : ''}
      <button class="${world ? 'title-item' : 'menu-big'}" data-act="choose-world">${tr('Choose World')}${world ? '' : `<small>${tr('{name} has no world yet', { name })}</small>`}</button>
      <button class="title-item" data-act="join-game">${tr('Join Game')}</button>
      <button class="title-item" data-act="characters">${tr('Choose Character')}</button>
      <button class="title-item" data-act="skins">${tr('Choose Skin')}</button>
      ${more}
    </div>`;
  },
  worlds() {
    const hero = chosen(), worlds = store.worlds(), names = new Map(store.heroes().map(h => [h.id, h.name]));
    const cards = worlds.map(w => card(pick({ act: 'world', id: w.id, chosen: w.id === hero.world, name: w.name,
      tag: w.id === hero.world ? tr('its world now') : '',
      info: `${depthText(w)} · ${ago(w.updated)}${w.heroes.length ? ' · ' + w.heroes.map(id => esc(names.get(id) ?? '?')).join(', ') : ''}` }),
      `<button data-act="copy-name" data-id="${w.id}" title="${esc(tr('To share it: a friend makes it with New Known World'))}">${copied === w.id ? tr('Copied!') : tr('Copy name')}</button>${deleteButton(w.id)}`,
      'title-world'));
    const make = worlds.length >= MAX_WORLDS ? tooMany(tr('{max} worlds is the most: delete one to make a new one.', { max: MAX_WORLDS }))
      : form === 'known' ? `<div class="title-form title-new-world">
          <input id="title-seed" maxlength="60" placeholder="${esc(tr('A world name or a number'))}" data-enter="create-world" aria-label="${esc(tr('World name or number'))}" autocomplete="off" spellcheck="false">
          <p id="title-preview" class="title-preview">${tr("A friend's world: type its name.")}</p>
          <div class="menu-row"><button class="menu-big" data-act="create-world">${tr('Make it')}</button><button data-act="cancel">${tr('Cancel')}</button></div></div>`
      : `<div class="menu-row title-new"><button data-act="random-world">${tr('New Random World')}</button><button data-act="known-world">${tr('New Known World')}</button></div>`;
    return listScreen({ title: tr('Choose World'), about: tr('for {name} · {n} of {max}', { name: esc(hero.name), n: worlds.length, max: MAX_WORLDS }),
      cards, empty: tr('No worlds yet.'), below: make });
  },
  join() {
    const heroes = store.heroes(), hero = chosen();
    const body = !heroes.length ? noHero() : `<h3>${tr('Who goes')}</h3><ul class="title-cards">${heroes.map(h => card(heroPick(h, h.id === hero?.id))).join('')}</ul>
      <h3>${tr("Your friend's code")}</h3>
      <div class="menu-row"><input id="title-code" maxlength="40" placeholder="${esc(tr('CODE'))}" data-enter="join" aria-label="${esc(tr('Room code'))}" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(code)}"><button class="menu-big" data-act="join">${tr('Join')}</button></div>
      <p>${tr("Your hero goes into your friend's world and takes home what it finds there.")}</p>`;
    return `<h2>${tr('Join Game')}</h2>${body}<button data-act="back" class="title-back">${tr('Back')}</button>`;
  },
  joining() {
    const hero = chosen();
    return `<h2>${tr('Joining {code}', { code: esc(joining) })}</h2><p>${hero ? tr("{name} goes into your friend's world.", { name: esc(hero.name) }) : tr("Your hero goes into your friend's world.")}</p>
      <p class="title-status">${esc(sessionStatus().text)}</p><button data-act="cancel-join" class="title-back">${tr('Cancel')}</button>`;
  },
  characters() {
    const heroes = store.heroes(), hero = chosen();
    let formShown = false;
    const cards = Array.from({ length: MAX_HEROES }, (_, i) => {
      const h = heroes[i];
      if (h) return card(form?.rename === h.id
        ? `<div class="title-rename"><div class="title-name"><input id="title-rename" maxlength="16" value="${esc(h.name)}" data-enter="save-name" aria-label="${esc(tr('New name'))}"><button data-act="save-name" data-id="${h.id}">${tr('Save')}</button></div>${genderPicker()}</div>`
        : heroPick(h, h.id === hero?.id),
        `<button data-act="rename" data-id="${h.id}">${tr('Edit')}</button>${deleteButton(h.id)}`);
      if (form === 'hero' && !formShown) {
        formShown = true;
        return card(`<div class="title-name"><input id="title-name" maxlength="16" placeholder="${esc(tr('Name your hero'))}" data-enter="create-hero" aria-label="${esc(tr('Hero name'))}">
          <button data-act="create-hero">${tr('Create')}</button>${heroes.length ? `<button data-act="cancel">${tr('Cancel')}</button>` : ''}</div>${genderPicker()}`, '', 'title-form');
      }
      return card(`<button data-act="new-hero">${tr('+ New hero')}</button>`, '', 'title-empty');
    });
    return listScreen({ title: tr('Choose Character'), cards });
  },
  skins() {
    const hero = chosen(), worn = skinNameKey(hero.skin?.name ?? '');
    const cards = !skins ? [] : [
      card(pick({ act: 'skin', chosen: !hero.skin, name: tr('No skin'), tag: hero.skin ? '' : tr('wears it now'), picture: '<i></i>', info: tr('plain clay') }), '', 'title-skin'),
      ...skins.map(s => card(skinPick(s, !!hero.skin && s.key === worn),
        `<button data-act="paint-skin" data-id="${esc(s.key)}">${tr('Paint')}</button>${deleteButton(`skin:${s.key}`)}`, 'title-skin')),
    ];
    const make = !skins ? '' : skins.length >= MAX_SKINS ? tooMany(tr('{max} skins is the most: delete one to make a new one.', { max: MAX_SKINS }))
      : `<div class="menu-row title-new"><button data-act="new-skin">${tr('Paint New Skin')}</button></div>`;
    return listScreen({ title: tr('Choose Skin'), about: skins ? tr('for {name} · {n} of {max}', { name: esc(hero.name), n: skins.length, max: MAX_SKINS }) : tr('for {name}', { name: esc(hero.name) }),
      cards, empty: tr('Loading the skins …'), below: make });
  },
};

function render() {
  if (state.mode !== 'menu') return;
  if ((screen === 'worlds' || screen === 'skins') && !chosen()) screen = 'title';
  panel.innerHTML = screens[screen]() + (note ? `<p class="title-note" role="alert">${esc(note)}</p>` : '');
  panel.dataset.screen = screen;
  panel.querySelector('#title-rename, #title-name, #title-seed')?.focus();
  updateScene();
}

// The chosen hero over the menu, with its bag (the weapon in its hand), and its world's cube behind
// it. Not while joining: the friend's world is coming.
function updateScene() {
  if (joining) return;
  const hero = chosen();
  $('title-hero').hidden = !hero;
  showPortrait(!!hero);
  if (hero) {
    $('title-hero-name').textContent = hero.name;
    $('title-hero-level').textContent = tr('Level {level}', { level: heroLevel(hero) });
    const k = `${hero.id} ${hero.updated}`;
    if (k !== shownHero) {
      shownHero = k;
      setCharacterSkin(hero.skin);
      Object.assign(player, heroStats(hero));
      park();   // (heroStats put it at the start: nothing should notice it)
      syncEquippedWeapon();
    }
  }
  const w = hero?.world ? store.world(hero.world) : null, spot = w?.spots[hero.id];
  const cube = spot && !isInterior(spot.cube) ? spot.cube : null;   // (in a house: the town)
  startShowcase(w ? { key: `${w.id} ${cube}`, seed: w.seed, cube, run: w.run } : null);
}

// main.js menuFrame: where the hero over the menu is drawn (CSS pixels; null: nowhere). Right
// beside the menu, as tall as it; on a narrow screen (a phone held upright) above it; with no
// room, not at all.
export function heroBox() {
  const el = $('title-hero');
  if (state.mode !== 'menu' || el.hidden) return null;
  const r = $('title-box').getBoundingClientRect(), W = innerWidth, H = innerHeight;
  let b = null;
  if (W - r.right >= 220) {
    const h = Math.min(r.height, H * 0.85), w = h * 0.5;
    b = { left: r.right + 12, top: r.top + (r.height - h) / 2, width: w, height: h };
  } else if (r.top >= 160) {
    const h = Math.min((r.top - 16) * 0.7, H * 0.32), w = h * 0.6;   // (standing on the menu, the cube still seen)
    b = { left: (W - w) / 2, top: r.top - h - 8, width: w, height: h };
  }
  el.style.visibility = b ? '' : 'hidden';
  if (!b) return null;
  Object.assign(el.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
  return $('title-hero-view').getBoundingClientRect();
}
$('title-hero').addEventListener('click', () => { if (state.mode === 'menu' && !joining) act('characters'); });
// what the world name or number typed so far is
function updatePreview() {
  const t = $('title-seed').value.trim(), seed = t ? readSeed(t) : null;
  const p = $('title-preview');
  if (!t) { p.textContent = tr("A friend's world: type its name."); p.classList.remove('bad'); return; }
  p.classList.toggle('bad', seed === null);
  if (seed === null) { p.textContent = tr('Not a world name or a number (yet)'); return; }
  const copy = store.nextCopy(seed);
  p.textContent = copy > 1 ? tr('{name} (you have this world already: a fresh copy)', { name: savedWorldName(seed, copy) }) : savedWorldName(seed, copy);
}

// --- doing --------------------------------------------------------------------------------------

// a world nobody has been in yet: it starts with the opening (film/opening.js), and the title
// says Start for it, not Continue
const fresh = worldId => !store.world(worldId)?.visited.length;

function start(heroId, worldId) {
  // (the world loading behind the opening)
  const opening = fresh(worldId);
  closeMainMenu();
  if (opening && filmsWanted()) playFilm(FILMS.opening);
  play(heroId, worldId).catch(e => {   // (the game files did not come: the server or the connection)
    console.error('could not start', e);
    stopSaving(); endWorld(); openMainMenu();   // (another showcase)
    note = tr('That world would not start. Try again?'); render();
  });
}

function joinWith(room) {
  const id = store.selected();
  if (!id || !playAsGuest(id)) { note = tr('Choose a character first'); render(); return; }
  invite = null;
  joining = room; screen = 'joining'; note = '';
  render();
  joinGame(room, { name: store.hero(id).name, local });
}
function stopJoining(text = '') {
  joining = null;
  stopSaving();
  screen = 'join'; note = text;
  render();
}
// the chosen hero's world from now on (back to the title: Continue plays it)
function chooseWorld(id) {
  if (!store.setHeroWorld(store.selected(), id)) { note = tr('Could not save that (is the storage full?)'); return; }
  form = null; screen = 'title';
}

// --- Choose Skin --------------------------------------------------------------------------------

// The library from IndexedDB, then the thumbnails it lacks (skins saved before there were any),
// made one by one with the game's renderer and kept for next time
async function loadSkins() {
  const load = ++skinLoad;
  let list;
  try { list = await listNamedSkins(); } catch (e) {
    console.error(e);
    if (load === skinLoad) { note = tr('Could not load the skins'); skins = []; render(); }
    return;
  }
  if (load !== skinLoad) return;
  dropPictures();
  skins = list;
  for (const s of list) if (s.preview) skinPictures.set(s.key, URL.createObjectURL(s.preview));
  render();
  const missing = list.filter(s => !s.preview);
  if (!missing.length) return;
  await rigReady;
  const previews = new SkinPreview(renderer);
  try {
    for (const s of missing) {
      if (load !== skinLoad) return;
      try {
        const record = await readNamedSkin(s.name);
        if (record?.revision !== s.revision) continue;
        const blob = await previews.render(record.blob);
        if (!blob || load !== skinLoad) continue;
        await cacheNamedSkinPreview(s.name, s.revision, blob);
        if (load !== skinLoad) return;
        skinPictures.set(s.key, URL.createObjectURL(blob));
        render();
      } catch (e) { console.warn('Skin preview failed', e); }
    }
  } finally { previews.dispose(); }
}
function dropPictures() {
  for (const url of skinPictures.values()) URL.revokeObjectURL(url);
  skinPictures = new Map();
}
// leaving Choose Skin: no more thumbnails, and the next visit loads the library again
function dropSkins() { skinLoad++; skins = null; dropPictures(); }

// The chosen hero wears `skin` (its own file of it, null: none) from now on; its old file goes
function wear(skin) {
  const hero = chosen();
  if (!hero) return false;
  const { skin: old, ...rest } = hero;
  if (!store.putHero({ ...rest, ...(skin ? { skin } : {}), updated: Date.now() })) return false;
  if (old?.id !== skin?.id) deleteSkinFile(old).catch(console.warn);
  return true;
}
// A skin from the list (key '': none). Back to the title, as with the world.
async function chooseSkin(key) {
  if (wearing) return;
  if (!key) {
    if (!wear(null)) { note = tr('Could not save that (is the storage full?)'); return; }
    dropSkins(); screen = 'title'; return;
  }
  const s = skins?.find(e => e.key === key);
  if (!s) return;
  wearing = true;
  let file = null;
  try {
    file = await copyNamedSkin(s.name);
    if (!file) { note = tr('That skin is gone'); loadSkins(); return; }
    if (!wear(file)) throw new Error('Hero storage refused');
    if (screen === 'skins') { dropSkins(); screen = 'title'; }
  } catch (e) {
    console.error(e);
    if (file) deleteSkinFile(file).catch(console.warn);
    note = tr('Could not save that (is the storage full?)');
  } finally {
    wearing = false;
    render();
  }
}
function paintSkin(name) {
  const hero = chosen();
  if (!hero || name === undefined) return;
  openSkinEditor({ hero, name, save: wear, onClose: saved => {
    if (state.mode !== 'menu') return;
    if (saved) { dropSkins(); screen = 'title'; render(); } else loadSkins();
  } });
}
async function deleteSkin(key) {
  const s = skins?.find(e => e.key === key);
  if (!s) return;
  try { await deleteNamedSkin(s.name); } catch (e) { console.error(e); note = tr('Could not delete that skin'); }
  loadSkins();
}

const actions = {
  continue() { const id = store.selected(), w = id && store.heroWorld(id); if (w) start(id, w.id); },
  'choose-world'() { screen = 'worlds'; form = null; },
  'join-game'() { screen = 'join'; },
  characters() { from = 'title'; screen = 'characters'; form = store.heroes().length ? null : 'hero'; gender = GENDERS[0]; },
  'first-hero'() { from = screen; screen = 'characters'; form = 'hero'; gender = GENDERS[0]; },
  skins() { screen = 'skins'; loadSkins(); },
  skin(key) { chooseSkin(key); },
  'paint-skin'(key) { paintSkin(skins?.find(s => s.key === key)?.name); },
  'new-skin'() { paintSkin(''); },
  settings() { openSettings(); },
  back() {
    form = null;
    if (screen === 'join') { invite = null; code = ''; }
    if (screen === 'skins') dropSkins();
    screen = screen === 'characters' ? from : 'title';
  },
  cancel() { form = null; },
  'new-hero'() { form = 'hero'; gender = GENDERS[0]; },
  'create-hero'() {
    const name = cleanName($('title-name').value);
    if (!name) { note = tr('Your hero needs a name'); return; }
    const h = newHero(name, gender);
    if (!h) { note = tr('Could not make the hero (is the storage full?)'); return; }
    store.select(h.id);
    form = null; screen = from;
  },
  hero(id) {
    store.select(id);
    if (screen === 'characters') { form = null; screen = from; }
  },
  world(id) { chooseWorld(id); },
  'random-world'() {
    const w = newSavedWorld();
    if (!w) { note = tr('Could not make the world (is the storage full?)'); return; }
    chooseWorld(w.id);
  },
  'known-world'() { form = 'known'; },
  'create-world'() {
    const seed = readSeed($('title-seed').value);
    if (seed === null) { note = $('title-seed').value.trim() ? tr('That is not a world name or a number') : tr("Type the world's name"); return; }
    const w = newSavedWorld(seed);
    if (!w) { note = tr('Could not make the world (is the storage full?)'); return; }
    chooseWorld(w.id);
  },
  rename(id) { form = { rename: id }; gender = cleanGender(store.hero(id)?.gender); },
  'save-name'(id) {
    const name = cleanName($('title-rename').value), h = store.hero(id);
    if (!name) { note = tr('A name, please'); return; }
    if (h) store.putHero({ ...h, name, gender });
    form = null;
  },
  delete(id) {
    if (asked.id !== id || performance.now() >= asked.until) {
      asked = { id, until: performance.now() + CONFIRM_MS };
      setTimeout(render, CONFIRM_MS + 50);
      return;
    }
    asked = { id: null, until: 0 };
    if (id.startsWith('skin:')) { deleteSkin(id.slice(5)); return; }
    forget(id);
    const hero = store.hero(id);
    if (hero) {
      store.deleteHero(id);
      if (!store.hero(id)) deleteSkinFile(hero.skin).catch(console.warn);
    } else store.deleteWorld(id);
  },
  'copy-name'(id) {
    const w = store.worlds().find(e => e.id === id);
    if (!w) return;
    navigator.clipboard?.writeText(w.name).then(() => {
      copied = id; render();
      setTimeout(() => { if (copied === id) { copied = null; render(); } }, COPIED_MS);
    }, () => { note = w.name; render(); });   // (no clipboard: at least it shows)
  },
  join() {
    const room = readCode($('title-code').value);
    if (!room) { note = tr('A code has four letters'); return; }
    joinWith(room);
  },
  'cancel-join'() { leaveGame(); stopJoining(); },
};

function act(name, id) {
  const fn = actions[name];
  if (!fn) return;
  note = '';
  fn(id);
  if (state.mode === 'menu' && screen !== 'joining') render();
}
panel.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  e.preventDefault();
  // a gender picked in the hero's form: only the buttons change (drawn again, the name typed would go)
  if (b.dataset.act === 'gender') {
    gender = cleanGender(b.dataset.id);
    for (const o of b.parentElement.children) o.setAttribute('aria-pressed', String(o === b));
    return;
  }
  act(b.dataset.act, b.dataset.id);
});
panel.addEventListener('keydown', e => {
  const t = e.target.dataset?.enter;
  if (e.key === 'Enter' && t) { e.preventDefault(); act(t, panel.querySelector(`[data-act="${t}"]`)?.dataset.id); }
});
panel.addEventListener('input', e => {
  if (e.target.id === 'title-seed') updatePreview();
  if (e.target.id === 'title-code') code = e.target.value;   // (kept when the screen draws again)
});
// Esc: the form given up, else back a screen (open, the settings take it: game/settingsmenu.js)
addEventListener('keydown', e => {
  if (state.mode !== 'menu' || e.key !== 'Escape') return;
  e.preventDefault();
  if (form) act('cancel');
  else if (screen === 'joining') act('cancel-join');
  else if (screen !== 'title') act('back');
});

// joining: the friend's game says how it goes; a failure brings us back to Join Game
onSessionChange(s => {
  if (state.mode !== 'menu' || screen !== 'joining') return;
  if (s.phase === 'idle') stopJoining(s.text || tr('Could not join'));
  else render();
});

// the settings switched the language (from the menu's Settings): the menu in the new one
onLanguageChange(() => render());

// main.js, every frame in the menu: the friend's world started (net/session.js): off we go
export function updateMenu() {
  if (joining && state.cubes && state.cubes !== showcaseCubes() && online.role === 'guest') { joining = null; closeMainMenu(); }
}

// The Esc menu's "Save and quit": the hero and world are saved a last time, a game with friends
// in it ends for them (they play on alone), and the world goes once the screen is dark
export function quitToMenu() {
  if (state.mode === 'menu') return;
  if (state.transitioning) { setTimeout(quitToMenu, 100); return; }   // not halfway into a cube
  stopSaving();
  if (online.role) leaveGame();
  state.transitioning = true;   // nothing moves while the screen goes dark
  fadeOut();
  setTimeout(() => { endWorld(); openMainMenu(); }, FADE_MS);
}
