// The inventory is a paused DOM overlay. Item/equipment rules remain renderer-free.
// I (or V, or the touch bag button) opens the bag, with a Floor column beside it when items lie
// within C's reach (and from then on while it stays open, also once something is dropped).
// Take (Enter or a double-click) moves a floor item into the bag; Drop puts a bag item down.
// You can drop every weapon, even the last one: then you cannot attack until you pick one up.
// Bound items (the portal scrolls) cannot be dropped. Keys 1-6, the Quick bar buttons in the
// details or a tap on a quick bar slot put the selected bag item on the quick bar (again on the
// same slot: off; game/quickbar.js); Use (Enter or a double-click on a bag item, after Equip)
// uses it (and closes the bag): drinks a potion, takes a flask in hand. Trading with a villager (game/orders.js) opens it with their wares in a column
// of their own (core/shops.js): Buy, Enter or a double-click buys one. The Enchanter and the
// Smith work on a weapon from the bag instead (core/crafting.js): the last weapon selected in the
// bag (at first the equipped one) is the one they work on (`work`). The Enchanter's column holds
// her enchantments, each shown as its crystal: one selected says what it would do on that weapon
// and what it costs, Enchant (Enter, a double-click) does it. At the Smith every affix of the
// selected weapon (or piece of armor) has a Re-roll button, and his column holds the armor he
// sells (core/shops.js smithStock): Buy, Enter or a double-click buys it.
// Armor is worn from the bag (Wear / Take off, Enter, a double-click); what is worn shows under
// the hero, a slot each, with what it all adds up to (game/armor.js wornDefense).
// Three tabs: the bag, the quests (game/questpanel.js; U opens the panel there) and, once the
// glassmaker's first glass is found, the memories (game/memorypanel.js: his recordings heard, to
// hear again; playing one stops when the panel closes or the tab changes). Talking to a
// villager (talkTo) opens the quests when they have something new for you (an offer, a quest to
// hand in) or nothing to sell, else the bag with their wares; the other tab is a click away.
// The layout keeps its size whatever is selected: the hero with what it holds on the left
// (render/itemviews.js draws it), the bag with the selected item's actions underneath it, the
// details on the right (scrolling when long). Items show as their models (pictures rendered
// once, render/itemviews.js); the selected one turns.
import { player, state, setStatus } from './state.js';
import { sfx } from '../audio/sfx.js';
import { jingle } from '../audio/jingles.js';
import { ITEMS, COINS, ARMOR_SLOTS, ARMOR_SLOT_NAMES, isGear } from '../core/items.js';
import { BURST_SHARE } from '../core/shots.js';
import { BAR_SIZE, equippedItem, ownedItem, assignBar, barAllowed, barIndexOf, countOf, copperTotal, formatCoins, coinCounts, hasRoom, autoBar, isWorn, wornItem } from '../core/inventory.js';
import { shopOf, priceOf, buy as buyWare, smithStock, buyStock } from '../core/shops.js';
import { flaskStats, cooldownLeft } from '../core/potions.js';
import { xpProgress, levelDamage } from '../core/progression.js';
import { rarityOf } from '../core/gear/rarities.js';
import { itemStats, baseLine, affixEntries, enchantEntry, weaponDps, armorStats, armorReduction, MAX_BLOCK, itemWords } from '../core/gear/stats.js';
import { AFFIX } from '../core/gear/affixes.js';
import { depthLevel } from '../core/enemies.js';
import { ENCHANT, enchantValue, describeEnchant } from '../core/gear/enchants.js';
import { enchantCost, canEnchant, enchantWeapon, rerollCost, rerollWeapon, ENCHANTER_SAYS, SMITH_SAYS, ENCHANTED_SAYS, REROLLED_SAYS, SOLD_SAYS } from '../core/crafting.js';
import { itemName, defName, defDescription } from './itemnames.js';
import { together } from '../net/online.js';
import { equipmentAllowed, equipOwnedWeapon, syncEquippedWeapon, wearArmor, takeOffArmor } from './equipment.js';
import { wornDefense, shieldInHand } from './armor.js';
import { floorItems, takeNow, dropFromBag } from './loot.js';
import { clearInput } from './inputstate.js';
import { cancelCast } from './townportal.js';
import { useItem } from './quickbar.js';
import { log } from './log.js';
import { keyLabel, onSettingsChange } from './settings.js';
import { itemPicture, itemModelReady, onItemPictures, drawLiveViews } from '../render/itemviews.js';
import { readiedFlask, equippedWeapon } from '../core/combat.js';
import { GIVERS, giverQuests, giverOf } from '../core/quests.js';
import { talkQuests, questLog, rescue, questTalk } from './quests.js';
import { openQuests, closeQuests, drawQuests, onQuestChange } from './questpanel.js';
import { drawMemories, memoriesOpen, stopMemories } from './memorypanel.js';
import { tr, msg, num, say, noun, onLanguageChange } from '../i18n/i18n.js';
import { birdFlights } from '../core/qualmos-voyage.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// selected: { from: 'bag', id: instanceId } | { from: 'floor', id: pickup id } |
// { from: 'shop', id: item id (an enchantment's at the Enchanter) } | null; trader: the villager
// whose wares are shown (or null); work: the weapon (instanceId) the Enchanter or the Smith works on
let selected = null, signature = '', shown = null, previousFocus = null, floorMode = false, trader = null, work = null;
// tab: 'bag', 'quests' or 'memories'
let tab = 'bag';
const title = () => tr({ bag: msg('Inventory'), quests: msg('Quests'), memories: msg('Memories') }[tab]);

// the details' Quick bar row: one button per slot
$('inventory-bar-keys').innerHTML = Array.from({ length: BAR_SIZE }, (_, i) => `<button data-bar-key="${i}" aria-pressed="false">${i + 1}</button>`).join('');
const barButtons = [...$('inventory-bar-keys').querySelectorAll('[data-bar-key]')];

