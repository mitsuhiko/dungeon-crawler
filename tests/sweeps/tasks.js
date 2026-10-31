// The room tasks of whole worlds (tests/sweep.js; docs/trials.md "Room tasks"): each built in its
// room, what it needs reached both ways; a vault's site caged, a route task's exit shut
// (tests/tasks.test.js has each kind made on purpose)
import assert from 'node:assert/strict';

export default [{
  name: 'room tasks are built in their rooms: their things reached and left, a vault with its site, the exit shut',
  run(w) {
    let vaults = 0, routes = 0, own = 0, n = 0;
    for (let d = 1; d < 20; d++) for (const t of w.layout(d).tasks) {
      const m = w.cube(t.key).map, tr = m.trial;
      n++;
      assert.ok(tr?.task && tr.key === t.key && tr.gate === t.gate && tr.role === t.role, `${d}: ${t.kind} in ${t.key} not built`);
      assert.ok(!m.trialRoom, 'a task room is no trial room: its faces open by discovery');
      if (tr.kind === t.kind) own++;
      for (const q of [...tr.parts.filter(p => p.f != null), ...tr.wards || [], ...tr.bearer ? [tr.bearer] : []])
        assert.equal(m.safe[q.f], 1, `${d}: ${tr.kind} in ${t.key} on a floor that does not lead on`);
      if (t.role === 'branch') { vaults++; assert.ok(m.rewardSites.length >= 1, `${d}: a vault in ${t.key} with no site`); }
      else { routes++; assert.equal(m.gateKeys[t.exit], t.gate); }
    }
    assert.ok(routes > 20 && vaults >= 1, `${vaults} vaults, ${routes} on the route`);
    assert.ok(own / n > 0.8, `built as planned: ${own} of ${n}`);
  },
}];
