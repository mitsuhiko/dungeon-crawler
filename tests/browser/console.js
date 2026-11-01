// Browser integration checks for the chat box (game/console.js): opening and closing it with
// the keys, typing that does not play, completing and running commands, history, the
// chronicle (deaths, depths, kills) and chat. Resets to a fresh seed-3 run before and after.
// With ?dev=1&lang=en (it reads the game's English), from the devtools console:
//   await (await import('/tests/browser/console.js')).runConsoleChecks()
import { N } from '../../src/core/constants.js';
import { player, state } from '../../src/game/state.js';
import { newWorld } from '../../src/game/flow.js';
import { clearInput } from '../../src/game/input.js';
import { controls } from '../../src/game/inputstate.js';
import { hitPlayer } from '../../src/game/enemycombat.js';
import { allEnemies } from '../../src/game/enemies.js';
import { chronicle, clearChronicle } from '../../src/game/log.js';
import { chatOpen, closeChat, openChat } from '../../src/game/console.js';
import { runCommand, commands } from '../../src/game/commands.js';
import { countOf, copperTotal, takeItem, isBound, isWorn } from '../../src/core/inventory.js';
import { ITEMS, TOOLS } from '../../src/core/items.js';
import { answerDeath } from '../../src/game/deathask.js';
import { step, DIR_NAME } from '../../src/world/coords.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const $ = id => document.getElementById(id);
const key = (code, key = code, target = window) => target.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }));
const input = () => $('chat-input');
function type(text) {
  const el = input();
  el.value += text;
  el.setSelectionRange(el.value.length, el.value.length);
  el.dispatchEvent(new Event('input'));
}
const popup = () => [...$('chat-popup').children].map(li => li.querySelector('.label').textContent);
const last = () => chronicle.entries.at(-1);

