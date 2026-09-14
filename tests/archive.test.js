'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { SnapshotArchive } = require('../js/core/archive.js');

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    console.log('  ✗ ' + name);
    console.log('    ' + (e && e.message));
    process.exitCode = 1;
  }
}

function suite(name) {
  console.log('## ' + name);
}

function makeArchive() {
  return new SnapshotArchive({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'capsula-arc-')) });
}

suite('SnapshotArchive: almacenamiento y versionado');

test('add almacena una versión y la recupera', () => {
  const a = makeArchive();
  const res = a.add('https://ejemplo.com', '<title>Inicio</title><p>hola mundo</p>', { capturedAt: 1000 });
  assert.ok(res.added);
  const v = res.version;
  assert.strictEqual(v.words, 2);
  const data = a.get('https://ejemplo.com', v.id);
  assert.ok(data.text.includes('hola mundo'));
  assert.ok(data.html.includes('<title>'));
});

test('segunda captura idéntica se marca como unchanged', () => {
  const a = makeArchive();
  a.add('https://ejemplo.com', '<p>sin cambios</p>', { capturedAt: 1000 });
  const res = a.add('https://ejemplo.com', '<p>sin cambios</p>', { capturedAt: 2000 });
  assert.strictEqual(res.unchanged, true);
  assert.strictEqual(a.list('https://ejemplo.com').length, 1);
});

test('lista versiones ordenadas cronológicamente', () => {
  const a = makeArchive();
  a.add('https://ejemplo.com', '<p>v1</p>', { capturedAt: 10 });
  a.add('https://ejemplo.com', '<p>v2</p>', { capturedAt: 20 });
  a.add('https://ejemplo.com', '<p>v3</p>', { capturedAt: 30 });
  const versions = a.list('https://ejemplo.com');
  assert.strictEqual(versions.length, 3);
  assert.deepStrictEqual(versions.map(v => v.capturedAt), [10, 20, 30]);
});

test('getAt navega al pasado: devuelve la versión vigente en un momento', () => {
  const a = makeArchive();
  a.add('https://ejemplo.com', '<p>viejo</p>', { capturedAt: 100 });
  a.add('https://ejemplo.com', '<p>medio</p>', { capturedAt: 200 });
  a.add('https://ejemplo.com', '<p>nuevo</p>', { capturedAt: 300 });
  // En t=250 la vigente es "medio"
  const s = a.getAt('https://ejemplo.com', 250);
  assert.ok(s.meta.capturedAt === 200);
  // Antes de todo, la primera
  const s0 = a.getAt('https://ejemplo.com', 50);
  assert.ok(s0.meta.capturedAt === 100);
});

test('diff entre versiones: palabras A→B', () => {
  const a = makeArchive();
  a.add('https://ejemplo.com', '<title>T</title><p>el gato cazó un ratón</p>', { capturedAt: 1 });
  a.add('https://ejemplo.com', '<title>T</title><p>el gato negro cazó un ratón gris</p>', { capturedAt: 2 });
  const versions = a.list('https://ejemplo.com');
  const d = a.diff('https://ejemplo.com', versions[0].id, versions[1].id);
  assert.strictEqual(d.summary.added, 2);
  assert.strictEqual(d.summary.removed, 0);
  assert.ok(d.from.capturedAt === 1 && d.to.capturedAt === 2);
});

suite('SnapshotArchive: índice, estado y persistencia');

test('index resume por URL con primera y última captura', () => {
  const a = makeArchive();
  a.add('https://a.com', '<p>a1</p>', { capturedAt: 100 });
  a.add('https://a.com', '<p>a2</p>', { capturedAt: 300 });
  a.add('https://b.com', '<p>b1</p>', { capturedAt: 200 });
  const idx = a.index();
  assert.strictEqual(idx.length, 2);
  const ea = idx.find(e => e.url === 'https://a.com');
  assert.strictEqual(ea.count, 2);
  assert.strictEqual(ea.first, 100);
  assert.strictEqual(ea.last, 300);
});

test('el archivo persiste en disco (reabre y sigue todo)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsula-arc-'));
  let a = new SnapshotArchive({ dir: dir });
  a.add('https://persistir.com', '<p>hola</p>', { capturedAt: 5 });
  // Reabrir el mismo directorio
  a = new SnapshotArchive({ dir: dir });
  const versions = a.list('https://persistir.com');
  assert.strictEqual(versions.length, 1);
  const data = a.get('https://persistir.com', versions[0].id);
  assert.ok(data.text.includes('hola'));
});

test('limpiar elimina la URL del archivo', () => {
  const a = makeArchive();
  a.add('https://a.com', '<p>x</p>');
  a.add('https://b.com', '<p>y</p>');
  a.remove('https://a.com');
  const idx = a.index();
  assert.strictEqual(idx.length, 1);
  assert.strictEqual(idx[0].url, 'https://b.com');
});

test('stats agrega urls y snapshots', () => {
  const a = makeArchive();
  a.add('https://a.com', '<p>1</p>', { capturedAt: 1 });
  a.add('https://a.com', '<p>2</p>', { capturedAt: 2 });
  a.add('https://b.com', '<p>3</p>', { capturedAt: 3 });
  assert.deepStrictEqual(a.stats(), { urls: 2, snapshots: 3 });
});

console.log('\n' + passed + ' pruebas superadas\n');