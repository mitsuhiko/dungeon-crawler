// Portals and the spawn pad, plus the debug route line. Every portal is two-way; gold ones lead
// somewhere unexplored, cyan ones somewhere you have been. Side portals are stone gates on the
// cube face, down portals wells in the ground, up portals rings hovering above a pad.
import * as THREE from 'three';
import { N, CUBE_H } from '../core/constants.js';

let STONE = null;   // one per cube (cubes fade on their own)
// sealed: an annex's portal before a quest opens it (world/layout.js): grey, and nothing glows
const COLORS = { new: [0xffc94a, 0xffa500], seen: [0x5fd3ff, 0x1f8fd0], locked: [0xff3547, 0xff1530], sealed: [0x7d838c, 0x3a3e44] };
const glowMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, depthWrite: false, forceSinglePass: true });
// (the stone casts the sun's baked shadow, render/bake.js sunCast: it stands still, and only
// shows or hides)
const box = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), STONE); m.position.set(x, y, z); m.castShadow = true; m.userData.sunCast = true; return m; };

function gate(p, [c, e], guardian) {
  const g = new THREE.Group();
  g.add(box(0.24, 1.8, 0.24, -0.78, 0.9, 0), box(0.24, 1.8, 0.24, 0.78, 0.9, 0), box(1.9, 0.26, 0.3, 0, 1.9, 0));
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 1.76), glowMat(c, 0.4));
  curtain.position.y = 0.88; curtain.renderOrder = 900;
  const light = new THREE.PointLight(e, 3, 4, 2), seal = new THREE.Group();
  const target = new THREE.Color(c), lightTarget = new THREE.Color(e);
  if (guardian) for (const yaw of [-Math.PI / 4, Math.PI / 4]) {
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .1), glowMat(COLORS.locked[0], .95));
    cross.rotation.z = yaw; cross.position.set(0, .88, .02); seal.add(cross);
  }
  g.add(curtain, light, seal);
  const out = 0.14;
  const pos = [[N - out, p.z + 0.5], [out, p.z + 0.5], [p.x + 0.5, N - out], [p.x + 0.5, out]][p.dir];
  g.position.set(pos[0], p.y, pos[1]);
  if (p.dir < 2) g.rotation.y = Math.PI / 2;
  return { obj: g, setLocked: guardian ? (value, immediate = false) => {
    seal.visible = value;
    const col = value ? COLORS.locked : [c, e];
    target.set(col[0]); lightTarget.set(col[1]);
    if (immediate) { curtain.material.color.copy(target); light.color.copy(lightTarget); }
  } : null, tick: t => {
    curtain.material.opacity = 0.32 + Math.sin(t * 3 + p.id) * 0.1;
    curtain.material.color.lerp(target, .15); light.color.lerp(lightTarget, .15);
  } };
}

function well(p, [c, e], guardian) {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.13, 8, 24), STONE);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.08; rim.castShadow = true; rim.userData.sunCast = true;
  const swirl = new THREE.Mesh(new THREE.CircleGeometry(0.56, 24), glowMat(c, 0.75));
  swirl.rotation.x = -Math.PI / 2; swirl.position.y = 0.03; swirl.renderOrder = 900;
  const inner = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.32, 5), glowMat(0x2a1440, 0.8));
  inner.rotation.x = -Math.PI / 2; inner.position.y = 0.04; inner.renderOrder = 901;
  const light = new THREE.PointLight(e, 3, guardian ? 5 : 3, 2);
  g.add(rim, swirl, inner, light);
  let locked = false;
  const target = new THREE.Color(c), lightTarget = new THREE.Color(e), seal = new THREE.Group();
  if (guardian) {
    // A visible arch behind the well, oriented towards its approach. Pure dressing:
    // pillars stand outside the activation circle and do not obstruct the guardian.
    const frame = new THREE.Group(), [dx, dz] = guardian.approach;
    frame.rotation.y = Math.atan2(dx, dz); frame.position.set(-dx * .8, 0, -dz * .8);
    frame.add(box(.22, 2.4, .22, -1, 1.2, 0), box(.22, 2.4, .22, 1, 1.2, 0), box(2.5, .24, .3, 0, 2.4, 0));
    g.add(frame);
    for (const yaw of [-Math.PI / 4, Math.PI / 4]) {
      const cross = new THREE.Mesh(new THREE.PlaneGeometry(1.05, .08), glowMat(COLORS.locked[0], .9));
      cross.rotation.x = -Math.PI / 2; cross.rotation.z = yaw; cross.position.y = .15; seal.add(cross);
    }
    g.add(seal);
  }
  g.position.set(p.x + 0.5, p.y, p.z + 0.5);
  return { obj: g, setLocked: guardian ? (value, immediate = false) => {
    locked = value; seal.visible = value;
    const col = value ? COLORS.locked : [c, e];
    target.set(col[0]); lightTarget.set(col[1]);
    if (immediate) { swirl.material.color.copy(target); light.color.copy(lightTarget); }
  } : null, tick: t => {
    inner.rotation.z = -t * (locked ? .6 : 2.5);
    swirl.material.opacity = .6 + Math.sin(t * (locked ? 2 : 4)) * .15;
    swirl.material.color.lerp(target, .15); light.color.lerp(lightTarget, .15);
  } };
}

