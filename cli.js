#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { SnapshotArchive } = require('./js/core/archive.js');
const Text = require('./js/core/text.js');
const { fetchUrl } = require('./js/core/fetcher.js');

const HOME = path.join(__dirname, 'archive');
const ARCHIVE_DIR = process.env.CAPSULE_ARCHIVE || HOME;

const archive = new SnapshotArchive({ dir: ARCHIVE_DIR });

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m'
};

function fmtDate(ts) {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 16);
}

function usage() {
  console.log('');
  console.log('TIEMPO — Internet Time Capsule');
  console.log('Archiva versiones de páginas web y navega por su pasado.');
  console.log('');
  console.log('  tiempo capturar <url> [--id id]        archiva la versión actual de una URL');
  console.log('  tiempo importar <archivo.html> [url]   archiva un archivo HTML local (prueba offline)');
  console.log('  tiempo versiones <url>                 lista las versiones capturadas');
  console.log('  tiempo ver <url> [id]                  muestra el texto de una versión (última por defecto)');
  console.log('  tiempo ver <url> --en <fecha>          muestra la versión vigente en una fecha');
  console.log('  tiempo diff <url> <idA> <idB>          diferencias entre dos versiones');
  console.log('  tiempo linea <url>                     evolucion del tamaño/palabras por versión');
  console.log('  tiempo indice                          lista todas las URLs archivadas');
  console.log('  tiempo estado                          estadisticas del archivo');
  console.log('  tiempo limpiar <url>                   elimina una URL del archivo');
  console.log('');
}

function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'capturar': return doCapture(rest);
    case 'importar': return doImport(rest);
    case 'versiones': return doVersions(rest);
    case 'ver': return doVer(rest);
    case 'diff': return doDiff(rest);
    case 'linea': return doLinea(rest);
    case 'indice': return doIndice();
    case 'estado': return doEstado();
    case 'limpiar': return doLimpiar(rest);
    default:
      usage();
      return 1;
  }
}

async function doCapture(rest) {
  const url = rest[0];
  if (!url) { usage(); return 1; }
  let id;
  const i = rest.indexOf('--id');
  if (i !== -1 && rest[i + 1]) id = rest[i + 1];
  try {
    const res = await fetchUrl(url, { timeout: 20000 });
    const res2 = archive.add(url, res.html, { id: id });
    if (res2.unchanged) {
      console.log(C.dim + 'situación: la página no ha cambiado desde la última captura (mismo hash)' + C.reset);
      return 0;
    }
    const v = res2.version;
    console.log(C.green + '✓ captura archivada' + C.reset);
    console.log('   url        ' + url);
    console.log('   momento    ' + fmtDate(v.capturedAt));
    console.log('   título     ' + v.title);
    console.log('   tamaño     ' + (v.size / 1024).toFixed(1) + ' KB (' + v.words + ' palabras)');
    console.log('   id         ' + v.id);
    return 0;
  } catch (e) {
    console.error(C.red + '✗ no se pudo capturar: ' + e.message + C.reset);
    return 1;
  }
}

async function doImport(rest) {
  const file = rest[0];
  const url = rest[1] || 'archivo://' + path.basename(file);
  if (!file || !fs.existsSync(file)) {
    console.error(C.red + '✗ archivo no encontrado: ' + file + C.reset);
    return 1;
  }
  const html = fs.readFileSync(file, 'utf8');
  const res = archive.add(url, html);
  if (res.unchanged) { console.log(C.dim + 'situación: sin cambios' + C.reset); return 0; }
  console.log(C.green + '✓ importado' + C.reset);
  console.log('   url        ' + url);
  console.log('   título     ' + res.version.title);
  console.log('   id         ' + res.version.id);
  return 0;
}

function doVersions(rest) {
  const url = rest[0];
  if (!url) { usage(); return 1; }
  const versions = archive.list(url);
  if (!versions.length) { console.log(C.dim + 'no hay versiones de ' + url + C.reset); return 0; }
  console.log(C.bold + url + C.reset + '  (' + versions.length + ' versiones)');
  for (const v of versions) {
    const dw = v.words ? '' : ' ?';
    console.log(
      '   ' + C.cyan + fmtDate(v.capturedAt) + C.reset +
      '  ' + String(v.size).padStart(7) + ' B' +
      '  ' + String(v.words).padStart(5) + ' palabras' + dw +
      '  ' + C.dim + v.id + C.reset
    );
  }
  return 0;
}

