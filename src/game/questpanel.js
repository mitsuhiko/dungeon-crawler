// The Quests tab of the inventory (game/inventory.js has the panel and its tabs; U opens it on
// this tab). On the left the quests going on, done or archived (a filter); when the panel was
// opened by talking to a villager who gives quests, what they have comes first: an offer to take,
// a quest to hand in. On the right the selected quest: who gave it, its story, its goals, its
// reward, and what can be done with it: Accept, Hand in (only to its giver), Archive / Unarchive,
// Restart (a failed quest, from the beginning). Everything goes through game/quests.js, which asks
// the host when playing together.
import { ITEMS } from '../core/items.js';
import { formatCoins } from '../core/inventory.js';
import { rarityOf } from '../core/gear/rarities.js';
import { displayName } from '../core/gear/stats.js';
import { GIVERS, giverOf, giverQuests, questLists, stateText, stageText, depthName, giverName, carried } from '../core/quests.js';
import { questLog, questAct } from './quests.js';
import { greeting } from '../core/questvoices.js';
import { tr, msg, say, onLanguageChange } from '../i18n/i18n.js';

const DIFFICULTY = { easy: msg('easy'), medium: msg('medium'), hard: msg('hard') };
const THANKS_FOR = 60000;   // ms: a giver still says thanks for a quest handed in so long ago
// another language: the panel and the corner say it again
onLanguageChange(() => { signature = ''; shownTrack = ''; });
import { state } from './state.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// filter: which list shows; selected: the quest shown on the right (its id); tracked: the quest
// followed in the corner (null: the newest one going on), this player's own choice
let filter = 'active', selected = null, signature = '', talker = null, onChange = () => {}, tracked = null;

// the panel opened (talking to villager v, or not): the giver's news is selected first
export function openQuests(v = null) {
  talker = giverOf(v) ? v : null;
  selected = null; signature = '';
  const news = talker && giverQuests(questLog(), giverOf(talker)).find(q => q.state === 'ready' || q.state === 'offered');
  if (news) selected = news.id;
  if (!selected) filter = 'active';
}
export const closeQuests = () => { talker = null; };
// game/inventory.js: redraw when something here changed
export function onQuestChange(fn) { onChange = fn; }

const entry = (q, on) => {
  const mark = q.state === 'offered' ? '!' : q.state === 'ready' ? '?' : q.state === 'failed' ? '✗' : q.state === 'done' ? '✓' : '·';
  return `<button class="quest-entry ${q.state}${on ? ' selected' : ''}" role="option" aria-selected="${on}" data-quest="${esc(q.id)}">`
    + `<span class="mark">${mark}</span><span><b>${esc(say(q.title))}</b><small>${esc(stateText(q))}</small></span></button>`;
};
const itemLine = i => {
  const def = ITEMS[i.itemId], color = i.gen ? ` style="color:${rarityOf(i).css}"${rarityOf(i).glow?.rainbow ? ' class="rainbow"' : ''}` : '';
  return `<li${color}>${esc(i.gen ? tr('{item} ({rarity} {base})', { item: displayName(i), rarity: tr(rarityOf(i).name), base: tr(def.name) })
    : `${tr(def.name)}${i.count > 1 ? ` ×${i.count}` : ''}`)}</li>`;
};

