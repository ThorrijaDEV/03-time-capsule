#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SnapshotArchive } = require('./js/core/archive.js');
const { fetchUrl } = require('./js/core/fetcher.js');

const ROOT = __dirname;
const ARCHIVE_DIR = process.env.CAPSULE_ARCHIVE || path.join(ROOT, 'archive');
const PORT = process.env.CAPSULE_PORT || 4646;

const archive = new SnapshotArchive({ dir: ARCHIVE_DIR });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function send(res, code, body, type) {
  res.writeHead(code, {
    'content-type': type || 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(body);
}

function sendJson(res, obj) {
  send(res, 200, JSON.stringify(obj));
}

function sendError(res, code, msg) {
  send(res, code, JSON.stringify({ error: msg }));
}

function parseQuery(url) {
  const q = (url.split('?')[1] || '');
  const out = {};
  for (const pair of q.split('&')) {
    if (!pair) continue;
    const [k, v] = pair.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return out;
}

function readBody(req) {
  return new Promise((resolve) => {
    let chunks = [];
    let size = 0;
    req.on('data', c => { chunks.push(c); size += c.length; if (size > 2e6) { req.destroy(); resolve(null); } });
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      resolve(buf.toString('utf8'));
    });
    req.on('error', () => resolve(null));
  });
}

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { sendError(res, 404, 'no se encuentra ' + path.basename(filePath)); return; }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    send(res, 200, data, type);
  });
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  // --- estáticos ---
  if (req.method === 'GET' && urlPath === '/') {
    return serveStatic(res, path.join(ROOT, 'index.html'));
  }
  if (req.method === 'GET' && urlPath === '/js/web.js') {
    return serveStatic(res, path.join(ROOT, 'js', 'web.js'));
  }

  // --- API ---
  if (req.method === 'GET' && urlPath === '/api/index') {
    return sendJson(res, archive.index());
  }

  if (req.method === 'GET' && urlPath === '/api/versions') {
    const url = parseQuery(req.url).url;
    if (!url) return sendError(res, 400, 'falta url');
    return sendJson(res, archive.list(url));
  }

  if (req.method === 'GET' && urlPath === '/api/snapshot') {
    const q = parseQuery(req.url);
    const url = q.url;
    if (!url) return sendError(res, 400, 'falta url');
    if (q.id) {
      const data = archive.get(url, q.id);
      return data ? sendJson(res, { url: url, data: data }) : sendError(res, 404, 'versión no existe');
    }
    const latest = archive.latest(url);
    return latest ? sendJson(res, { url: url, data: latest.data }) : sendError(res, 404, 'sin capturas');
  }

  if (req.method === 'GET' && urlPath === '/api/snapshotAt') {
    const q = parseQuery(req.url);
    const url = q.url, ts = +q.ts;
    if (!url || !ts) return sendError(res, 400, 'faltan url y ts');
    const snap = archive.getAt(url, ts);
    return snap ? sendJson(res, { url: url, data: snap.data, meta: snap.meta }) : sendError(res, 404, 'sin capturas');
  }

  if (req.method === 'GET' && urlPath === '/api/diff') {
    const q = parseQuery(req.url);
    if (!q.url || !q.a || !q.b) return sendError(res, 400, 'faltan url, a y b');
    const d = archive.diff(q.url, q.a, q.b);
    return d ? sendJson(res, d) : sendError(res, 404, 'no se puede comparar');
  }

  if (req.method === 'POST' && urlPath === '/api/capture') {
    const body = await readBody(req);
    if (!body) return sendError(res, 400, 'cuerpo vacío');
    let parsed;
    try { parsed = JSON.parse(body); } catch (e) { return sendError(res, 400, 'json inválido'); }
    const url = parsed.url;
    if (!url) return sendError(res, 400, 'falta url');
    try {
      const remote = await fetchUrl(url, { timeout: 20000 });
      const res2 = archive.add(url, remote.html);
      if (res2.unchanged) return sendJson(res, { unchanged: true, url: url });
      return sendJson(res, { added: true, url: url, version: res2.version });
    } catch (e) {
      return sendError(res, 502, 'no se pudo capturar: ' + e.message);
    }
  }

  sendError(res, 404, 'ruta desconocida');
});

server.listen(PORT, () => {
  console.log('💊 Internet Time Capsule');
  console.log('   Archivo: ' + ARCHIVE_DIR);
  console.log('   Abre:    http://localhost:' + PORT);
});