// The films' glass (docs/film.md): a box of the glass bird's glass (render/stage.js glassMaterial),
// standing on the floor. It grows up out of it, with a bright seam where it is still being made;
// a layer's ink can be put into it (it hangs inside, like ink in water); it can float up, and
// break: then it is pieces, each a bit of its outside closed by a fan of fracture faces to a
// point inside it (like the bird's, blender/glassbird.py), that drift apart and turn, slowly, as
// if there were no weight.
import * as THREE from 'three';
import { glassMaterial } from '../render/stage.js';

const GLASS = new THREE.Color('#a9c9ff');   // (the ink's blue white, a little deeper: film/ink.js TINTS)
const GRID = 2;   // each side of the box cut into GRID x GRID pieces

// a mesh of triangles (corners: [[x, y, z] ...], three a triangle) with their place on the box
// (`local`, for the box's edges) and flat normals
function triangles(corners, offset = [0, 0, 0]) {
  const pos = new Float32Array(corners.length * 3), local = new Float32Array(corners.length * 3);
  corners.forEach(([x, y, z], i) => { pos.set([x - offset[0], y - offset[1], z - offset[2]], i * 3); local.set([x, y, z], i * 3); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('local', new THREE.BufferAttribute(local, 3));
  g.computeVertexNormals();
  return g;
}

// the box's six sides as quads of corners, each cut into GRID x GRID cells, the inner corners a
// little off the grid: [[a, b, c, d] per cell] (corners in order round the cell)
function cells(half, random) {
  const out = [];
  const sides = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];   // [axis, sign]
  for (const [axis, sign] of sides) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    const grid = [];
    for (let i = 0; i <= GRID; i++) {
      grid.push([]);
      for (let j = 0; j <= GRID; j++) {
        const inner = i > 0 && i < GRID && j > 0 && j < GRID;
        const p = [0, 0, 0];
        p[axis] = sign * half;
        p[u] = (-1 + 2 * i / GRID + (inner ? (random() - 0.5) * 0.5 / GRID : 0)) * half;
        p[v] = (-1 + 2 * j / GRID + (inner ? (random() - 0.5) * 0.5 / GRID : 0)) * half;
        grid[i].push(p);
      }
    }
    for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
      const quad = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
      out.push(sign > 0 ? quad : quad.reverse());
    }
  }
  return out;
}

// A glass box `size` across, its bottom at its origin: { group, size, half, whole, shards,
// inside (a Group at its middle: put the ink there), setCut(share), setFade(a), setCrack(v, normal),
// shatter(from), step(dt) }
export function makeGlass(u, size, random = Math.random) {
  const half = size / 2, group = new THREE.Group(), body = new THREE.Group();
  body.position.y = half;
  group.add(body);
  const mats = [];
  const meshes = (geometry, order) => {
    const back = new THREE.Mesh(geometry, glassMaterial(u, GLASS, { opacity: 0.12, side: THREE.BackSide, spec: 0.4, reflect: 0.45, edge: 0.45, box: half }));
    const front = new THREE.Mesh(geometry, glassMaterial(u, GLASS, { opacity: 0.16, edge: 1, box: half }));
    back.renderOrder = order; front.renderOrder = order + 2;
    mats.push(back.material, front.material);
    return [back, front];
  };
  // whole: the cells' outsides
  const outside = cells(half, random);
  const whole = new THREE.Group();
  whole.add(...meshes(triangles(outside.flatMap(([a, b, c, d]) => [a, b, c, a, c, d])), 12));
  body.add(whole);
  // in pieces: each cell and a fan from its edges to a point inside
  const shards = outside.map(([a, b, c, d]) => {
    const mid = [0, 1, 2].map(k => (a[k] + b[k] + c[k] + d[k]) / 4);
    const depth = 0.35 + random() * 0.45;
    const tip = mid.map(x => x * (1 - depth));
    const centre = mid.map((x, k) => (x * 3 + tip[k]) / 4);
    const g = triangles([a, b, c, a, c, d, b, a, tip, c, b, tip, d, c, tip, a, d, tip], centre);
    const o = new THREE.Group();
    o.add(...meshes(g, 12));
    o.position.set(...centre);
    o.visible = false;
    body.add(o);
    return { o, centre: new THREE.Vector3(...centre), v: new THREE.Vector3(), w: new THREE.Vector3() };
  });
  const inside = new THREE.Group();
  body.add(inside);
  let broken = false;
  const spin = new THREE.Quaternion(), axis = new THREE.Vector3();
  return {
    group, size, half, inside, whole, shards, get broken() { return broken; },
    // grown this far (0 nothing, 1 all of it)
    setCut(share) { for (const m of mats) m.uniforms.uCut.value = share >= 1 ? 1e6 : -half + share * size * 1.001; },
    setFade(a) { for (const m of mats) m.uniforms.uFade.value = a; },
    // cracked, this bright (0: not), across a plane through it facing `normal`
    setCrack(v, normal) { for (const m of mats) { m.uniforms.uCrack.value = v; if (normal) m.uniforms.uCrackN.value.copy(normal).normalize(); } },
    // it breaks, struck from direction `from` (a vector, in the box's frame): the pieces fly
    // off it, most of them away from the blow
    shatter(from = new THREE.Vector3(1, 1, 0)) {
      broken = true;
      whole.visible = false;
      const away = from.clone().normalize().negate();
      for (const s of shards) {
        s.o.visible = true;
        const out = s.centre.clone().normalize();
        s.v.copy(out).multiplyScalar(0.12 + 0.22 * random()).addScaledVector(away, 0.08 + 0.1 * random())
          .add(new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(0.06));
        s.w.set(random() - 0.5, random() - 0.5, random() - 0.5).normalize().multiplyScalar(0.6 + 2.4 * random());
      }
    },
    step(dt) {
      if (!broken) return;
      for (const s of shards) {
        s.o.position.addScaledVector(s.v, dt);
        s.v.multiplyScalar(Math.exp(-0.15 * dt));
        const angle = s.w.length() * dt;
        if (angle > 0) s.o.quaternion.premultiply(spin.setFromAxisAngle(axis.copy(s.w).normalize(), angle));
      }
    },
  };
}
