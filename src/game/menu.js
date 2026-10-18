// The main menu: before the game starts, and after "Save and quit" in the Esc menu
// (game/escmenu.js). The dev tools and ?seed= skip it (state.js mode; ?menu=1 shows it after all).
//   title       Continue (the chosen hero in its world), Choose World, Join Game, Choose
//               Character, the settings (game/settingsmenu.js), the guide. No hero yet: it
//               says so, and OK goes to make one.
//   worlds      the chosen hero's world: one of the saved ones, a new random one, or a known one
//               (a world name or a number, core/names.js). Back to the title: Continue plays it.
//               Each world's name can be copied (to share it) and the world deleted here too.
//   join        a hero (it becomes the chosen one) and a friend's room code
//   joining     waiting for the friend's game; the hero comes along, the world is theirs (it
//               does not become the hero's world)
//   characters  up to three heroes (core/save.js MAX_HEROES): choose, rename, delete, make one
// ?join=CODE opens Join Game with the code filled in (state.js: never skipped).
//
// Behind the menu the cube the chosen hero left its world in (game/showcase.js), and over it the
// hero, with the weapon in its hand (render/portrait.js, in the box heroBox gives): a click on
// it is Choose Character. No hero, or one without a world: random cubes.
import { state, view, player } from './state.js';
import { setHelpOpen } from './help.js';
import { openSettings, closeSettings } from './settingsmenu.js';
import { fadeOut } from './hud.js';
import { endWorld } from './flow.js';
import { startShowcase, stopShowcase, showcaseCubes, park } from './showcase.js';
import { syncEquippedWeapon } from './equipment.js';
import { showPortrait } from '../render/portrait.js';
import { setCharacterSkin } from '../render/character.js';
import { openSkinEditor } from './skineditor.js';
import { deleteSkinFile } from './skinfiles.js';
import { isInterior } from '../world/town.js';
import { DEFAULT_ZOOM } from '../core/zoom.js';
import { store, play, playAsGuest, stopSaving, newHero, newSavedWorld, forget } from './save.js';
import { cleanName, heroLevel, heroStats, savedWorldName, MAX_HEROES, MAX_WORLDS } from '../core/save.js';
import { readSeed } from '../core/names.js';
import { ITEMS } from '../core/items.js';
import { pictureImg } from '../render/itemviews.js';
import { playSong } from '../audio/music.js';
import { readCode } from '../net/protocol.js';
import { online } from '../net/online.js';
import { joinGame, leaveGame, sessionStatus, onSessionChange } from '../net/session.js';

const FADE_MS = 380, CONFIRM_MS = 4000, COPIED_MS = 1500;
const $ = id => document.getElementById(id);
const overlay = $('title-overlay'), panel = $('title-panel');
const params = new URLSearchParams(location.search), local = params.get('net') === 'local';

