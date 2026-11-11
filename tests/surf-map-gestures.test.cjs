const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(coarse) {
  const classes = new Set(), listeners = {};
  const hint = { setAttribute() {}, classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name), remove: name => classes.delete(name) } };
  const container = { appended: [], append: item => container.appended.push(item), addEventListener: (type, listener) => { listeners[type] = listener; } };
  const map = { dragging: { enabled: true, disable() { this.enabled = false; } }, getContainer: () => container };
  const context = { L: { Browser: { touch: true } }, matchMedia: () => ({ matches: coarse }), document: { createElement: () => hint }, setTimeout: () => 1, clearTimeout() {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../surf-map-gestures.js'), 'utf8'), context);
  context.SurfMapGestures.attach(map);
  const touch = (type, ...points) => listeners[type]?.({ touches: points.map(([clientX, clientY]) => ({ clientX, clientY })) });
  return { map, container, touch, visible: () => classes.has('is-visible') };
}

test('on a touch screen one finger is left to the page and a real drag explains the two-finger gesture', () => {
  const map = setup(true);
  assert.equal(map.map.dragging.enabled, false);
  assert.equal(map.container.appended.length, 1);
  map.touch('touchstart', [100, 100]); map.touch('touchmove', [104, 103]);
  assert.equal(map.visible(), false, 'a tap that wobbles a few pixels is not a drag');
  map.touch('touchmove', [100, 140]);
  assert.equal(map.visible(), true);
  map.touch('touchstart', [100, 100], [160, 100]);
  assert.equal(map.visible(), false, 'two fingers hide the hint and move the map');
});

test('a mouse keeps dragging the map as before', () => {
  const map = setup(false);
  assert.equal(map.map.dragging.enabled, true);
  assert.equal(map.container.appended.length, 0);
});