export function drawQuests() {
  const L = questLog();
  if (!L) return;
  const lists = questLists(L), mine = talker ? giverQuests(L, giverOf(talker)) : [];
  const all = [...mine, ...lists.active, ...lists.done, ...lists.archived];
  if (selected && !L.list.some(q => q.id === selected && (q.state !== 'offered' || mine.includes(q)))) selected = null;
  if (!selected) selected = (mine[0] ?? lists[filter][0])?.id ?? null;
  const next = `${L.version}:${filter}:${selected}:${talker?.name}:${tracked}`;
  if (next === signature) return;
  signature = next;
  const focus = document.activeElement?.dataset?.quest;
  // what the villager has
  $('quests-talk').hidden = !talker;
  if (talker) {
    const title = talker.title ? say(talker.title) : GIVERS[talker.name] ? tr(GIVERS[talker.name].title) : talker.name;
    // in their own voice (core/questvoices.js); just handed in: their thanks
    const voice = GIVERS[talker.name] ? talker.name : talker.role, giver = giverOf(talker);
    const thanked = L.list.filter(q => q.giver === giver && q.state === 'done' && q.thanks && Date.now() - q.finished < THANKS_FOR).at(-1);
    const said = (what, plain) => greeting(voice, what) ? tr(greeting(voice, what)) : plain();
    const words = mine.some(q => q.state === 'ready') ? said('back', () => tr('You are back! Did you do what I asked?'))
      : mine.some(q => q.state === 'offered') ? said('ask', () => tr('I could use some help...')) : mine.length ? said('waiting', () => tr('How is it going?'))
      : thanked ? say(thanked.thanks) : said('idle', () => tr('Nothing for you just now. Come back when you have been further down.'));
    $('quests-talk').innerHTML = `<h2>${esc(title)}</h2><p>${esc(words)}</p>`
      + (mine.length ? `<div class="quest-entries" role="listbox" aria-label="${esc(tr("{name}'s quests", { name: title }))}">${mine.map(q => entry(q, q.id === selected)).join('')}</div>` : '');
  }
  // the list
  for (const b of $('quests-filter').querySelectorAll('[data-filter]')) {
    const f = b.dataset.filter, n = lists[f].length;
    b.setAttribute('aria-pressed', String(f === filter));
    b.textContent = `${tr({ active: msg('Going on'), done: msg('Done'), archived: msg('Archived') }[f])}${n ? ` (${n})` : ''}`;
  }
  const shown = lists[filter].filter(q => !mine.includes(q));
  $('quests-list').innerHTML = shown.length ? shown.map(q => entry(q, q.id === selected)).join('')
    : `<div class="quest-empty">${esc({ active: () => mine.length ? tr('Nothing else going on.') : tr('No quests going on. Talk to the villagers in town: a ! over one means a quest for you.'),
      done: () => tr('No quests done yet.'), archived: () => tr('Nothing archived. Archive a quest to put it away; it waits here until you bring it back.') }[filter]())}</div>`;
  // the selected quest
  const q = all.find(x => x.id === selected) ?? null;
  $('quests-details-inner').innerHTML = q ? details(q) : `<h2>${esc(tr('Quests'))}</h2><p class="quest-text">${esc(tr('Select a quest to read it.'))}</p>`;
  if (focus) (document.querySelector(`#quests-body [data-quest="${CSS.escape(focus)}"]`))?.focus();
}