// screen: which one shows; from: where Choose Character goes back to ('title' or 'join');
// form: what is being typed ('hero': a new hero, 'known': a known world, { rename: id });
// asked: the delete button that asks again (id, until when); note: what went wrong; copied: the
// world whose name was just copied; invite: ?join=CODE, until joined or given up; code: the
// room code typed so far; joining: the code of the game we wait for
let screen = 'title', from = 'title', form = null, asked = { id: null, until: 0 }, note = '', copied = null;
let invite = state.mode === 'menu' ? readCode(params.get('join')) : null, code = invite ?? '', joining = null;
let shownHero = '';   // the hero over the menu, as it was saved (id, when): its bag is the player's

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 * 1.5) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}
function playTime(s) {
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min played` : `${Math.floor(m / 60)} h ${m % 60} min played`;
}
// the item a hero holds (its weapon), shown as its picture
const heroWeapon = h => { const s = h.inventory.slots.find(x => x?.instanceId === h.inventory.equipped); return ITEMS[s?.itemId] ? s.itemId : null; };
const depthText = w => w.deepest ? `depth ${w.deepest}` : 'town';
const chosen = () => { const id = store.selected(); return id ? store.hero(id) : null; };

// --- showing ------------------------------------------------------------------------------------

export function openMainMenu() {
  state.mode = 'menu';
  document.body.classList.add('in-menu');
  overlay.hidden = false;
  playSong(null);   // no music in the menu
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
  setHelpOpen(false); closeSettings();
  stopShowcase();
  showPortrait(false); $('title-hero').hidden = true;
  view.yaw = view.yawTarget = -Math.PI / 4; view.zoom = view.zoomTarget = DEFAULT_ZOOM;
  state.mode = 'play';
}

function deleteButton(id) {
  const sure = asked.id === id && performance.now() < asked.until;
  return `<button data-act="delete" data-id="${id}" class="${sure ? 'confirm' : ''}">${sure ? 'Sure? Click again' : 'Delete'}</button>`;
}
const noHero = `<p class="title-none">You don't have a character yet.</p><button class="menu-big" data-act="first-hero">OK</button>`;
// a hero to pick (with its weapon's picture); `chosen`: the one picked now
function heroPick(h, isChosen = false) {
  const weapon = heroWeapon(h);
  return `<button class="title-pick${isChosen ? ' chosen' : ''}" data-act="hero" data-id="${h.id}">${weapon ? pictureImg(weapon) : '<i></i>'}`
    + `<span><b>${esc(h.name)}</b><small>Level ${heroLevel(h)} · ${playTime(h.playTime)} · ${ago(h.updated)}</small></span></button>`;
}

const screens = {
  title() {
    const hero = chosen();
    const more = '<button class="title-item" data-act="settings">Settings</button><a class="title-item title-link" href="learn/" target="_blank" rel="noopener">The guide</a>';
    if (!hero) return `<div class="title-list">${noHero}${more}</div>`;
    const world = store.heroWorld(hero.id);
    const where = world && `${esc(world.name)} · ${world.heroes.includes(hero.id) ? depthText(world) : 'not been there yet'}`;
    return `<div class="title-list">
      ${world ? `<button class="menu-big" data-act="continue">Continue<small>${esc(hero.name)} · level ${heroLevel(hero)}</small><small>${where}</small></button>` : ''}
      <button class="${world ? 'title-item' : 'menu-big'}" data-act="choose-world">Choose World${world ? '' : `<small>${esc(hero.name)} has no world yet</small>`}</button>
      <button class="title-item" data-act="join-game">Join Game</button>
      <button class="title-item" data-act="characters">Choose Character</button>
      <button class="title-item" data-act="paint-skin">Choose Skin</button>
      ${more}
    </div>`;
  },
  worlds() {
    const hero = chosen(), worlds = store.worlds(), names = new Map(store.heroes().map(h => [h.id, h.name]));
    const rows = worlds.map(w => `<li class="title-card title-world"><button class="title-pick${w.id === hero.world ? ' chosen' : ''}" data-act="world" data-id="${w.id}"><span>`
      + `<b>${esc(w.name)}${w.id === hero.world ? ' <em>its world now</em>' : ''}</b>`
      + `<small>${depthText(w)} · ${ago(w.updated)}${w.heroes.length ? ' · ' + w.heroes.map(id => esc(names.get(id) ?? '?')).join(', ') : ''}</small></span></button>`
      + `<div class="title-actions"><button data-act="copy-name" data-id="${w.id}" title="To share it: a friend makes it with New Known World">${copied === w.id ? 'Copied!' : 'Copy name'}</button>${deleteButton(w.id)}</div></li>`).join('');
    const make = worlds.length >= MAX_WORLDS ? `<p>${MAX_WORLDS} worlds is the most: delete one to make a new one.</p>`
      : form === 'known' ? `<div class="title-form title-new-world">
          <input id="title-seed" maxlength="60" placeholder="A world name or a number" data-enter="create-world" aria-label="World name or number" autocomplete="off" spellcheck="false">
          <p id="title-preview" class="title-preview">A friend's world: type its name.</p>
          <div class="menu-row"><button class="menu-big" data-act="create-world">Make it</button><button data-act="cancel">Cancel</button></div></div>`
      : `<div class="menu-row title-new"><button data-act="random-world">New Random World</button><button data-act="known-world">New Known World</button></div>`;
    return `<h2>Choose World <small>for ${esc(hero.name)} · ${worlds.length} of ${MAX_WORLDS}</small></h2>
      ${rows ? `<ul class="title-cards">${rows}</ul>` : '<p>No worlds yet.</p>'}${make}
      <button data-act="back" class="title-back">Back</button>`;
  },
  join() {
    const heroes = store.heroes(), hero = chosen();
    const body = !heroes.length ? noHero : `<h3>Who goes</h3><ul class="title-cards">${heroes.map(h => `<li class="title-card">${heroPick(h, h.id === hero?.id)}</li>`).join('')}</ul>
      <h3>Your friend's code</h3>
      <div class="menu-row"><input id="title-code" maxlength="40" placeholder="CODE" data-enter="join" aria-label="Room code" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(code)}"><button class="menu-big" data-act="join">Join</button></div>
      <p>Your hero goes into your friend's world and takes home what it finds there.</p>`;
    return `<h2>Join Game</h2>${body}<button data-act="back" class="title-back">Back</button>`;
  },
  joining() {
    const hero = chosen();
    return `<h2>Joining ${esc(joining)}</h2><p>${esc(hero?.name ?? 'Your hero')} goes into your friend's world.</p>
      <p class="title-status">${esc(sessionStatus().text)}</p><button data-act="cancel-join" class="title-back">Cancel</button>`;
  },
  characters() {
    const heroes = store.heroes(), hero = chosen();
    let formShown = false;
    const cards = Array.from({ length: MAX_HEROES }, (_, i) => {
      const h = heroes[i];
      if (h) return `<li class="title-card">${form?.rename === h.id
        ? `<span class="title-rename"><input id="title-rename" maxlength="16" value="${esc(h.name)}" data-enter="save-name" aria-label="New name"><button data-act="save-name" data-id="${h.id}">Save</button></span>`
        : heroPick(h, h.id === hero?.id)}
        <div class="title-actions"><button data-act="rename" data-id="${h.id}">Rename</button>${deleteButton(h.id)}</div></li>`;
      if (form === 'hero' && !formShown) {
        formShown = true;
        return `<li class="title-card title-form"><input id="title-name" maxlength="16" placeholder="Name your hero" data-enter="create-hero" aria-label="Hero name">
          <button data-act="create-hero">Create</button>${heroes.length ? '<button data-act="cancel">Cancel</button>' : ''}</li>`;
      }
      return `<li class="title-card title-empty"><button data-act="new-hero">+ New hero</button></li>`;
    }).join('');
    return `<h2>Choose Character</h2><ul class="title-cards">${cards}</ul><button data-act="back" class="title-back">Back</button>`;
  },

};

function render() {
  if (state.mode !== 'menu') return;
  if (screen === 'worlds' && !chosen()) screen = 'title';
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
    $('title-hero-level').textContent = `Level ${heroLevel(hero)}`;
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
  if (!t) { p.textContent = "A friend's world: type its name."; p.classList.remove('bad'); return; }
  p.classList.toggle('bad', seed === null);
  if (seed === null) { p.textContent = 'Not a world name or a number (yet)'; return; }
  const copy = store.nextCopy(seed);
  p.textContent = `${savedWorldName(seed, copy)}${copy > 1 ? ' (you have this world already: a fresh copy)' : ''}`;
}

// --- doing --------------------------------------------------------------------------------------

function start(heroId, worldId) {
  closeMainMenu();
  play(heroId, worldId).catch(e => {   // (the game files did not come: the server or the connection)
    console.error('could not start', e);
    stopSaving(); endWorld(); openMainMenu();   // (another showcase)
    note = 'That world would not start. Try again?'; render();
  });
}

function joinWith(room) {
  const id = store.selected();
  if (!id || !playAsGuest(id)) { note = 'Choose a character first'; render(); return; }
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
  if (!store.setHeroWorld(store.selected(), id)) { note = 'Could not save that (is the storage full?)'; return; }
  form = null; screen = 'title';
}

const actions = {
  continue() { const id = store.selected(), w = id && store.heroWorld(id); if (w) start(id, w.id); },
  'choose-world'() { screen = 'worlds'; form = null; },
  'join-game'() { screen = 'join'; },
  characters() { from = 'title'; screen = 'characters'; form = store.heroes().length ? null : 'hero'; },
  'first-hero'() { from = screen; screen = 'characters'; form = 'hero'; },
  'paint-skin'() {
    const hero = chosen();
    if (hero) openSkinEditor(hero, skin => {
      const current = store.hero(hero.id);
      return !!current && store.putHero({ ...current, skin, updated: Date.now() });
    });
  },
  settings() { openSettings(); },
  back() {
    form = null;
    if (screen === 'join') { invite = null; code = ''; }
    screen = screen === 'characters' ? from : 'title';
  },
  cancel() { form = null; },
  'new-hero'() { form = 'hero'; },
  'create-hero'() {
    const name = cleanName($('title-name').value);
    if (!name) { note = 'Your hero needs a name'; return; }
    const h = newHero(name);
    if (!h) { note = 'Could not make the hero (is the storage full?)'; return; }
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
    if (!w) { note = 'Could not make the world (is the storage full?)'; return; }
    chooseWorld(w.id);
  },
  'known-world'() { form = 'known'; },
  'create-world'() {
    const seed = readSeed($('title-seed').value);
    if (seed === null) { note = $('title-seed').value.trim() ? 'That is not a world name or a number' : "Type the world's name"; return; }
    const w = newSavedWorld(seed);
    if (!w) { note = 'Could not make the world (is the storage full?)'; return; }
    chooseWorld(w.id);
  },
  rename(id) { form = { rename: id }; },
  'save-name'(id) {
    const name = cleanName($('title-rename').value), h = store.hero(id);
    if (!name) { note = 'A name, please'; return; }
    if (h) store.putHero({ ...h, name });
    form = null;
  },
  delete(id) {
    if (asked.id !== id || performance.now() >= asked.until) {
      asked = { id, until: performance.now() + CONFIRM_MS };
      setTimeout(render, CONFIRM_MS + 50);
      return;
    }
    asked = { id: null, until: 0 };
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
    if (!room) { note = 'A code has four letters'; return; }
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
  if (b) { e.preventDefault(); act(b.dataset.act, b.dataset.id); }
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
  if (s.phase === 'idle') stopJoining(s.text || 'Could not join');
  else render();
});

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