export const inventoryFloor = () => state.inventoryOpen && floorMode && tab === 'bag';
// villager: open with their wares (a villager with a shop) instead of the floor, and their quests
// on the quests tab; view: the tab it opens on
export function setInventoryOpen(open, villager = null, view = 'bag') {
  if (open && (!state.map || state.transitioning)) return;
  if (open) cancelCast(state.cast ? tr('Portal cancelled') : '');
  if (open !== state.inventoryOpen) sfx(open ? 'bagOpen' : 'bagClose');
  state.inventoryOpen = open; clearInput();
  $('inventory-overlay').hidden = !open;
  if (open) {
    trader = shopOf(villager) ? villager : null;
    floorMode = !trader && floorItems().length > 0; previousFocus = document.activeElement;
    const first = floorMode && floorItems()[0], stocked = stock()[0];
    const ware = trader && (stocked ? `stock:${stocked.i}` : !shopOf(trader).service && shopOf(trader).wares[0]);
    work = player.inventory.equipped;
    selected = ware ? { from: 'shop', id: ware } : first ? { from: 'floor', id: first.id }
      : player.inventory.equipped ? { from: 'bag', id: player.inventory.equipped } : null;
    openQuests(villager);
    showTab(view);
  } else { trader = null; work = null; closeQuests(); stopMemories(); previousFocus?.focus(); }
}
// show tab `view` ('bag', 'quests' or 'memories'), with the focus on its first thing
function showTab(view) {
  tab = view === 'quests' || view === 'memories' && memoriesOpen() ? view : 'bag';
  if (tab !== 'memories') stopMemories();
  for (const b of $('inventory-tabs').querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  $('inventory-title').textContent = title();
  // all stay laid out, one over the other, so the panel keeps its size between the tabs (style.css)
  document.querySelector('#inventory-panel .inventory-body').classList.toggle('away', tab !== 'bag');
  $('quests-body').classList.toggle('away', tab !== 'quests');
  $('memories-body').classList.toggle('away', tab !== 'memories');
  showKeys();
  signature = ''; updateInventory();
  const ware = trader && $('inventory-shop').querySelector('[data-ware]'), first = floorMode && $('inventory-floor').querySelector('[data-floor]');
  const away = tab === 'bag' ? null : $(`${tab}-body`).querySelector('.quest-entry.selected') ?? $('inventory-tabs').querySelector(`[data-tab="${tab}"]`);
  (away ?? (ware || first || $('inventory-close'))).focus();
}
// talk to villager v: their quests (when they have news for you: a quest to hand in, an offer not
// seen yet; or nothing to sell), else their wares (core/shops.js, core/quests.js)
const seenOffers = new Set();
export function talkTo(v) {
  if (state.inventoryOpen) return;
  if (v?.lost) { rescue(v); return; }   // somebody a quest is looking for (game/questworld.js)
  const said = questTalk(v);   // a letter for them, a question (game/quests.js)
  if (said && !giverOf(v) && !shopOf(v)) { setStatus(said); return; }
  const giver = talkQuests(v), shop = shopOf(v);
  if (!giver && !shop) return;
  const mine = giver ? giverQuests(questLog(), giver) : [];
  const news = mine.some(q => q.state === 'offered' && !seenOffers.has(q.id) || q.state === 'ready' && !q.archived);
  const quests = !!giver && (news || !shop);
  if (quests) for (const q of mine) if (q.state === 'offered') seenOffers.add(q.id);
  setInventoryOpen(true, v, quests ? 'quests' : 'bag');
  if (state.inventoryOpen) setStatus(said ?? (quests ? `${v.title ? say(v.title) : tr(GIVERS[giver]?.title)}: ${news ? tr('hello there!') : tr('hello again.')}`
    : `${tr(shop.title)}: ${tr(shop.hello)}`));
}
export const openShop = talkTo;
// I (or V): the bag, open or closed (from the quests tab: over to the bag)
export const toggleInventory = () => state.inventoryOpen && tab !== 'bag' ? showTab('bag') : setInventoryOpen(!state.inventoryOpen);
// U: the quests, open or closed (from the bag: over to the quests)
export const toggleQuests = () => state.inventoryOpen && tab !== 'quests' ? showTab('quests') : setInventoryOpen(!state.inventoryOpen, null, 'quests');
onQuestChange(() => updateInventory());

// 1-6 with the bag open: the selected bag item onto that quick bar slot (or off it again)
export function assignSelectedToBar(i) {
  if (tab !== 'bag') return false;
  const slot = selected?.from === 'bag' && ownedItem(player.inventory, selected.id);
  if (!slot) { setStatus(tr('Select a bag item to put it on the quick bar')); return false; }
  if (!barAllowed(slot.itemId)) { setStatus(tr('Only weapons and usable items go on the quick bar')); return false; }
  const was = player.inventory.bar[i] && barIndexOf(player.inventory, slot) === i;
  assignBar(player.inventory, i, slot.instanceId);
  setStatus(was ? tr('{item} taken off the quick bar', { item: itemName(slot) }) : tr('{item} on quick bar slot {n}', { item: itemName(slot), n: i + 1 }));
  return true;
}

// a bag item that can go on the quick bar is selected (the bar calls for a tap: game/quickbar.js)
export function barReady() {
  const slot = state.inventoryOpen && selected?.from === 'bag' && ownedItem(player.inventory, selected.id);
  return !!slot && barAllowed(slot.itemId);
}

const floorPickup = id => floorItems().find(p => p.id === id) || null;
// The Smith's armor for sale now (core/shops.js smithStock): [{ item, price, i }], without what was
// bought this visit (state.run.smith). Its wares are selected as 'stock:<i>'.
let stockMade = null;
function stock() {
  if (!shopOf(trader)?.stock || !state.cubes) return [];
  const r = state.run.smith, deepest = state.run.quests.deepest, key = `${state.cubes.seed}:${r.visit}:${deepest}`;
  if (stockMade?.key !== key) stockMade = { key, list: smithStock(state.cubes.seed, deepest, r.visit).map((w, i) => ({ ...w, i })) };
  return stockMade.list.filter(w => !r.sold.includes(w.i));
}
const stockWare = id => typeof id === 'string' && id.startsWith('stock:') ? stock().find(w => `stock:${w.i}` === id) ?? null : null;
function selectedItem() {
  if (selected?.from === 'bag') return ownedItem(player.inventory, selected.id);
  if (selected?.from === 'floor') return floorPickup(selected.id);
  if (selected?.from === 'shop' && stockWare(selected.id)) return stockWare(selected.id).item;
  if (selected?.from === 'shop' && trader && shopOf(trader).wares.includes(selected.id))
    return ENCHANT[selected.id] ? { itemId: ENCHANT[selected.id].crystal, count: 1, enchant: selected.id } : { itemId: selected.id, count: 1 };
  return null;
}
// what the selected ware costs (copper)
const wareCost = item => stockWare(selected?.id)?.price ?? priceOf(item.itemId);
// the weapon the Enchanter works on, or the weapon or armor the Smith does (null: none)
function workItem() {
  const w = work && ownedItem(player.inventory, work);
  return w?.gen && (service() === 'reroll' ? isGear(w.itemId) : ITEMS[w.itemId]?.weapon) ? w : null;
}
const service = () => shopOf(trader)?.service ?? null;
const pick = list => list[Math.floor(Math.random() * list.length)];
// an enchantment selected at the Enchanter: what it would do on the weapon, what it costs
function enchantText(id) {
  const e = ENCHANT[id], w = workItem(), lines = [];
  if (!w) return tr(e.quip);
  const now = enchantEntry(w);
  lines.push(describeEnchant(id, enchantValue(w, id)), tr(e.quip));
  if (now?.id === id) lines.push(tr('It is {name} already', { name: tr(e.name) }));
  else if (now) lines.push(tr('Replaces {name}', { name: now.name }));
  return lines.join('\n');
}
// a potion or flask: what it does (a flask's numbers at the player's level, buffs included),
// its cooldown, how many you have; in a shop its price
function potionText(item, from) {
  const def = ITEMS[item.itemId], have = countOf(player.inventory, def.id), lines = [];
  if (from === 'bag') lines.push(tr('Count {n}', { n: have }));
  lines.push(defDescription(def));
  if (def.flask) {
    const f = flaskStats(def, player.level);
    if (f.blast) lines.push(tr('Bursts for up to {damage} damage within {radius} cells', { damage: f.blast, radius: f.radius }));
    else lines.push(tr('Bursts over {radius} cells', { radius: f.radius }));
    if (f.burn) lines.push(tr('Burns for {damage} over {time} s; the ground burns {patch} s', { damage: f.burn.damage, time: f.burn.time, patch: f.patch }));
    if (f.toxin) lines.push(tr('Poisons for {damage} over {time} s; the cloud lingers {cloud} s', { damage: f.toxin.damage, time: f.toxin.time, cloud: f.cloud }));
  }
  const wait = cooldownLeft(player, def.id, state.time);
  lines.push(wait > 0 ? tr('One every {time} s (ready in {wait} s)', { time: def.cooldown, wait: num(wait, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
    : tr('One every {time} s', { time: def.cooldown }));
  if (from === 'shop') lines.push(tr('You have {n}', { n: have }));
  return lines.join('\n');
}

// the weapon's stats as the player would swing it (the level's damage bonus included), and how
// they compare with what is equipped
function swung(item) {
  const s = itemStats(item);
  return { ...s, damage: Math.round(s.damage * levelDamage(player.level || 1)), speed: 1 / s.interval };
}
// whether it is an OMG item, all colours at once (style.css .rainbow)
const rainbow = item => !!(item?.gen && rarityOf(item).glow?.rainbow);
const KIND_NAMES = { sword: msg('Sword'), flail: msg('Flail · swings wide, shoves hard'), bow: msg('Bow · shoots arrows'),
  crossbow: msg('Crossbow · shoots bolts'), staff: msg('Staff · casts spells') };
const fixed = (v, d) => num(v, { minimumFractionDigits: d, maximumFractionDigits: d });
// its rarity, and its item level if it has one
const rarityLine = (item, r) => item.gen ? tr('{rarity} · item level {level}', { rarity: tr(r.name), level: item.gen.ilvl }) : tr(r.name);
function weaponText(item) {
  const s = swung(item), r = rarityOf(item);
  const lines = [rarityLine(item, r), tr(KIND_NAMES[s.kind]),
    tr('Damage {damage} · {speed} attacks per second', { damage: s.damage, speed: fixed(s.speed, 2) }),
    tr('Damage per second {dps}', { dps: Math.round(weaponDps(s)) }),
    s.ranged ? tr('Range {range} cells', { range: fixed(s.range, 1) }) : tr('Reach {range} cells', { range: fixed(s.range, 2) }),
    tr('Critical hits {chance}% for ×{times}', { chance: Math.round(s.crit * 100), times: fixed(s.critDamage, 2) })];
  if (s.balls > 1) lines.push(s.balls === 2 ? tr('Two balls: each strikes, one after the other') : tr('Three balls: each strikes, one after the other'));
  if (s.pierce) lines.push(tr('{n, plural, one {Bolts pierce # enemy} other {Bolts pierce # enemies}}', { n: s.pierce }));
  if (s.burst) lines.push(tr('Bursts for {share}% damage within {radius} cells', { share: Math.round(BURST_SHARE * 100), radius: fixed(s.burst, 2) }));
  return lines.join('\n');
}
// against the equipped weapon, stat by stat: what you have now -> this one
function compareText(item) {
  const eq = equippedItem(player.inventory);
  if (!eq) return `<p>${esc(tr('You have no weapon equipped.'))}</p>`;
  if (selected?.from === 'bag' && selected.id === eq.instanceId) return '';
  const now = swung(eq), next = swung(item);
  const row = (label, f, digits = 0) => {
    const a = f(now), b = f(next), d = Number(b.toFixed(digits)) - Number(a.toFixed(digits));
    return `<span>${esc(tr(label))}</span><span>${fixed(a, digits)}</span><span class="arrow">→</span><span class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${fixed(b, digits)}</span>`;
  };
  const reach = s => s.ranged ? msg('Range') : msg('Reach');
  return `<p>${esc(tr('Current ({item}) → this', { item: itemName(eq) }))}</p><div class="compare-grid">${[
    row(msg('Damage per second'), s => Math.round(weaponDps(s))),
    row(msg('Damage'), s => s.damage),
    row(msg('Attacks per second'), s => s.speed, 2),
    row(reach(now) === reach(next) ? reach(next) : msg('Reach / range'), s => s.range, 2),
    row(msg('Critical chance %'), s => Math.round(s.crit * 100))].join('')}</div>`;
}

// A piece of armor: its rarity and item level, its slot, what it takes off a blow from an enemy of
// the depth's level (the deepest anyone got to: what you meet), its block and speed. The affixes
// come under it, like a weapon's.
const pct = x => Math.round(x * 100);
const PERKS = { regen: msg('{v}% faster healing'), burnResist: msg('{v}% less hurt by fire'), poisonResist: msg('{v}% less hurt by poison'),
  life: msg('+{v} health'), steady: msg('{v}% less shoved about') };
const SLOT_ARMOR = { head: msg('Head armor'), body: msg('Body armor'), feet: msg('Feet armor') };
const NOTHING_WORN = { head: msg('Nothing worn on your head yet.'), body: msg('Nothing worn on your body yet.'),
  shield: msg('Nothing in your off hand yet.'), feet: msg('Nothing worn on your feet yet.') };
const against = () => Math.max(depthLevel(state.map?.depth ?? 0), depthLevel(state.run?.quests.deepest ?? 0));
function armorText(item) {
  const s = armorStats(item), r = rarityOf(item), level = against();
  const def = ITEMS[item.itemId], what = s.slot !== 'shield' ? tr(SLOT_ARMOR[s.slot]) : def.category === 'armor' ? tr('Shield') : tr('Carried in the off hand');
  const lines = [rarityLine(item, r), what,
    tr('Armor {armor} · takes {share}% off blows (level {level})', { armor: s.armor, share: pct(armorReduction(s.armor, level)), level })];
  if (s.block) lines.push(def.category === 'armor' ? tr('Blocks {v}% of blows (not with a bow in hand: it goes on your back)', { v: s.block })
    : tr('Blocks {v}% of blows (not with a bow in hand)', { v: s.block }));
  if (s.moveSpeed && ITEMS[item.itemId].armor.speed) lines.push(tr('{v}% faster on your feet', { v: ITEMS[item.itemId].armor.speed }));
  for (const [k, v] of Object.entries(ITEMS[item.itemId].armor.perks ?? {})) lines.push(tr(PERKS[k], { v }));   // (a hat's own)
  if (def.voyagePart === 'bird') lines.push(tr('Flights left: {n}', { n: birdFlights(state.run?.told, def.voyageChapter) }));
  if (def.description) lines.push(defDescription(def));
  if (selected?.from === 'bag' && isWorn(player.inventory, item.instanceId)) lines.push(tr('Worn'));
  return lines.join('\n');
}
// against what is worn in its slot, stat by stat
function compareArmorText(item) {
  const s = armorStats(item), worn = wornItem(player.inventory, s.slot);
  if (!worn) return `<p>${esc(tr(NOTHING_WORN[s.slot]))}</p>`;
  if (selected?.from === 'bag' && selected.id === worn.instanceId) return '';
  const now = armorStats(worn);
  const row = (label, k) => {
    const a = now[k], b = s[k], d = b - a;
    return a || b ? `<span>${esc(tr(label))}</span><span>${a}</span><span class="arrow">→</span><span class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${b}</span>` : '';
  };
  return `<p>${esc(tr('Worn ({item}) → this', { item: itemName(worn) }))}</p><div class="compare-grid">${[
    row(msg('Armor'), 'armor'), row(msg('Block %'), 'block'), row(msg('Faster %'), 'moveSpeed'), row(msg('Health'), 'life'), row(msg('Healing %'), 'regen'),
    row(msg('Less fire %'), 'burnResist'), row(msg('Less poison %'), 'poisonResist'), row(msg('Less shove %'), 'steady')].join('')}</div>`;
}

// the colour enchantments are named in (the Enchanter's tint, a little brighter)
const ENCHANT_CSS = '#8fe3d6';
// a weapon's affix lines with their names, then its enchantment; at the Smith (reroll) each
// affix with a Re-roll button, and what one costs
function affixesHtml(item, reroll) {
  const cost = reroll ? rerollCost(item) : null, copper = copperTotal(player.inventory);
  const lines = affixEntries(item).map((a, i) => cost === null ? `<li>${esc(a.text)} <span class="affix-name">${esc(a.name)}</span></li>`
    : `<li class="rerollable"><span>${esc(a.text)} <span class="affix-name">${esc(a.name)}</span></span><button class="reroll" data-reroll="${i}"${copper < cost
      ? ` disabled title="${esc(tr('Not enough coins'))}"` : ` title="${esc(tr('Re-roll {name} · {price}', { name: a.name, price: formatCoins(cost) }))}"`}>${esc(tr('Re-roll'))}</button></li>`);
  const e = enchantEntry(item);
  if (e) lines.push(`<li class="enchant">${esc(e.text)} <span class="affix-name">${esc(e.name)}</span></li>`);
  return lines.join('');
}

// What things cost where the villagers trade, under the description: every coin and crystal
// with its picture, and what you have of it (red when it is not enough).
const icon = id => `<img src="${itemPicture(id)}" alt="">`;
const COIN_COUNTS = [msg('{n} gold'), msg('{n} silver'), msg('{n} copper')];
function coinsHtml(copper) {
  const coin = (i, n) => `<span class="price-part">${icon(COINS[i].id)}${esc(tr(COIN_COUNTS[i], { n }))}</span>`;
  const parts = coinCounts(copper).map((n, i) => n ? coin(i, n) : '').filter(Boolean);
  return parts.length ? parts.join(' ') : coin(2, 0);
}
// a row: what it takes, and what you have (`have`: text, `short`: not enough)
const priceRow = (what, have, short) => `<div class="price-row"><span class="price-what">${what}</span><span class="price-have${short ? ' short' : ''}">${have}</span></div>`;
const coinRow = copper => { const have = copperTotal(player.inventory); return priceRow(coinsHtml(copper), esc(tr('you have {n}', { n: formatCoins(have) })), have < copper); };
const crystalRow = (crystal, count) => {
  const have = countOf(player.inventory, crystal);
  return priceRow(`<span class="price-part">${icon(crystal)}${count} ${esc(defName(ITEMS[crystal]))}</span>`, esc(tr('you have {n}', { n: have })), have < count);
};
const priceBox = (title, rows, note = '') => `<h3>${esc(title)}</h3>${rows.join('')}${note ? `<p class="price-note">${esc(note)}</p>` : ''}`;
// the price block for what the selected thing would be bought or done for: a ware, an
// enchantment (on the weapon worked on), a re-roll at the Smith; '' for none
function priceHtml(item, def) {
  const shop = shopOf(trader), w = workItem();
  if (!shop || !item) return '';
  if (item.enchant) {
    if (!w) return priceBox(tr('Price'), [], tr('Select a weapon in your bag: the price depends on it.'));
    const cost = enchantCost(w, item.enchant);
    return priceBox(tr('Price for {item}', { item: itemName(w) }), [crystalRow(cost.crystal, cost.count), coinRow(cost.copper)]);
  }
  if (selected?.from === 'shop' && stockWare(selected.id)) return priceBox(tr('Price'), [coinRow(stockWare(selected.id).price)]);
  if (selected?.from === 'shop' && def?.price) return priceBox(tr('Price'), [coinRow(def.price)]);
  if (selected?.from !== 'bag' || !isGear(def?.id) || !item.gen) return '';
  if (shop.service === 'reroll') {
    const cost = rerollCost(item);
    if (cost === null) return priceBox(tr('Re-rolling'), [], tr('Nothing to re-roll: only Decent and better things have lines to hammer.'));
    return priceBox(tr('Each re-roll costs'), [coinRow(cost)], tr('The line becomes another affix (or itself, rolled anew).'));
  }
  return '';
}

export function updateInventory() {
  $('inventory-overlay').hidden = !state.inventoryOpen;
  if (!state.inventoryOpen) return;
  if (tab === 'quests') drawQuests();
  if (tab === 'memories') drawMemories();
  $('inventory-tabs').querySelector('[data-tab="memories"]').hidden = !memoriesOpen();
  if (!floorMode && !trader && floorItems().length) floorMode = true;   // something was put down
  const inv = player.inventory, equipped = equippedItem(inv), allowed = equipmentAllowed(), floor = floorMode ? floorItems() : [];
  if (selected && !selectedItem()) selected = null;
  const item = selectedItem(), sel = selected ? `${selected.from}:${selected.id}` : '';
  const next = `${inv.version}:${sel}:${work}:${floorMode}:${trader?.name}:${floor.map(p => p.id)}:${allowed}:${state.equipping}:${player.hp}:${player.maxHp}:${player.xp}:${state.statusMsg}:${together()}:${state.run?.smith.visit}/${state.run?.smith.sold.length}:${shieldInHand()}`;
  if (next !== signature || inv !== shown) draw(next, inv, equipped, allowed, floor, item);
  // the hero and the selected item turning (render/itemviews.js; real time: the game is paused)
  // (not while the quests are in front: the bag's views are there, unseen)
  if (tab === 'bag') drawLiveViews($('inventory-panel'), (readiedFlask(player) ?? equippedWeapon(player))?.id ?? null, performance.now() / 1000);
}
function draw(next, inv, equipped, allowed, floor, item) {
  signature = next; shown = inv;
  const xp = xpProgress(player), shop = shopOf(trader);
  const picture = (itemId, on) => on && itemModelReady(itemId) ? `<canvas data-live-item="${itemId}"></canvas>` : `<img src="${itemPicture(itemId)}" alt="">`;

  const column = !!shop?.wares.length || !!shop?.stock, w = workItem();
  $('inventory-panel').classList.toggle('with-floor', floorMode || column);
  $('inventory-floor-col').hidden = !floorMode;
  $('inventory-shop-col').hidden = !column;
  $('inventory-progress').textContent = tr('Level {level} · XP {xp}/{need} · HP {hp}/{max}',
    { level: player.level, xp: xp.current, need: xp.required, hp: Math.ceil(player.hp), max: player.maxHp });
  // the loadout under the hero
  const color = equipped?.gen ? ` style="color:${rarityOf(equipped).css}"${rarityOf(equipped).glow?.rainbow ? ' class="rainbow"' : ''}` : '';
  const d = wornDefense(), level = against();
  $('inventory-equipped').innerHTML = `<small>${tr('Weapon')}</small><b${color}>${esc(equipped ? itemName(equipped) : tr('None (you cannot attack)'))}</b>`
    + `<small>${tr('In hand')}</small><b>${esc(inv.readied ? defName(ITEMS[inv.readied]) : equipped ? itemName(equipped) : tr('Nothing'))}</b>`
    + `<small>${tr('Level bonus')}</small><b>${tr('+{v}% damage', { v: Math.round((levelDamage(player.level || 1) - 1) * 100) })}</b>`
    + `<small>${tr('Armor')}</small><b title="${esc(tr('Against level {level} enemies', { level }))}">${esc(tr('{armor} · {share}% off blows', { armor: d.armor, share: pct(armorReduction(d.armor, level)) }))}</b>`
    + (wornItem(inv, 'shield') ? `<small>${tr('Block')}</small><b>${esc(shieldInHand() ? d.block >= MAX_BLOCK ? tr('{v}% of blows (most)', { v: d.block }) : tr('{v}% of blows', { v: d.block })
      : tr('None with a bow in hand'))}</b>` : '');
  // what is worn, a slot each: a click selects it in the bag
  $('inventory-worn').innerHTML = ARMOR_SLOTS.map(slot => {
    const s = wornItem(inv, slot), on = !!s && selected?.from === 'bag' && selected.id === s.instanceId;
    const rarity = s?.gen && rarityOf(s).glow ? ` style="--rarity:${rarityOf(s).css}"` : '';
    const name = esc(tr(ARMOR_SLOT_NAMES[slot]));
    return `<button class="inventory-slot worn-slot${on ? ' selected' : ''}${rainbow(s) ? ' rainbow' : ''}"${rarity} data-worn="${slot}" aria-label="${name}: ${s ? esc(itemName(s)) : esc(tr('nothing'))}" title="${name}: ${s ? esc(itemName(s)) : esc(tr('nothing worn'))}">${s ? picture(s.itemId, false) : `<span class="slot-name">${name}</span>`}</button>`;
  }).join('');
  $('inventory-currency').innerHTML = COINS.map((c, i) => `<div class="coin-slot" title="${esc(defName(c))}"><img src="${itemPicture(c.id)}" alt=""><div><small>${esc(defName(c))}</small><b>${inv.currency[i].count}</b></div></div>`).join('');
  const focus = document.activeElement?.dataset;
  const focusSlot = focus?.slot, focusFloor = focus?.floor, focusWare = focus?.ware;
  // the floor and the wares: a strip of square slots beside the bag (a row over it on a phone)
  if (column) {
    const copper = copperTotal(inv);
    $('inventory-shop-title').textContent = tr(shop.title);
    $('inventory-shop-title').title = `${tr(shop.title)} · ${tr(shop.trade)}`;
    // the Smith's: his armor, each one of a kind, in its rarity's colour, with its price
    if (shop.stock) $('inventory-shop').innerHTML = stock().map(({ item, price, i }) => {
      const id = `stock:${i}`, on = selected?.from === 'shop' && selected.id === id, r = rarityOf(item);
      return `<button class="inventory-slot side-slot${on ? ' selected' : ''}${copper < price ? ' poor' : ''}${rainbow(item) ? ' rainbow' : ''}" role="option" aria-selected="${on}" data-ware="${id}"${r.glow ? ` style="--rarity:${r.css}"` : ''} aria-label="${esc(itemName(item))}, ${formatCoins(price)}" title="${esc(itemName(item))} · ${formatCoins(price)}">${picture(item.itemId, on)}<span class="price">${formatCoins(price)}</span></button>`;
    }).join('') || `<div class="floor-empty">${esc(tr('Sold out'))}</div>`;
    // the Enchanter's: each enchantment as its crystal, dimmed when it cannot be had now, ringed
    // when the weapon has it
    else if (shop.service === 'enchant') $('inventory-shop').innerHTML = shop.wares.map(id => {
      const e = ENCHANT[id], on = selected?.from === 'shop' && selected.id === id, has = w?.gen.enchant === id;
      const poor = !has && (!w || canEnchant(inv, w.instanceId, id) !== 'ok');
      const name = esc(tr(e.name));
      return `<button class="inventory-slot side-slot${on ? ' selected' : ''}${poor ? ' poor' : ''}${has ? ' worn' : ''}" role="option" aria-selected="${on}" data-ware="${id}" aria-label="${has ? esc(tr('{name}, on it', { name: tr(e.name) })) : name}" title="${name} · ${esc(defName(ITEMS[e.crystal]))}">${picture(e.crystal, on)}<span class="price">${name}</span></button>`;
    }).join('');
    else $('inventory-shop').innerHTML = shop.wares.map(id => {
      const def = ITEMS[id], on = selected?.from === 'shop' && selected.id === id, price = priceOf(id);
      return `<button class="inventory-slot side-slot${on ? ' selected' : ''}${copper < price ? ' poor' : ''}" role="option" aria-selected="${on}" data-ware="${id}" aria-label="${esc(defName(def))}, ${formatCoins(price)}" title="${esc(defName(def))} · ${formatCoins(price)}">${picture(id, on)}<span class="price">${formatCoins(price)}</span></button>`;
    }).join('');
    if (focusWare !== undefined) $('inventory-shop').querySelector(`[data-ware="${focusWare}"]`)?.focus();
  }
  if (floorMode) $('inventory-floor').innerHTML = floor.length ? floor.map(p => {
    const on = selected?.from === 'floor' && selected.id === p.id, color = p.gen && rarityOf(p).glow ? rarityOf(p).css : '';
    return `<button class="inventory-slot side-slot${on ? ' selected' : ''}${rainbow(p) ? ' rainbow' : ''}" role="option" aria-selected="${on}" data-floor="${p.id}"${color ? ` style="--rarity:${color}"` : ''} aria-label="${esc(itemName(p))}${p.count > 1 ? `, ${p.count}` : ''}" title="${esc(itemName(p))}">${picture(p.itemId, on)}${p.count > 1 ? `<span class="count">${p.count}</span>` : ''}</button>`;
  }).join('') : `<div class="floor-empty">${esc(tr('Nothing here'))}</div>`;
  $('inventory-grid').innerHTML = inv.slots.map((s, i) => {
    const def = s && ITEMS[s.itemId], on = !!s && selected?.from === 'bag' && s.instanceId === selected.id;
    const rarity = s?.gen && rarityOf(s).glow ? ` style="--rarity:${rarityOf(s).css}"` : '';
    const key = s ? barIndexOf(inv, s) : -1;
    const worn = s && (s.instanceId === inv.equipped || s.itemId === inv.readied || isWorn(inv, s.instanceId));
    // the border says how it is used (equipped or in hand: light blue; on the quick bar: dark
    // blue), the backdrop its rarity
    const worked = !!s && !on && !!w && s.instanceId === w.instanceId && !!shop?.service;   // what the Enchanter or the Smith works on
    return `<button class="inventory-slot${on ? ' selected' : ''}${worked ? ' work' : ''}${rainbow(s) ? ' rainbow' : ''}${worn ? ' worn' : key >= 0 ? ' on-bar' : ''}"${rarity} data-slot="${i}" aria-pressed="${on}" aria-label="${esc(def ? [`${itemName(s)}, ${s.count}`, ...s.instanceId === inv.equipped ? [tr('equipped')] : [], ...isWorn(inv, s.instanceId) ? [tr('worn')] : [],
      ...s.itemId === inv.readied ? [tr('in hand')] : [], ...key >= 0 ? [tr('quick bar {n}', { n: key + 1 })] : []].join(', ') : tr('Empty slot {n}', { n: i + 1 }))}" title="${esc(def ? itemName(s) : tr('Empty'))}">${s ? `${picture(s.itemId, on)}${s.count > 1 ? `<span class="count">${s.count}</span>` : ''}${worn ? '<span class="equipped">E</span>' : ''}${key >= 0 ? `<span class="bar-key">${key + 1}</span>` : ''}` : ''}</button>`;
  }).join('');
  if (focusSlot !== undefined) $('inventory-grid').querySelector(`[data-slot="${focusSlot}"]`)?.focus();
  if (focusFloor !== undefined) ($('inventory-floor').querySelector(`[data-floor="${focusFloor}"]`)
    || $('inventory-floor').querySelector('[data-floor]') || $('inventory-grid').querySelector('[data-slot]'))?.focus();
  const def = item && ITEMS[item.itemId], view = $('inventory-item-view');
  // the selected item turning (render/itemviews.js), once its model is in
  if (def) itemPicture(def.id);
  view.style.visibility = def && itemModelReady(def.id) ? '' : 'hidden';
  if (def) view.dataset.liveItem = def.id; else delete view.dataset.liveItem;
  const ench = item?.enchant ?? null;   // an enchantment at the Enchanter
  $('inventory-item-name').textContent = ench ? tr(ENCHANT[ench].name) : item ? itemName(item) : tr('Select an item');
  $('inventory-item-name').style.color = ench ? ENCHANT_CSS : item?.gen ? rarityOf(item).css : '';
  $('inventory-item-name').classList.toggle('rainbow', rainbow(item));
  $('inventory-item-base').textContent = ench ? (w ? tr('Enchantment for {item}', { item: itemName(w) }) : tr('Enchantment')) : item ? baseLine(item) ?? '' : '';
  // the Quick bar row: the slot it is on lit (again: off)
  const barKey = selected?.from === 'bag' ? barIndexOf(inv, item) : -1, barShown = !!item && selected?.from === 'bag' && barAllowed(item.itemId);
  $('inventory-bar').style.visibility = barShown ? '' : 'hidden';   // (its room stays: the dialog keeps its size)
  barButtons.forEach((b, i) => {
    b.classList.toggle('on', i === barKey);
    b.setAttribute('aria-pressed', String(i === barKey));
    b.title = i === barKey ? tr('Take it off quick bar slot {n}', { n: i + 1 }) : tr('Put it on quick bar slot {n}', { n: i + 1 });
  });
  $('inventory-item-stats').textContent = (ench ? enchantText(ench)
    : def?.weapon ? weaponText(item)
    : def?.armor ? armorText(item)
    : def?.effect || def?.flask ? potionText(item, selected?.from)
    : def?.use ? [...def.stackLimit > 1 ? [tr('Count {n}', { n: item.count })] : [], defDescription(def), ...def.bound ? [tr('Bound: it cannot be dropped')] : []].join('\n')
    : def ? [tr('Count {n}', { n: item.count }), tr('Stack limit {n}', { n: def.stackLimit }), def.description ? defDescription(def) : tr('No use action yet')].join('\n')
    : selected ? '' : tr('Select a bag slot to inspect it.'));
  $('inventory-item-compare').hidden = !(def?.weapon || def?.armor) || !!ench;
  $('inventory-item-affixes').innerHTML = item && !ench ? affixesHtml(item, selected?.from === 'bag' && service() === 'reroll') : '';
  $('inventory-item-compare').innerHTML = ench ? '' : def?.weapon ? compareText(item) : def?.armor ? compareArmorText(item) : '';
  const price = priceHtml(item, def);
  $('inventory-item-price').hidden = !price;
  $('inventory-item-price').innerHTML = price;
  const inBag = selected?.from === 'bag', isEquipped = inBag && item?.instanceId === inv.equipped;
  const equip = $('inventory-equip'), take = $('inventory-take'), drop = $('inventory-drop'), use = $('inventory-use'), buy = $('inventory-buy');
  use.hidden = !inBag || !def?.use;
  use.textContent = def?.use === 'drink' ? tr('Drink') : def?.use === 'throw' ? (inv.readied === def.id ? tr('Put away') : tr('Take in hand')) : tr('Use');
  const fromShop = selected?.from === 'shop' && !!item && !ench, poor = fromShop && copperTotal(inv) < wareCost(item);
  const full = fromShop && !hasRoom(inv) && (!!item.gen || !inv.slots.some(s => s?.itemId === item.itemId && s.count < ITEMS[s.itemId].stackLimit));
  buy.hidden = !fromShop && !ench;
  if (ench) {   // the Enchanter's Enchant
    const why = w ? canEnchant(inv, w.instanceId, ench) : 'unknown', cost = w && enchantCost(w, ench);
    buy.disabled = why !== 'ok';
    buy.textContent = w ? tr('Enchant · {price}', { price: formatCoins(cost.copper) }) : tr('Enchant');
    buy.title = { poor: () => tr('Not enough coins'), crystals: () => w && tr('Needs {n} {crystal}', { n: cost.count, crystal: defName(ITEMS[cost.crystal]) }),
      same: () => tr('It is {name} already', { name: tr(ENCHANT[ench].name) }), unknown: () => tr('Select a weapon in your bag first') }[why]?.() ?? '';
  } else {
    buy.disabled = poor || full;
    buy.textContent = fromShop ? tr('Buy · {price}', { price: formatCoins(wareCost(item)) }) : tr('Buy');
    buy.title = poor ? tr('Not enough coins') : full ? tr('Your bag is full') : '';
  }
  equip.hidden = !inBag || !(def?.weapon || def?.armor);
  if (def?.armor) {   // armor goes on and off at any time
    const on = isWorn(inv, item.instanceId);
    equip.disabled = false; equip.textContent = def.voyagePart === 'bird' ? (on ? tr('Put away') : tr('Hold in hand')) : on ? tr('Take off') : tr('Wear');
    equip.title = on ? '' : wornItem(inv, def.armor.slot) ? tr('Instead of {item}', { item: itemName(wornItem(inv, def.armor.slot)) }) : '';
  } else {
    equip.disabled = !allowed || isEquipped;
    equip.textContent = isEquipped ? tr('Equipped') : tr('Equip');
    equip.title = allowed ? '' : tr('Close inventory and finish your current action first');
  }
  take.hidden = selected?.from !== 'floor' || !item;
  take.disabled = !!item?.gen && !inv.slots.includes(null);
  take.title = take.disabled ? tr('Your bag is full') : '';
  drop.hidden = !inBag || !item;
  drop.disabled = isEquipped && !allowed || !!def?.bound;
  drop.title = def?.bound ? tr('Bound: it cannot be dropped') : '';
  $('inventory-feedback').title = $('inventory-feedback').textContent = state.equipping ? tr('Loading weapon…') : !allowed ? tr('Finish your current action before changing weapons.') : state.statusMsg;
}
const refresh = () => { signature = ''; updateInventory(); };
onItemPictures(() => { signature = ''; });   // a model's picture is in: show it

// move the selected item across: floor -> bag, bag -> floor
function take() {
  const p = selected?.from === 'floor' && floorPickup(selected.id);
  if (!p) return;
  const at = floorItems().indexOf(p);
  if (takeNow(p)) {
    const rest = floorItems(), next = rest[Math.min(at, rest.length - 1)];
    selected = next ? { from: 'floor', id: next.id } : null;
  }
  refresh();
}
async function drop() {
  const id = selected?.from === 'bag' && selected.id;
  if (!id) return;
  const wasEquipped = player.inventory.equipped === id, readied = player.inventory.readied;
  if (wasEquipped && !equipmentAllowed()) return;
  const index = player.inventory.slots.findIndex(s => s?.instanceId === id);
  if (!dropFromBag(id)) return;
  if (wasEquipped) { syncEquippedWeapon(); setStatus(tr('No weapon equipped: you cannot attack')); }
  else if (readied && !player.inventory.readied) syncEquippedWeapon();   // the last flask in hand went
  const next = player.inventory.slots.slice(index).find(Boolean) || player.inventory.slots.find(Boolean);
  selected = next ? { from: 'bag', id: next.instanceId } : null;
  refresh();
}
// the Enchanter puts enchantment `id` on the weapon she works on
function enchant(id) {
  const w = workItem();
  if (!w) { setStatus(tr('Select a weapon in your bag first')); return; }
  // its name before: once enchanted the name carries the enchantment ("made Duskfang Toasty")
  const cost = enchantCost(w, id), was = enchantEntry(w), before = itemWords(w), done = enchantWeapon(player.inventory, w.instanceId, id);
  if (done === 'ok') {
    if (!jingle('enchant')) sfx('spell', { pitch: 1.2 });
    sfx('coin', { pitch: 0.8 });
    const says = tr(ENCHANTED_SAYS[id]);
    setStatus(`${tr('Enchanter')}: ${was ? tr('{says} ({name} wandered off, offended.)', { says, name: was.name }) : says}`);
    log('craft', { what: 'enchant', item: before, enchant: id, copper: cost.copper });
  } else setStatus({ poor: () => tr('Not enough coins'), crystals: () => tr('Not enough {crystal} ({n} needed)', { crystal: defName(ITEMS[cost.crystal]), n: cost.count }),
    same: () => tr('It is {name} already', { name: tr(ENCHANT[id].name) }), unknown: () => tr('That cannot be enchanted') }[done]?.());
  refresh();
}
// the Smith re-rolls affix i of the selected weapon
function reroll(i) {
  const w = selected?.from === 'bag' && ownedItem(player.inventory, selected.id);
  if (!w || service() !== 'reroll') return;
  const ids = a => (a.gen?.affixes ?? []).map(x => x.id);
  const cost = rerollCost(w), before = ids(w), was = before[i], words = itemWords(w), done = rerollWeapon(player.inventory, w.instanceId, i);
  if (done === 'ok') {
    sfx('hit', { pitch: 1.5 }); sfx('coin', { pitch: 0.8 }); if (!jingle('enchant')) sfx('clink', { pitch: 0.7 });
    const rest = before.filter((_, j) => j !== i), into = ids(w).find(n => !rest.includes(n)) ?? was;
    setStatus(`${tr('Smith')}: ${tr(pick(REROLLED_SAYS))} (${tr(AFFIX[was].name)} → ${tr(AFFIX[into].name)})`);
    log('craft', { what: 'reroll', item: words, affix: was, into, copper: cost });
  } else setStatus(done === 'poor' ? tr('Not enough coins') : tr('Nothing to re-roll'));
  refresh();
}
// buy one of the selected ware (at the Enchanter: enchant the weapon with it)
function buy() {
  const id = selected?.from === 'shop' && selected.id;
  if (!id || !trader) return;
  if (service() === 'enchant') { enchant(id); return; }
  const ware = stockWare(id);
  if (ware) {   // the Smith's armor: one of a kind
    const name = itemName(ware.item), words = itemWords(ware.item), done = buyStock(player.inventory, ware);
    if (done === 'ok') {
      state.run.smith.sold.push(ware.i);
      sfx('coin', { pitch: 0.8 }); sfx('clink', { pitch: 0.7 });
      setStatus(`${tr('Bought {item} for {price}.', { item: name, price: formatCoins(ware.price) })} ${tr('Smith')}: ${tr(pick(SOLD_SAYS))}`);
      log('trade', { item: words, copper: ware.price });
      const rest = stock();
      selected = rest.length ? { from: 'shop', id: `stock:${rest[0].i}` } : null;
    } else setStatus({ poor: tr('Not enough coins'), full: tr('Your bag is full') }[done]);
    refresh();
    return;
  }
  const done = buyWare(player.inventory, id);
  if (done === 'ok') {
    autoBar(player.inventory, id);
    sfx('coin', { pitch: 0.8 }); sfx('pickup');
    setStatus(tr('Bought {item:a} for {price}', { item: noun(ITEMS[id].name), price: formatCoins(priceOf(id)) }));
    log('trade', { item: noun(ITEMS[id].name), copper: priceOf(id) });
  } else setStatus({ poor: tr('Not enough coins'), full: tr('Your bag is full'), unknown: tr('Not for sale') }[done]);
  refresh();
}
function act() {
  if (selected?.from === 'shop') buy();
  else if (selected?.from === 'floor') take();
  else if (selected?.from !== 'bag') return;
  else if (!$('inventory-equip').hidden && !$('inventory-equip').disabled) $('inventory-equip').click();
  else if (!$('inventory-use').hidden) $('inventory-use').click();
}
// close the bag first: the game is paused while it is open
function use() {
  const id = selected?.from === 'bag' && selected.id;
  if (!id) return;
  setInventoryOpen(false);
  useItem(id);
}

$('inventory-close').addEventListener('click', () => setInventoryOpen(false));
$('inventory-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
// the keys the tabs name are the settings' (game/settings.js); the close button only names Esc, the
// same on both tabs (with the tab's key it would change its width, and the header's with it)
function showKeys() {
  $('inventory-close').textContent = tr('Close · Esc');
  for (const b of $('inventory-tabs').querySelectorAll('[data-tab]')) {
    const action = { bag: 'inventory', quests: 'quests' }[b.dataset.tab], key = action && keyLabel(action);
    b.title = key ? `${b.textContent} · ${key}` : b.textContent;
  }
}
showKeys();
onSettingsChange(showKeys);
onLanguageChange(() => { showKeys(); $('inventory-title').textContent = title(); signature = ''; updateInventory(); });
$('inventory-overlay').addEventListener('click', e => { if (e.target === $('inventory-overlay')) setInventoryOpen(false); });
$('inventory-grid').addEventListener('click', e => {
  const button = e.target.closest('[data-slot]');
  if (!button) return;
  const s = player.inventory.slots[Number(button.dataset.slot)];
  selected = s ? { from: 'bag', id: s.instanceId } : null;
  // at the Enchanter or the Smith a weapon is what they work on now, and they say so
  if (service() && s?.gen && (service() === 'reroll' ? isGear(s.itemId) : ITEMS[s.itemId]?.weapon) && work !== s.instanceId) {
    work = s.instanceId;
    setStatus(`${tr(shopOf(trader).title)}: ${tr((service() === 'enchant' ? ENCHANTER_SAYS : SMITH_SAYS)[rarityOf(s).id])}`);
  }
  refresh();
});
$('inventory-item-affixes').addEventListener('click', e => {
  const b = e.target.closest('[data-reroll]');
  if (b && !b.disabled) reroll(Number(b.dataset.reroll));
});
$('inventory-grid').addEventListener('dblclick', e => { if (e.target.closest('[data-slot]')) act(); });
$('inventory-floor').addEventListener('click', e => {
  const button = e.target.closest('[data-floor]');
  if (!button) return;
  selected = { from: 'floor', id: button.dataset.floor };
  refresh();
});
$('inventory-floor').addEventListener('dblclick', e => { if (e.target.closest('[data-floor]')) take(); });
$('inventory-shop').addEventListener('click', e => {
  const button = e.target.closest('[data-ware]');
  if (!button) return;
  selected = { from: 'shop', id: button.dataset.ware };
  refresh();
});
$('inventory-shop').addEventListener('dblclick', e => { if (e.target.closest('[data-ware]')) buy(); });
$('inventory-bar-keys').addEventListener('click', e => {
  const b = e.target.closest('[data-bar-key]');
  if (!b) return;
  assignSelectedToBar(Number(b.dataset.barKey));
  refresh();
});
$('inventory-buy').addEventListener('click', buy);
$('inventory-equip').addEventListener('click', async () => {
  const slot = selected?.from === 'bag' && ownedItem(player.inventory, selected.id), a = ITEMS[slot?.itemId]?.armor;
  if (a) { if (isWorn(player.inventory, slot.instanceId)) takeOffArmor(a.slot); else wearArmor(slot.instanceId); }
  else if (await equipOwnedWeapon(selected?.id)) selected = { from: 'bag', id: player.inventory.equipped };
  refresh();
});
// what is worn, under the hero: a click selects it in the bag, a double-click takes it off
$('inventory-worn').addEventListener('click', e => {
  const b = e.target.closest('[data-worn]'), s = b && wornItem(player.inventory, b.dataset.worn);
  if (!s) return;
  selected = { from: 'bag', id: s.instanceId };
  if (service() === 'reroll' && s.gen && work !== s.instanceId) { work = s.instanceId; setStatus(`${shopOf(trader).title}: ${SMITH_SAYS[rarityOf(s).id]}`); }
  refresh();
});
$('inventory-worn').addEventListener('dblclick', e => {
  const b = e.target.closest('[data-worn]');
  if (b && wornItem(player.inventory, b.dataset.worn)) { takeOffArmor(b.dataset.worn); refresh(); }
});
$('inventory-take').addEventListener('click', take);
$('inventory-use').addEventListener('click', use);
$('inventory-drop').addEventListener('click', drop);

// Keyboard: arrows move through the floor list and the bag (left/right cross between them),
// Enter or Space on the selected item takes it from the floor, buys it, or equips / uses it.
// Tab stays inside the modal, including when slots are re-rendered.
$('inventory-panel').addEventListener('keydown', e => {
  const el = document.activeElement, slot = el?.dataset?.slot, row = el?.dataset?.floor ?? el?.dataset?.ware;
  if (e.code === 'Tab') {
    const controls = [...$('inventory-panel').querySelectorAll('button, select, input')].filter(c => !c.disabled && c.getClientRects().length);
    const i = controls.indexOf(el), next = (i + (e.shiftKey ? -1 : 1) + controls.length) % controls.length;
    e.preventDefault(); controls[next]?.focus();
    return;
  }
  if (slot === undefined && row === undefined) return;
  const rows = [...(trader ? $('inventory-shop').querySelectorAll('[data-ware]') : $('inventory-floor').querySelectorAll('[data-floor]'))];
  const slots = [...$('inventory-grid').querySelectorAll('[data-slot]')];
  const pick = target => { if (!target) return; e.preventDefault(); target.focus(); target.click(); };
  if (e.code === 'Enter' || e.code === 'Space') {
    const on = row !== undefined ? (trader ? selected?.from === 'shop' && selected.id === row : selected?.from === 'floor' && selected.id === row)
      : selected?.from === 'bag' && player.inventory.slots[Number(slot)]?.instanceId === selected.id;
    if (on) { e.preventDefault(); act(); }
    return;
  }
  if (row !== undefined) {
    const i = rows.indexOf(el);
    if (e.code === 'ArrowDown') pick(rows[i + 1]);
    else if (e.code === 'ArrowUp') pick(rows[i - 1]);
    else if (e.code === 'ArrowRight') pick(slots[0]);
  } else {
    const i = Number(slot), col = i % 6;
    if (e.code === 'ArrowRight' && col < 5) pick(slots[i + 1]);
    else if (e.code === 'ArrowLeft' && col > 0) pick(slots[i - 1]);
    else if (e.code === 'ArrowLeft' && (floorMode || trader)) pick(rows[0]);
    else if (e.code === 'ArrowDown') pick(slots[i + 6]);
    else if (e.code === 'ArrowUp') pick(slots[i - 6]);
  }
});