function ring(p, [c, e]) {
  const g = new THREE.Group();
  const r = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 10, 32), new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: 1.4 }));
  r.rotation.x = Math.PI / 2; r.position.y = 1.5;
  const beamH = CUBE_H - p.y;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, beamH, 20, 1, true), glowMat(c, 0.12));
  beam.position.y = beamH / 2; beam.renderOrder = 900;
  g.add(r, beam, new THREE.PointLight(e, 5, 5, 2));
  g.position.set(p.x + 0.5, p.y, p.z + 0.5);
  return { obj: g, tick: t => { r.position.y = 1.5 + Math.sin(t * 2) * 0.12; beam.material.opacity = 0.1 + Math.sin(t * 2) * 0.04; } };
}

function spawnPad(p) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.08, 8), STONE);
  disc.position.y = 0.04; disc.receiveShadow = true;
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 8), glowMat(0xe8f4ff, 0.4));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.09;
  g.add(disc, glow);
  g.position.set(p.x + 0.5, p.y, p.z + 0.5);
  return { obj: g, tick: t => { glow.material.opacity = 0.3 + Math.sin(t * 2.5) * 0.1; } };
}

// Either end of the town portal (game/townportal.js): a violet swirl on the ground under a
// faint column of light. Not part of the generated map, so it brings its own materials and is
// added to (or taken out of) a built cube; pad: its centre { x, y, z }.
export function townPortalFx(pad) {
  const g = new THREE.Group(), c = 0xb98cff, e = 0x8f4dff;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 8, 32), new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: 1.6 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.06;
  const swirl = new THREE.Mesh(new THREE.CircleGeometry(0.58, 32), glowMat(c, 0.7));
  swirl.rotation.x = -Math.PI / 2; swirl.position.y = 0.03; swirl.renderOrder = 900;
  const inner = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.4, 6), glowMat(0x2a1050, 0.8));
  inner.rotation.x = -Math.PI / 2; inner.position.y = 0.04; inner.renderOrder = 901;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 2.4, 24, 1, true), glowMat(c, 0.14));
  beam.position.y = 1.2; beam.renderOrder = 900;
  const light = new THREE.PointLight(e, 4, 4.5, 2);
  light.position.y = 1;
  g.add(rim, swirl, inner, beam, light);
  g.position.set(pad.x, pad.y, pad.z);
  g.userData.portal = { id: 'town', kind: 'town', x: pad.x, y: pad.y, z: pad.z };
  return { obj: g, light, tick: t => {
    inner.rotation.z = -t * 2.2;
    swirl.material.opacity = .6 + Math.sin(t * 3) * .15;
    beam.material.opacity = .12 + Math.sin(t * 2) * .04;
  } };
}

// seen: portal id -> leads somewhere explored
export function buildMarkers(m, group, showPath, seen = {}, open = [], locked = !!m.guardian) {
  STONE = new THREE.MeshStandardMaterial({ color: 0x9aa3b0, roughness: 0.8, flatShading: true });
  const portalFx = m.portals.filter(p => p.kind !== 'side' || !open[p.dir]).map(p => {
    const col = COLORS[m.sealed?.includes(p.dir) ? 'sealed' : seen[p.id] ? 'seen' : 'new'];
    const guardian = p.dir === m.exit ? m.guardian : null;
    // a trial room's gates (world/trials.js) can all be sealed: its exit until it is resolved, every
    // one while an event runs (game/trials.js)
    const fx = p.kind === 'side' ? gate(p, col, guardian || !!m.trial)
      : p.kind === 'down' ? well(p, col, guardian) : p.kind === 'up' ? ring(p, col) : spawnPad(p);
    fx.obj.userData.guardianRole = guardian?.role ?? null;
    fx.obj.userData.bossPlaceholder = !!guardian?.bossPlaceholder;
    fx.setLocked?.(m.trial ? false : locked, true);
    fx.obj.userData.portal = p;   // dev tools: click to take it
    group.add(fx.obj);
    return fx;
  });
  // every route (portal -> exit, the ways back, escapes) as its own run of line segments
  const segPts = m.routes.flatMap(r => r.slice(1).flatMap((q, i) => [r[i], q]));
  const pathLine = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segPts),
    new THREE.LineBasicMaterial({ color: 0xff3df2, depthTest: false, transparent: true }));
  pathLine.renderOrder = 998;
  pathLine.visible = showPath;
  group.add(pathLine);
  return { pathLine, portalFx };
}
