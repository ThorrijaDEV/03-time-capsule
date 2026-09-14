'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { SnapshotArchive } = require('../js/core/archive.js');
const Text = require('../js/core/text.js');

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

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'capsula-'));
}

function suite(name) {
  console.log('## ' + name);
}

// ---------- Text: extracción y sanitización ----------
suite('Text: extracción y limpieza');

test('extractTitle captura el <title>', () => {
  const t = Text.extractTitle('<html><head><title>La Bola de Oro &amp; Mundo</title></head></html>');
  assert.strictEqual(t, 'La Bola de Oro & Mundo');
});

test('extractText quita etiquetas y conserva el texto visible', () => {
  const html = '<p>Hola <b>mundo</b>, &aacute;guila.</p><script>var x=1;</script><p>Segundo.</p>';
  const t = Text.extractText(html);
  assert.ok(t.includes('Hola mundo'), 'conserva el texto');
  assert.ok(!t.includes('var x'), 'quita scripts');
  assert.ok(t.includes('águila'), 'decodifica entidades');
});

test('extractText separa bloques con saltos de línea', () => {
  const t = Text.extractText('<p>uno</p><p>dos</p><ul><li>a</li><li>b</li></ul>');
  const lines = t.split('\n').map(s => s.trim()).filter(Boolean);
  assert.deepStrictEqual(lines, ['uno', 'dos', 'a', 'b']);
});

test('countWords cuenta palabras y cifras', () => {
  assert.strictEqual(Text.countWords('uno dos 3 cuatro'), 4);
  assert.strictEqual(Text.countWords(''), 0);
});

test('sanitizeHtml elimina scripts, estilos, formularios y eventos', () => {
  const html = '<script>alert(1)</script>' +
    '<style>body{color:red}</style>' +
    '<p onclick="steal()">hola</p>' +
    '<a href="javascript:void(0)">malo</a>' +
    '<iframe src="x"></iframe>' +
    '<input type="text" onfocus="x()">' +
    '<form action="php"><input name="a"></form>';
  const clean = Text.sanitizeHtml(html);
  assert.ok(!/script|style|iframe|form|input|onclick|onfocus|href\s*=\s*["']?javascript/i.test(clean), 'no queda nada ejecutable');
  assert.ok(clean.includes('<p>hola</p>'), 'conserva el contenido');
});

// ---------- Text: diff ----------
suite('Text: diff a nivel de palabras');

test('texto idéntico produce un solo grupo "="', () => {
  const d = Text.diffTexts('uno dos tres', 'uno dos tres');
  assert.deepStrictEqual(d.ops.map(o => o.type), ['=']);
});

test('inserta y elimina palabras en el lugar correcto', () => {
  const d = Text.diffTexts('el gato cazó un ratón', 'el gato negro cazó un ratón gris');
  const groups = d.ops.filter(o => o.type !== '=');
  assert.deepStrictEqual(groups.map(g => g.type), ['+', '+']);
  assert.deepStrictEqual(groups[0].tokens, ['negro']);
  assert.deepStrictEqual(groups[1].tokens, ['gris']);
});

test('detecta supresión de contenido', () => {
  const d = Text.diffTexts('una línea con detalles extra aquí', 'una línea aquí');
  const types = d.ops.map(o => o.type);
  assert.ok(types.includes('-'), 'hay una operación de borrado');
  const removed = d.ops.filter(o => o.type === '-').map(o => o.tokens.join(' '));
  assert.deepStrictEqual(removed, ['con detalles extra']);
  assert.deepStrictEqual(d.ops[0], { type: '=', tokens: ['una', 'línea'] });
});

test('resumen: cuenta añadidos, borrados y conservados', () => {
  const d = Text.diffTexts('a b c d', 'a x c d e');
  const s = Text.diffSummary(d);
  assert.strictEqual(s.added, 2);
  assert.strictEqual(s.removed, 1);
  assert.strictEqual(s.kept, 3);
});

test('diferencias con acentos y símbolos', () => {
  const d = Text.diffTexts('café con leche 100%', 'café con soja 200%');
  const sum = Text.diffSummary(d);
  assert.strictEqual(sum.removed, 2);
  assert.strictEqual(sum.added, 2);
});