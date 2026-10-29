// The kids' guide's tutor (learn/tutor/): its file system in the browser's storage, the agent
// with its tools on a scripted model, and that an answer a closed page left half done is
// finished by the next page. The page and the demos need a browser; see tests/browser/tutor.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as pi from '../vendor/pi-durable/pi-durable.js';
import { memoryStore, openFiles } from '../learn/tutor/files.js';
import { openTutor, NotebookDoc } from '../learn/tutor/agent.js';
import { md } from '../learn/tutor/markdown.js';

const ctx = pi.BACKGROUND_CONTEXT;

// the guide fetches the game's files from the dev server; here they come from the disk (folders
// as the server lists them)
globalThis.fetch = async url => {
  const path = fileURLToPath(String(url));
  try {
    const body = statSync(path).isDirectory()
      ? readdirSync(path).map(n => `<a href="${n}${statSync(path + '/' + n).isDirectory() ? '/' : ''}">${n}</a>`).join('\n')
      : readFileSync(path, 'utf8');
    return new Response(body);
  } catch { return new Response('not found', { status: 404 }); }
};

const decode = s => s ? new TextDecoder().decode(s) : '';
const check = r => { assert.ok(r.ok, r.error?.message); return r.value; };

test('the tutor\'s files: append, read, truncate, rename, list, remove', async () => {
  const fs = await openFiles(memoryStore().volume());
  check(await fs.createDir('/t/sub', { recursive: true }));
  check(await fs.appendFile('/t/a.jsonl', 'one\n'));
  for (let i = 0; i < 100; i++) check(await fs.appendFile('/t/a.jsonl', `${i}\n`));   // more appends than chunks
  const text = decode(check(await fs.readBinaryFile('/t/a.jsonl')));
  assert.equal(text.split('\n').length, 102);
  check(await fs.truncateFile('/t/a.jsonl', 4));
  assert.equal(decode(check(await fs.readBinaryFile('/t/a.jsonl'))), 'one\n');
  check(await fs.writeFile('/t/b.tmp', 'new'));
  check(await fs.renameFile('/t/b.tmp', '/t/b.jsonl'));
  assert.deepEqual(check(await fs.listDir('/t')).map(f => f.name).sort(), ['a.jsonl', 'b.jsonl', 'sub']);
  assert.equal((await fs.readBinaryFile('/t/b.tmp')).error.code, 'not_found');
  check(await fs.remove('/t/b.jsonl', {}));
  assert.equal((await fs.remove('/t/b.jsonl', {})).error.code, 'not_found');
  check(await fs.remove('/t/b.jsonl', { force: true }));
  assert.equal((await fs.appendFile('/nope/x', 'x')).error.code, 'not_found');
});

test('the tutor\'s files survive a reload, and a page that lost them cannot write', async () => {
  const store = memoryStore();
  const first = await openFiles(store.volume());
  check(await first.createDir('/t', { recursive: true }));
  for (const line of ['a\n', 'b\n', 'c\n']) check(await first.appendFile('/t/x', line));
  const second = await openFiles(store.volume());   // the next page (or another tab) takes over
  assert.equal(decode(check(await second.readBinaryFile('/t/x'))), 'a\nb\nc\n');
  assert.equal((await first.appendFile('/t/x', 'late\n')).error.code, 'permission_denied');
  check(await second.appendFile('/t/x', 'd\n'));
  assert.equal(decode(check(await (await openFiles(store.volume())).readBinaryFile('/t/x'))), 'a\nb\nc\nd\n');
});

// a model that answers from a script; `hold` keeps the next answer back until the page closes
function scripted() {
  const faux = pi.fauxProvider();
  const models = pi.createModels();
  models.setProvider(faux.provider);
  return { faux, models, model: { provider: faux.provider.id, modelId: faux.getModel().id } };
}
const where = text => () => ({ text: `<page>\n${text}\n</page>`, data: { room: 'index.html', slide: null, hash: '0' } });
const hold = (_context, options) => new Promise((_, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('page closed'))));
const kinds = entries => entries.map(e => e.kind).filter(k => k !== 'pi.system');

