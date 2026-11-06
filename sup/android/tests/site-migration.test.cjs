const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '../res/raw/' + name + '.js'), 'utf8');
function storage(entries = []) {
  const data = new Map(entries);
  return { data, get length() { return data.size; }, key: i => [...data.keys()][i],
    getItem: k => data.has(k) ? data.get(k) : null,
    setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
}
const prefix = "sup:";
test('migration retains source, copies own keys and is idempotent', () => {
  const source = storage([[prefix + 'journal', '{"trips":[{"name":"Łeba"}]}'], ['unrelated', 'secret']]);
  const snapshot = vm.runInNewContext(read('migrate_export'), {localStorage: source})(prefix);
  assert.equal(source.length, 2);
  assert.deepEqual(Object.keys(JSON.parse(snapshot)), [prefix + 'journal']);
  const destination = storage();
  const restore = vm.runInNewContext(read('migrate_import'), {localStorage: destination});
  assert.equal(restore(snapshot, prefix), true);
  assert.equal(restore(snapshot, prefix), true);
  assert.equal(destination.getItem(prefix + 'journal'), source.getItem(prefix + 'journal'));
  assert.equal(destination.getItem('unrelated'), null);
});
test('conflicting destination data is never overwritten and partial imports roll back', () => {
  const target = storage([[prefix + 'journal', 'existing']]);
  const restore = vm.runInNewContext(read('migrate_import'), {localStorage: target});
  assert.equal(restore(JSON.stringify({[prefix + 'first']: 'new', [prefix + 'journal']: 'old'}), prefix), false);
  assert.deepEqual([...target.data], [[prefix + 'journal', 'existing']]);
});
test('storage write failure rolls back and refuses to mark migration complete', () => {
  const target = storage(), set = target.setItem;
  target.setItem = (k, v) => { if (target.length) throw Error('quota'); set(k, v); };
  const restore = vm.runInNewContext(read('migrate_import'), {localStorage: target});
  assert.equal(restore(JSON.stringify({[prefix + 'a']: 'one', [prefix + 'b']: 'two'}), prefix), false);
  assert.equal(target.length, 0);
});