export async function runConsoleChecks() {
  check(state.dev, 'Run with ?dev=1');
  const results = [];
  await newWorld(3); clearInput(); clearChronicle();
  try {
    // Enter opens the box to chat; the keys type instead of playing
    key('Enter');
    check(chatOpen() && document.activeElement === input() && input().value === '', 'Enter must open the box, empty');
    const at = [player.x, player.z, state.showPath];
    key('KeyW', 'w', input()); key('KeyP', 'p', input());
    check(!controls.keys.has('KeyW') && state.showPath === at[2], 'Typing must not walk or toggle the game');
    key('Escape', 'Escape', input());
    check(!chatOpen(), 'Esc must close the box');
    results.push('Enter opens, typing does not play, Esc closes');

    // ` opens it with the / typed: the commands are offered, Tab takes one
    key('Backquote', '`');
    check(chatOpen() && input().value === '/', '` must open the box with a /');
    check(popup().join() === [...popup()].sort().join() && popup().includes('clear') && popup().includes('weapon'),
      'All the commands must be offered, in order: ' + popup());
    key('ArrowDown', 'ArrowDown', input()); key('ArrowDown', 'ArrowDown', input());
    check($('chat-popup').children[2].classList.contains('on'), 'Down must move through the suggestions');
    key('ArrowUp', 'ArrowUp', input()); key('ArrowUp', 'ArrowUp', input()); key('ArrowUp', 'ArrowUp', input());
    check($('chat-popup').lastElementChild.classList.contains('on') && input().value === '/', 'Up from the first must wrap to the last, not leave the suggestions');
    type('gi');
    check(popup()[0] === 'give', '"gi" must offer /give first: ' + popup());
    key('Tab', 'Tab', input());
    check(input().value === '/give ', 'Tab must take /give: ' + JSON.stringify(input().value));
    check(!$('chat-usage').hidden && $('chat-usage').querySelector('b')?.textContent === '<item>', 'The usage must show the item is next');
    type('gr hea');
    check(popup()[0] === 'Greater health potion', 'Several words must find the Greater health potion: ' + popup());
    const potions = countOf(player.inventory, 'item_potion_health_greater');
    key('Enter', 'Enter', input());
    await delay(30);
    check(countOf(player.inventory, 'item_potion_health_greater') === potions + 1, 'Enter must run /give with the best fit');
    check(!chatOpen() && $('chat-popup').hidden, 'After a command the box and its suggestions must close');
    openChat('');
    key('ArrowUp', 'ArrowUp', input());
    check(input().value === '/give gr hea', 'Up must bring the last line back: ' + input().value);
    const typed = JSON.parse(localStorage.getItem('cube-crawler-history'));
    key('ArrowUp', 'ArrowUp', input());
    check(input().value === (typed.at(-2) ?? typed.at(-1)), 'Going through the history goes on through it, not into the suggestions');
    key('Escape', 'Escape', input()); key('Escape', 'Escape', input());
    check(!chatOpen(), 'Esc, Esc must close the popup and then the box');
    results.push('` opens commands / Tab completes names and items / Enter runs the best fit / history');

    // what goes wrong is said, not thrown
    await runCommand('/give long');
    check(last().kind === 'system' && /could be/.test(last().data.text), 'An unclear item must be asked about: ' + last().data.text);
    await runCommand('/nothing');
    check(/no command/.test(last().data.text), 'An unknown command must be named');
    check(!await runCommand('/spawn redback', { dev: false }), 'Without the dev tools the developer commands must not exist');
    results.push('mistakes and missing dev tools are told in the box');

    // the developer commands do what they say
    check(await runCommand('/spawn redback 5 2'), '/spawn must run');
    check(allEnemies().filter(e => e.id.startsWith('dev:') && e.level === 5).length === 2, '/spawn must spawn two level-5 redbacks');
    const xp = player.xp;
    await runCommand('/kill');
    await delay(100);
    check(player.xp > xp && chronicle.entries.some(e => e.kind === 'kill'), '/kill must pay XP and the kill go into the chronicle');
    await runCommand('/passive on'); check(state.devPassive, '/passive on');
    await runCommand('/passive'); check(!state.devPassive, '/passive again wakes them up');
    await runCommand('/god on'); check(player.god, '/god on');
    await runCommand('/god off'); check(!player.god, '/god off');
    await runCommand('/level 5'); check(player.level === 5 && player.hp === player.maxHp, '/level 5');
    results.push('/spawn, /kill, /passive, /god, /level');

    // every base /give offers lands: in the bag (a potion on the quick bar), on the hero (gear),
    // in the purse (coins); a tool the hero carries already is not given twice
    const inv = player.inventory, empty = () => inv.slots.forEach(s => {
      if (s && !isBound(s.itemId) && s.instanceId !== inv.equipped && !isWorn(inv, s.instanceId)) takeItem(inv, s.instanceId);
    });
    for (const { value: id } of commands.types.get('item').values()) {
      empty();
      const def = ITEMS[id], had = countOf(inv, id), copper = copperTotal(inv);
      await runCommand(`/give ${id} 2`);
      await delay(def.weapon ? 30 : 0);
      if (TOOLS.includes(def)) check(countOf(inv, id) === 1 && /already/.test(last().data.text), `/give ${id}: not a second one`);
      else if (def.category === 'currency') check(copperTotal(inv) === copper + 2 * def.value, `/give ${id} 2: into the purse`);
      else check(countOf(inv, id) === had + 2, `/give ${id} 2: ${last().data.text}`);
      if (def.weapon) check(ITEMS[inv.slots.find(s => s?.instanceId === inv.equipped)?.itemId] === def, `/give ${id}: equipped`);
      if (def.armor) check(inv.slots.some(s => s?.itemId === id && isWorn(inv, s.instanceId)), `/give ${id}: worn`);
      // (unless another of its family is there already, or the bar is full: core/inventory.js autoBar)
      if (def.family) check(inv.bar.some(r => r?.itemId && ITEMS[r.itemId].family === def.family) || !inv.bar.includes(null), `/give ${id}: on the quick bar`);
    }
    results.push('/give: every base lands');

    // the chronicle: a new depth, and a death with what did it
    await runCommand('/goto down');
    for (let i = 0; i < 150 && (state.transitioning || !state.map.depth); i++) await delay(50);
    check(chronicle.entries.some(e => e.kind === 'depth' && e.data.depth === state.map.depth), 'Reaching a new depth must go into the chronicle');
    hitPlayer({ damage: 9999, knock: 1, knockDown: true, hop: 2, reason: 'Bitten by a Redback!', by: { label: 'Redback', level: 7 } },
      player.x + 1, player.z, -1, 0);
    for (let i = 0; i < 200 && !chronicle.entries.some(e => e.kind === 'death'); i++) await delay(50);
    const death = chronicle.entries.find(e => e.kind === 'death');
    check(death && death.data.cause === 'Bitten by a Redback!' && death.data.by?.level === 7 && death.data.level === 5
      && death.data.depth === state.map.depth && death.data.weapon, 'The death record: ' + JSON.stringify(death?.data));
    check([...$('chat-log').children].some(li => li.classList.contains('k-death') && /You died: bitten by a Redback \(Lv 7\)/.test(li.textContent)),
      'The death must show in the box');
    check(state.deathAsk && !$('death-overlay').hidden && $('death-cause').textContent === 'Bitten by a Redback!', '"You died" asks what next, and says what did it');
    answerDeath(true);
    check(!state.deathAsk && player.hp === player.maxHp, 'Respawning answers it');
    results.push('depths and deaths with their cause go into the chronicle');

    // open, the log's text is selectable, and a new line leaves the selection be; closed, it is not
    openChat('');
    check(getComputedStyle($('chat-log')).userSelect === 'text', 'The open log must be selectable');
    await runCommand('/seed'); await delay(100);   // (the box shows new lines on the next frame)
    const seedRow = $('chat-log').lastElementChild, range = document.createRange();
    range.selectNodeContents(seedRow);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    await runCommand('/where'); await delay(100);
    check(getSelection().toString().includes(String(state.cubes.seed)) && seedRow.isConnected, 'A new line must keep the selection: ' + getSelection().toString());
    key('KeyC', 'c', document.body);
    check(chatOpen() && document.activeElement === input(), 'A key while the log has the focus goes back to the line (not the game)');
    closeChat();
    check(getSelection().isCollapsed && getComputedStyle($('chat-log')).userSelect === 'none', 'Closed, nothing is selected and the log is not selectable');
    results.push('the open log selects and copies, new lines keep the selection');

    // /goto: a depth's entrance, a cube on this depth, a cube on a depth, a spot; /where says it back
    await runCommand('/goto 2');
    check(state.map.depth === 2 && state.cubeKey === state.cubes.layout(2).up, '/goto 2: the entrance of depth 2, not ' + state.cubeKey);
    const [ox, , oz] = state.cubes.layout(2).route[2].split(',').map(Number);
    await runCommand(`/goto ${ox},${oz}`);
    check(state.cubeKey === state.cubes.layout(2).route[2], `/goto ${ox},${oz}: that cube of this depth, not ${state.cubeKey}`);
    const [px, , pz] = state.cubes.layout(3).route[1].split(',').map(Number);
    await runCommand(`/goto 3 ${px},${pz} ${N / 2},${N / 2}`);
    check(state.cubeKey === state.cubes.layout(3).route[1] && Math.hypot(player.x - N / 2, player.z - N / 2) < 3, `/goto 3 ${px},${pz} ${N / 2},${N / 2}: near the middle of that cube`);
    await runCommand('/where');
    const line = last().data.text.split('\n').at(-1), was = [state.cubeKey, player.x, player.y, player.z];
    check(line.startsWith(`/goto 3 ${px},${pz} `), '/where must say a /goto line: ' + line);
    await runCommand('/goto 0');
    check(state.cubeKey === state.cubes.start, '/goto 0: the town');
    await runCommand(line);
    check(state.cubeKey === was[0] && Math.hypot(player.x - was[1], player.y - was[2], player.z - was[3]) < 0.2, `${line}: back where /where was said`);
    const before = state.cubeKey;
    check(!await runCommand('/goto 3 99,99') && /No cube 99,99/.test(last().data.text) && state.cubeKey === before, 'A cube not on the depth must be refused');
    check(!await runCommand('/goto 3 1,1 99,1'), 'A spot outside the cube must be refused');
    const L3 = state.cubes.layout(3), none = [0, 1, 2, 3].find(d => !L3.exists.has(step(state.cubeKey, d)));
    if (none !== undefined) {
      await runCommand(`/goto ${DIR_NAME[none]}`);
      check(state.cubeKey === before, `/goto ${DIR_NAME[none]}: no cube there, so nowhere`);
    }
    results.push('/goto depth, cube, depth and cube, spot, /where, no cube');

    // chat alone: kept all the same
    key('Enter'); type('hello'); key('Enter', 'Enter', input());
    check(!chatOpen() && chronicle.entries.some(e => e.kind === 'chat' && e.data.text === 'hello' && !e.who), 'A chat line must be kept');
    results.push('chat lines are kept');
    return results;
  } finally { closeChat(); clearInput(); state.devPassive = false; player.god = false; await newWorld(3); }
}