test('the tutor reads the game\'s code and finishes an answer after the page closed', async () => {
  const store = memoryStore();
  const A = scripted();
  A.faux.setResponses([
    pi.fauxAssistantMessage([pi.fauxToolCall('read_code', { ref: 'src/core/combat.js#inSwordArc' })], { stopReason: 'toolUse' }),
    hold,
  ]);
  const one = await openTutor({ files: await openFiles(store.volume()), models: A.models, context: ctx, lang: 'en', onReport: () => {} });
  const conv = one.conversation;
  await one.ask('How does the game know my sword hit?', where('where: the map'), A.model);
  // wait until the code was read and the second answer is being written
  for (let i = 0; i < 200 && A.faux.state.callCount < 2; i++) await new Promise(r => setTimeout(r, 10));
  assert.equal(A.faux.state.callCount, 2);

  // the next page opens the same storage, and the old page can no longer write
  const B = scripted();
  B.faux.setResponses([pi.fauxAssistantMessage('What do you think "in front of you" means for the game?')]);
  const two = await openTutor({ files: await openFiles(store.volume()), models: B.models, context: ctx, lang: 'en', onReport: () => {} });
  assert.equal(two.conversation.id, conv.id, 'one conversation for the whole guide');
  await two.harness.waitForIdle(ctx);
  const { entries } = (await (await two.harness.conversation(conv.id, ctx)).viewState(ctx)).value;
  assert.deepEqual(kinds(entries), ['tutor.ask', 'pi.assistant', 'pi.tool-result', 'pi.assistant']);
  assert.equal(entries[0].data.text, 'How does the game know my sword hit?');
  assert.match(JSON.stringify(entries.find(e => e.kind === 'pi.tool-result').model), /function inSwordArc/);
  assert.match(entries.at(-1).model[0].content[0].text, /in front of you/);
  // what the model saw: the guide's instructions, and where the reader was
  const { messages } = await (await two.harness.conversation(conv.id, ctx)).context(ctx);
  assert.match(JSON.stringify(messages), /Socratic/);
  assert.match(JSON.stringify(messages), /<page>\\nwhere: the map\\n<\/page>/);
  await one.harness.close(ctx).catch(() => {});
  await two.harness.close(ctx);
});

test('the tutor searches the code and keeps notes across rooms', async () => {
  // the line inSwordArc starts on (wherever the code around it moves it)
  const line = readFileSync(new URL('../src/core/combat.js', import.meta.url), 'utf8').split('\n')
    .findIndex(l => l.startsWith('export function inSwordArc')) + 1;
  const S = scripted();
  S.faux.setResponses([
    pi.fauxAssistantMessage([pi.fauxToolCall('search_code', { query: 'inSwordArc' }), pi.fauxToolCall('note', { text: 'Knows what a function is.' }),
      pi.fauxToolCall('show_code', { ref: 'src/core/combat.js#inSwordArc', focus: String(line) })], { stopReason: 'toolUse' }),
    pi.fauxAssistantMessage('Where do you think it is used?'),
  ]);
  const T = await openTutor({ files: await openFiles(memoryStore().volume()), models: S.models, context: ctx, lang: 'en', onReport: () => {} });
  await (await T.ask('where is the sword code?', where('where: the word book'), S.model)).wait(ctx);
  const { entries } = T.view.value;
  const found = JSON.stringify(entries.filter(e => e.kind === 'pi.tool-result').map(e => e.model));
  assert.match(found, /src\/core\/combat\.js:\d+/);
  // show_code keeps what the reader saw in the result's details, to draw it again after a reload
  const shown = entries.find(e => e.kind === 'pi.tool-result' && e.model[0].toolName === 'show_code').model[0].details;
  assert.equal(shown.path, 'src/core/combat.js');
  assert.match(shown.code, /^(\/\/.*\n)*export function inSwordArc/);
  assert.deepEqual(shown.focus, [line, line]);
  assert.ok(shown.start <= line && shown.end >= line);
  assert.deepEqual(await T.notes(), [{ room: 'index.html', text: 'Knows what a function is.' }]);
  assert.deepEqual((await T.harness.snapshot(NotebookDoc, ctx)).notes.length, 1);
  // the next question gets the page snapshot of the last one, to send only what changed
  S.faux.setResponses([pi.fauxAssistantMessage('And now?')]);
  let last;
  await (await T.ask('and this?', l => { last = l; return where('where: the map')(); }, S.model)).wait(ctx);
  assert.deepEqual(last, { room: 'index.html', slide: null, hash: '0' });
  assert.equal(T.view.value.entries.findLast(e => e.kind === 'tutor.ask').data.text, 'and this?');
  await T.harness.close(ctx);
});

test('answers are drawn as safe Markdown', () => {
  assert.equal(md('**Yes!** Try `a<b`.'), '<p><b>Yes!</b> Try <code>a&lt;b</code>.</p>');
  assert.equal(md('- one\n- two'), '<ul><li>one</li><li>two</li></ul>');
  assert.equal(md('```\nx < 1\n```'), '<pre><code>x &lt; 1</code></pre>');
  assert.match(md('[the arc](#arc-code)'), /<a href="#arc-code" data-slide="arc-code">the arc<\/a>/);
  assert.match(md('[fight](combat.html#fight)'), /<a href="combat.html#fight">fight<\/a>/);
  assert.doesNotMatch(md('[x](https://example.com) <img src=x onerror=alert(1)>'), /<a|<img/);
});