function doVer(rest) {
  const url = rest[0];
  if (!url) { usage(); return 1; }
  if (rest[1] === '--en') {
    const date = rest[2];
    if (!date) { usage(); return 1; }
    let ts;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) ts = new Date(date + 'T23:59:59Z').getTime();
    else ts = new Date(date).getTime();
    if (isNaN(ts)) { console.error(C.red + '✗ fecha no válida' + C.reset); return 1; }
    const snap = archive.getAt(url, ts);
    if (!snap) { console.log(C.dim + 'no hay capturas de ' + url + C.reset); return 0; }
    printSnapshot(url, snap.data, snap.meta);
    return 0;
  }
  const id = rest[1];
  if (id) {
    const data = archive.get(url, id);
    if (!data) { console.error(C.red + '✗ versión no encontrada: ' + id + C.reset); return 1; }
    printSnapshot(url, data, data);
    return 0;
  }
  const latest = archive.latest(url);
  if (!latest) { console.log(C.dim + 'no hay capturas de ' + url + C.reset); return 0; }
  printSnapshot(url, latest.data, latest.meta);
  return 0;
}

function printSnapshot(url, data, meta) {
  console.log(C.bold + '#' + meta.id + C.reset + '  ' + data.title);
  console.log(C.dim + '   ' + url + '  ·  ' + fmtDate(meta.capturedAt) +
    '  ·  ' + (data.text || '').split(/\s+/).length + ' palabras' + C.reset);
  console.log('');
  console.log('-' .repeat(3));
  console.log((data.text || '').slice(0, 6000));
}

function doDiff(rest) {
  const url = rest[0], idA = rest[1], idB = rest[2];
  if (!url || !idA || !idB) { usage(); return 1; }
  const d = archive.diff(url, idA, idB);
  if (!d) { console.error(C.red + '✗ no se puede comparar (falta alguna versión)' + C.reset); return 1; }
  console.log(C.bold + fmtDate(d.from.capturedAt) + C.reset + '  →  ' + C.bold + fmtDate(d.to.capturedAt) + C.reset);
  const s = d.summary;
  console.log('   ' + C.green + '+' + s.added + C.reset + '  ' + C.red + '-' + s.removed + C.reset +
    '  ' + (s.kept ? '·' + s.kept : '') +
    (d.diff.truncated ? C.yellow + '  (resumen acotado)' + C.reset : ''));
  console.log('-' .repeat(3));
  for (const op of d.diff.ops) {
    const line = op.tokens.join(' ');
    const style = op.type === '-' ? C.red : op.type === '+' ? C.green : C.dim;
    if (op.type === '=') continue;
    console.log(style + (op.type === '-' ? '− ' : '+ ') + line.slice(0, 200) + C.reset);
  }
  return 0;
}

function doLinea(rest) {
  const url = rest[0];
  if (!url) { usage(); return 1; }
  const versions = archive.list(url);
  if (!versions.length) { console.log(C.dim + 'no hay versiones' + C.reset); return 0; }
  console.log(C.bold + url + C.reset);
  const words = versions.map(v => v.words);
  const max = Math.max.apply(null, words.concat([1]));
  for (let k = 0; k < versions.length; k++) {
    const v = versions[k];
    const barlen = Math.max(1, Math.round((v.words / max) * 30));
    const pct = k > 0 ? ((v.words - words[k - 1]) / words[k - 1] * 100) : 0;
    const sign = pct > 0 ? '+' : pct < 0 ? '' : ' ';
    console.log(
      '   ' + C.cyan + fmtDate(v.capturedAt) + C.reset +
      '  ' + String(v.words).padStart(5) + '▕' + '#'.repeat(barlen) +
      (k > 0 ? C.green + '  (' + sign + pct.toFixed(0) + '%)' + C.reset : '')
    );
  }
  return 0;
}

function doIndice() {
  const idx = archive.index();
  if (!idx.length) { console.log(C.dim + 'el archivo está vacío' + C.reset); return 0; }
  console.log(C.bold + 'ARCHIVO' + C.reset + '  (' + idx.length + ' URL, ' + archive.stats().snapshots + ' snapshots)');
  for (const e of idx) {
    console.log('   ' + String(e.count).padStart(2) + ' capturas  ' + e.url);
    console.log(C.dim + '      ' + fmtDate(e.first) + ' → ' + fmtDate(e.last) + '  ·  ' + e.title + C.reset);
  }
  return 0;
}

function doEstado() {
  const s = archive.stats();
  console.log('   URL archivadas:  ' + s.urls);
  console.log('   Snapshots total: ' + s.snapshots);
  console.log('   Archivo en:      ' + ARCHIVE_DIR);
  return 0;
}

function doLimpiar(rest) {
  const url = rest[0];
  if (!url) { usage(); return 1; }
  archive.remove(url);
  console.log('✓ eliminada ' + url + ' del archivo');
  return 0;
}

if (require.main === module) {
  Promise.resolve(main(process.argv.slice(2))).then(code => {
    process.exitCode = code || 0;
  });
} else {
  module.exports = { main: main };
}