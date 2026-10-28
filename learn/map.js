// The map (index.html in either language): the rooms as a way down, one depth after the other (each
// with a gem on the depth gauge: amber not yet visited, cyan visited, like the game's portals), and
// the detail level picker.
// deck.js calls mountMap() whenever the map comes on screen.
import { lang, t, themeName } from './deck.js';
import { DECKS, LEVELS, local, iconUrl } from './decks.js';

const blurb = () => [null,
  t('Just the big ideas, with pictures and things to try. Start here if this is all new to you.',
    'Nur die großen Ideen, mit Bildern und Sachen zum Ausprobieren. Fang hier an, wenn alles neu für dich ist.'),
  t('How the parts really work, step by step, with more demos and numbers from the game.',
    'Wie die Teile wirklich funktionieren, Schritt für Schritt, mit mehr Demos und Zahlen aus dem Spiel.'),
  t('The real code from the game, explained. For when you want to know exactly how it works.',
    'Der echte Code des Spiels, erklärt. Für wenn du genau wissen willst, wie es funktioniert.')];

export function mountMap(root) {
const seen = new Set(JSON.parse(localStorage.getItem('kids.visited') || '[]'));
root.querySelector('#map').innerHTML = DECKS.map((deck, i) => {
  const d = local(deck, lang);
  return `<a class="room ${seen.has(d.file) ? 'visited' : ''}" data-theme="${d.theme}" href="${d.file}"
      title="${t('Room', 'Raum')} ${i + 1} \u00B7 ${t('depth', 'Tiefe')} ${d.depth}">
    <span class="depth"><b>${d.depth}</b></span><img src="${iconUrl(d)}" alt="">
    <span class="text"><h3>${d.title}</h3><p>${d.teaser}</p></span><span class="d">${themeName(d.theme)}</span></a>`;
}).join('');

const box = root.querySelector('#levels');
const draw = () => {
  const lv = +(localStorage.getItem('kids.lv') || 3);
  box.innerHTML = [1, 2, 3].map(l => `<button class="card${l <= lv ? ' in' : ''}${l === lv ? ' on' : ''}" data-lv="${l}" style="text-align:left;--c:${LEVELS[l].color}">
    <span style="color:${LEVELS[l].color}">${LEVELS[l].short} \u00B7 ${lang === 'de' ? LEVELS[l].de : LEVELS[l].name}</span><br><span style="font-family:var(--read);font-size:16px;color:var(--muted)">${blurb()[l]}</span></button>`).join('');
  box.querySelectorAll('button').forEach(b => b.onclick = () => { localStorage.setItem('kids.lv', b.dataset.lv); draw(); });
};
draw();
}
