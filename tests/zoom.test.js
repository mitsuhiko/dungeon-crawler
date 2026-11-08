import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ZOOM, PREVIOUS_ZOOM, ZOOM_IN, ZOOM_INTERVAL, CLOSEST_ZOOM, FARTHEST_ZOOM, ZOOM_LEVELS, stepZoom } from '../src/core/zoom.js';

const near = (a, b) => Math.abs(a - b) < 1e-12;

test('the overview starts 22% closer than before', () => {
  assert.ok(near(PREVIOUS_ZOOM / DEFAULT_ZOOM, 1.22));
});

test('zoom uses reversible presets anchored at the default', () => {
  assert.equal(stepZoom(DEFAULT_ZOOM, 1), PREVIOUS_ZOOM);
  assert.equal(stepZoom(DEFAULT_ZOOM, -1), DEFAULT_ZOOM / ZOOM_IN);
  for (const direction of [-1, 1]) {
    let zoom = DEFAULT_ZOOM;
    for (let i = 0; i < 2; i++) zoom = stepZoom(zoom, direction);
    for (let i = 0; i < 2; i++) zoom = stepZoom(zoom, -direction);
    assert.equal(zoom, DEFAULT_ZOOM);
  }
  assert.equal(stepZoom(DEFAULT_ZOOM, 0), DEFAULT_ZOOM);
});

test('zoom has exactly six levels with the default third from the closest', () => {
  let zoom = DEFAULT_ZOOM;
  for (let i = 0; i < 100; i++) zoom = stepZoom(zoom, -1);
  const levels = [zoom];
  for (let i = 0; i < 100; i++) {
    const next = stepZoom(zoom, 1);
    if (next === zoom) break;
    levels.push(next);
    zoom = next;
  }
  assert.equal(levels.length, 6);
  assert.equal(levels[2], DEFAULT_ZOOM);
  assert.deepEqual(levels, [...ZOOM_LEVELS]);
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] > levels[i - 1]);
});

test('zoom stays bounded and steps away from either limit without drift', () => {
  for (const direction of [-1, 1]) {
    let zoom = DEFAULT_ZOOM;
    for (let i = 0; i < 100; i++) {
      zoom = stepZoom(zoom, direction);
      assert.ok(zoom >= CLOSEST_ZOOM && zoom <= FARTHEST_ZOOM);
    }
    assert.equal(stepZoom(zoom, direction), zoom);
    const away = stepZoom(zoom, -direction);
    assert.notEqual(away, zoom);
    assert.equal(stepZoom(away, direction), zoom);
  }
});

test('the closest and farthest presets stay where they were; the closer ones are even steps', () => {
  assert.ok(Math.abs(PREVIOUS_ZOOM / CLOSEST_ZOOM / (ZOOM_INTERVAL ** 2 * 1.25 * 1.2) - 1) < 2e-3);
  assert.ok(near(FARTHEST_ZOOM, PREVIOUS_ZOOM * ZOOM_INTERVAL ** 2 * 1.1));
  assert.ok(near(ZOOM_LEVELS[1] / ZOOM_LEVELS[0], ZOOM_IN) && near(ZOOM_LEVELS[2] / ZOOM_LEVELS[1], ZOOM_IN));
  assert.ok(near(ZOOM_LEVELS[3] / ZOOM_LEVELS[2], ZOOM_IN));
});

test('off-grid targets snap to the shared presets', () => {
  assert.equal(stepZoom(DEFAULT_ZOOM * 1.01, 1), stepZoom(DEFAULT_ZOOM, 1));
  assert.equal(stepZoom(DEFAULT_ZOOM * 0.99, -1), stepZoom(DEFAULT_ZOOM, -1));
});
