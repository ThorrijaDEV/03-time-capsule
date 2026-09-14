'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Text = require('./text.js');

function sha1(str) {
  return crypto.createHash('sha1').update(String(str)).digest('hex');
}

function urlId(url) {
  return sha1(url).slice(0, 16);
}

class SnapshotArchive {
  constructor(opts) {
    opts = opts || {};
    this.dir = opts.dir || path.join(__dirname, '..', 'archive');
    this.now = opts.now || (function () { return Date.now(); });
    this._ensure();
  }

  _pathSnap() { return path.join(this.dir, 'snapshots'); }
  _pathData() { return path.join(this.dir, 'data'); }

  _ensure() {
    fs.mkdirSync(this._pathSnap(), { recursive: true });
    fs.mkdirSync(this._pathData(), { recursive: true });
  }

  _snapFile(url) {
    return path.join(this._pathSnap(), urlId(url) + '.json');
  }

  _readSnap(url) {
    const f = this._snapFile(url);
    if (!fs.existsSync(f)) return { url: url, versions: [] };
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch (e) { return { url: url, versions: [] }; }
  }

  _writeSnap(snap) {
    const f = this._snapFile(snap.url);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(snap, null, 1));
  }

  _snapshotPath(url, id) {
    return path.join(this._pathData(), urlId(url), id + '.json');
  }

  // --- API pública ---

  add(url, html, opts) {
    opts = opts || {};
    url = String(url).trim();
    const snap = this._readSnap(url);
    const hash = sha1(String(html).trim());
    const last = snap.versions.length ? snap.versions[snap.versions.length - 1] : null;
    if (last && last.hash === hash) {
      return { unchanged: true, hash: hash };
    }
    const capturedAt = opts.capturedAt !== undefined ? opts.capturedAt : this.now();
    const id = opts.id !== undefined ? String(opts.id)
      : capturedAt.toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    const text = Text.extractText(html);
    const title = opts.title !== undefined ? opts.title : Text.extractTitle(html);
    const version = {
      id: id,
      capturedAt: capturedAt,
      title: title || url,
      hash: hash,
      size: String(html).length,
      words: Text.countWords(text)
    };
    snap.versions.push(version);
    fs.mkdirSync(path.join(this._pathData(), urlId(url)), { recursive: true });
    fs.writeFileSync(this._snapshotPath(url, id), JSON.stringify({
      url: url, id: id, capturedAt: capturedAt, title: version.title,
      hash: hash, html: String(html), text: text
    }));
    this._writeSnap(snap);
    return { added: true, version: version };
  }

  list(url) {
    return this._readSnap(url).versions;
  }

  get(url, id) {
    const f = this._snapshotPath(url, id);
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  }

  latest(url) {
    const v = this._readSnap(url).versions;
    if (!v.length) return null;
    return { meta: v[v.length - 1], data: this.get(url, v[v.length - 1].id) };
  }

  // Navegación temporal: devuelve la versión más cercana a `ts`
  // (la última cuya captura es ≤ ts; si no hay, la más antigua).
  getAt(url, ts) {
    const versions = this._readSnap(url).versions;
    if (!versions.length) return null;
    let chosen = versions[0];
    for (const v of versions) {
      if (v.capturedAt <= ts) chosen = v;
      else break;
    }
    return { meta: chosen, data: this.get(url, chosen.id) };
  }

  diff(url, idA, idB) {
    const a = this.get(url, idA);
    const b = this.get(url, idB);
    if (!a || !b) return null;
    const diff = Text.diffTexts(a.text, b.text);
    return {
      summary: Text.diffSummary(diff),
      diff: diff,
      from: { id: a.id, capturedAt: a.capturedAt, title: a.title, words: a.words, size: a.html.length },
      to: { id: b.id, capturedAt: b.capturedAt, title: b.title, words: b.words, size: b.html.length }
    };
  }

  index() {
    const out = [];
    const files = fs.readdirSync(this._pathSnap());
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const snap = JSON.parse(fs.readFileSync(path.join(this._pathSnap(), f), 'utf8'));
      if (!snap.versions.length) continue;
      out.push({
        url: snap.url,
        count: snap.versions.length,
        first: snap.versions[0].capturedAt,
        last: snap.versions[snap.versions.length - 1].capturedAt,
        title: snap.versions[snap.versions.length - 1].title,
        words: snap.versions[snap.versions.length - 1].words
      });
    }
    out.sort((a, b) => b.last - a.last);
    return out;
  }

  stats() {
    const idx = this.index();
    let total = 0;
    for (const e of idx) total += e.count;
    return { urls: idx.length, snapshots: total };
  }

  remove(url) {
    const snapFile = this._snapFile(url);
    if (fs.existsSync(snapFile)) fs.rmSync(snapFile, { force: true });
    fs.rmSync(path.join(this._pathData(), urlId(url)), { recursive: true, force: true });
    return true;
  }
}

module.exports = { SnapshotArchive: SnapshotArchive, sha1: sha1, urlId: urlId };