// what a quest carries, each thing once with how many
function carrying(q) {
  const n = new Map();
  for (const id of carried(q)) n.set(id, (n.get(id) ?? 0) + 1);
  return [...n].map(([id, k]) => `<li>${esc(tr(ITEMS[id].name))}${k > 1 ? ` ×${k}` : ''}</li>`).join('');
}
function details(q) {
  const atGiver = !!talker && giverOf(talker) === q.giver, r = q.rewards, who = giverName(q), where = q.from?.where ?? GIVERS[q.giver]?.where ?? '';
  const goals = q.stages.map((s, i) => `<li class="${s.done ? 'done' : i === q.stage && q.state === 'active' ? 'now' : ''}">${esc(stageText(s))}</li>`).join('');
  const rewards = [`<li>${esc(tr('+{xp} XP', { xp: r.xp }))}</li>`, r.copper ? `<li>${formatCoins(r.copper)}</li>` : '', ...r.items.map(itemLine),
    q.payout === 'self' ? `<li>${esc(tr('and whatever the treasure holds'))}</li>` : ''].join('');
  const back = q.payout !== 'return' ? '' : where ? tr('Go back to {giver:the} ({where}) to hand it in.', { giver: who, where: say(where) })
    : tr('Go back to {giver:the} to hand it in.', { giver: who });
  const hint = q.archived ? tr('Archived: put away. It counts nothing until you bring it back.')
    : q.state === 'ready' && !atGiver ? tr('Done! {back}', { back })
    : q.state === 'offered' ? (q.payout === 'return' ? tr('When it is done, come back to {giver:the} for the reward.', { giver: who }) : '')
    : q.state === 'failed' ? tr('It failed. Restart it to try again from the beginning.')
    : q.state === 'done' ? tr('Complete: everyone in the game got the reward.') : '';
  const button = (act, text, main = false) => `<button${main ? ' class="main"' : ''} data-act="${act}">${esc(text)}</button>`;
  const buttons = [
    q.state === 'offered' && atGiver ? button('accept', tr('Accept'), true) : '',
    q.state === 'ready' && atGiver && !q.archived ? button('handIn', tr('Hand in'), true) : '',
    q.state === 'failed' && !q.archived ? button('restart', tr('Restart'), true) : '',
    q.state === 'active' && !q.archived ? button('track', tracked === q.id ? tr('Following') : tr('Follow')) : '',
    q.state !== 'offered' && !q.archived ? button('archive', tr('Archive')) : '',
    q.archived ? button('unarchive', tr('Unarchive')) : '',
  ].join('');
  return `<h2>${esc(say(q.title))}</h2>`
    + `<div class="quest-meta">${esc(tr('From {giver:the} · {where} · {difficulty}', { giver: who, where: say(depthName(q.depth)), difficulty: tr(DIFFICULTY[q.difficulty]) }))}</div>`
    + `<p class="quest-text">${esc(say(q.text))}</p>`
    + (q.state === 'done' && q.thanks ? `<p class="quest-text quest-thanks">${esc(tr('{giver:The}: {said}', { giver: who, said: say(q.thanks) }))}</p>` : '')
    + `<h3>${esc(tr('Goal'))}</h3><ul class="quest-goals">${goals}</ul>`
    + (carried(q).length ? `<h3>${esc(tr('Carrying'))}</h3><ul class="quest-rewards">${carrying(q)}</ul>` : '')
    + `<h3>${esc(tr('Reward'))}</h3><ul class="quest-rewards">${rewards}</ul>`
    + (hint ? `<p class="quest-hint">${esc(hint)}</p>` : '')
    + (buttons ? `<div class="quest-actions">${buttons}</div>` : '');
}

// clicks: pick a quest, a filter, or do something with the selected quest
$('quests-body').addEventListener('click', e => {
  const pickQ = e.target.closest('[data-quest]'), f = e.target.closest('[data-filter]'), act = e.target.closest('[data-act]');
  if (pickQ) selected = pickQ.dataset.quest;
  else if (f) { filter = f.dataset.filter; selected = null; }
  else if (act && selected) {
    const id = selected;
    if (act.dataset.act === 'track') { tracked = tracked === id ? null : id; signature = ''; onChange(); drawTracker(); return; }
    questAct(act.dataset.act, id);
    // an archived quest leaves the list it was in: show it where it went now
    if (act.dataset.act === 'archive') filter = 'archived';
    else if (act.dataset.act === 'unarchive') filter = 'active';
    else if (act.dataset.act === 'accept') filter = 'active';
  } else return;
  signature = '';
  onChange();
});
// The quest followed, in the corner: the one chosen (Follow), else the newest one going on
const box = $('quest-track');
let shownTrack = '';
// (the minimap marks where it wants you, game/minimap.js)
export function followedQuest() {
  const L = questLog(), live = state.mode === 'play' && !!L;
  const going = live ? L.list.filter(q => (q.state === 'active' || q.state === 'ready' || q.state === 'failed') && !q.archived) : [];
  return going.find(x => x.id === tracked) ?? going.at(-1) ?? null;
}
export function drawTracker() {
  const q = followedQuest();
  const text = q ? `<b>${esc(say(q.title))}</b>${esc(stateText(q))}` : '';
  if (text === shownTrack) return;
  shownTrack = text;
  box.hidden = !q;
  box.innerHTML = text;
}

// up and down move through the quests
$('quests-body').addEventListener('keydown', e => {
  if (e.code !== 'ArrowDown' && e.code !== 'ArrowUp') return;
  const all = [...$('quests-body').querySelectorAll('[data-quest]')], i = all.indexOf(document.activeElement);
  if (i < 0) return;
  const next = all[i + (e.code === 'ArrowDown' ? 1 : -1)];
  if (next) { e.preventDefault(); next.focus(); next.click(); }
});
