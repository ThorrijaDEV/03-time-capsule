(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    urls: [],
    cur: null,           // url seleccionada
    versions: [],        // versiones de la url seleccionada
    curId: null,         // id de la versión mostrada
    sliderDrag: false
  };

  var statusT;

  function status(msg, isErr) {
    var el = $('status');
    el.textContent = msg;
    el.className = isErr ? 'err' : '';
    clearTimeout(statusT);
    if (!isErr) statusT = setTimeout(function () { el.textContent = ''; }, 3000);
  }

  async function api(path) {
    var res = await fetch(path);
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleString('es', {
      dateStyle: 'short', timeStyle: 'short'
    });
  }

  function fmtBytes(n) {
    return n > 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
  }

  // ---------- índice ----------
  async function loadIndex() {
    try {
      state.urls = await api('/api/index');
    } catch (e) {
      state.urls = [];
      status('no se pudo leer el índice', true);
    }
    var list = $('url-list');
    list.innerHTML = '';
    if (!state.urls.length) {
      list.innerHTML = '<div class="empty"><div class="big">Sin capturas todavía</div></div>';
    }
    for (var i = 0; i < state.urls.length; i++) {
      (function (e) {
        var d = document.createElement('div');
        d.className = 'u' + (state.cur === e.url ? ' active' : '');
        d.innerHTML = '<div class="t"></div><div class="m"></div>';
        d.querySelector('.t').textContent = e.title || e.url;
        d.querySelector('.m').textContent = e.count + ' capturas · ' + fmtDate(e.last);
        d.onclick = function () { selectUrl(e.url); };
        list.appendChild(d);
      })(state.urls[i]);
    }
  }

  // ---------- selección y versiones ----------
  async function selectUrl(url) {
    state.cur = url;
    state.versions = await api('/api/versions?url=' + encodeURIComponent(url));
    if (!state.versions.length) return;
    renderVersions();
    var latest = state.versions[state.versions.length - 1];
    // ajusta el slider al rango real
    var first = state.versions[0].capturedAt;
    var last = state.versions[state.versions.length - 1].capturedAt;
    var sl = $('timeline-slider');
    sl.disabled = false;
    if (last > first) {
      sl.min = first; sl.max = last; sl.step = Math.max(1, Math.round((last - first) / 1500));
    } else {
      sl.min = first - 1000; sl.max = first + 1000; sl.step = 1;
    }
    sl.value = last;
    $('t-first').textContent = fmtDate(first);
    $('t-last').textContent = fmtDate(last);
    await showId(latest.id);
    await loadIndex();
  }

  function renderVersions() {
    var cont = $('versions');
    cont.innerHTML = '';
    var prevWords = null;
    for (var i = 0; i < state.versions.length; i++) {
      (function (v, i, prev) {
        var chip = document.createElement('button');
        chip.className = 'vchip' + (state.curId === v.id ? ' on' : '');
        var pct = '';
        if (prev !== null && v.words) {
          var delta = ((v.words - prev) / prev) * 100;
          chip.innerHTML = fmtDate(v.capturedAt).replace(', ', ' ') +
            '<span class="delta ' + (delta > 0 ? 'grow' : delta < 0 ? 'shrink' : '') + '">' +
            ' ' + (delta > 0 ? '+' : '') + delta.toFixed(0) + '%</span>';
        } else {
          chip.textContent = fmtDate(v.capturedAt).replace(', ', ' ');
        }
        chip.title = v.title + ' · ' + fmtBytes(v.size) + ' · ' + v.words + ' palabras';
        chip.onclick = function () { showId(v.id); };
        cont.appendChild(chip);
      })(state.versions[i], i, prevWords);
      prevWords = state.versions[i].words;
    }
  }

  // ---------- mostrar snapshot ----------
  async function showId(id) {
    state.curId = id;
    renderVersions();
    var snap = await api('/api/snapshot?url=' + encodeURIComponent(state.cur) + '&id=' + encodeURIComponent(id));
    renderSnapshot(state.cur, snap.data);
    fillDiffSelects();
  }

  function renderSnapshot(url, data) {
    $('cur-title').textContent = data.title;
    $('cur-when').textContent = fmtDate(data.capturedAt) + ' · ' + data.words + ' palabras · ' +
      fmtBytes(data.html.length);
    $('cur-meta').textContent = '#' + data.id;
    var frame = $('preview');
    frame.innerHTML = '';
    var iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:100%;border:0;background:#fff;';
    iframe.sandbox = 'allow-same-origin';   // sin scripts ni formularios
    document.title = 'Time capsule · ' + data.title;
    iframe.srcdoc = sanitizeFrame(data.html);
    frame.appendChild(iframe);
  }

  // pasa de core/text.js: sanea pobremente en cliente (servidor lo re-sanea si hace falta)
  function sanitizeFrame(html) {
    var s = String(html)
      .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
      .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, '')
      .replace(/<\s*(iframe|object|embed|applet|form|input|button|select|textarea|video|audio|canvas)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*(iframe|object|embed|applet|form|input|button|select|textarea|video|audio|canvas)[^>]*\/?>/gi, '')
      .replace(/<\s*(link|meta)[^>]*>/gi, '')
      .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s*=\s*(["'])javascript:[\s\S]*?\1/gi, '');
    return '<meta charset="utf-8"><base target="_blank">' + s.slice(0, 480000);
  }

  // ---------- slider temporal ----------
  var slider = $('timeline-slider');
  slider.addEventListener('pointerdown', function () { state.sliderDrag = true; });
  slider.addEventListener('pointerup', function () { state.sliderDrag = false; });
  slider.addEventListener('input', async function () {
    var ts = +this.value;
    try {
      var snap = await api('/api/snapshotAt?url=' + encodeURIComponent(state.cur) + '&ts=' + ts);
      state.curId = snap.meta.id;
      renderVersions();
      renderSnapshot(state.cur, snap.data);
      fillDiffSelects();
    } catch (e) { /* versión no encontrada, ignorar */ }
  });

  // ---------- diff ----------
  function fillDiffSelects() {
    var a = $('diff-a'), b = $('diff-b');
    var oldA = a.value, oldB = b.value;
    a.innerHTML = ''; b.innerHTML = '';
    for (var i = 0; i < state.versions.length; i++) {
      var v = state.versions[i];
      a.appendChild(opt(v.id, fmtDate(v.capturedAt)));
      b.appendChild(opt(v.id, fmtDate(v.capturedAt)));
    }
    if (oldA && a.querySelector('[value="' + escapeAttr(oldA) + '"]')) a.value = oldA;
    if (oldB && b.querySelector('[value="' + escapeAttr(oldB) + '"]')) b.value = oldB;
    if (!a.value && state.versions.length > 1) a.value = state.versions[0].id;
    if (!b.value) b.value = state.curId || state.versions[state.versions.length - 1].id;
  }

  function opt(v, t) {
    var o = document.createElement('option');
    o.value = v; o.textContent = t;
    return o;
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;');
  }

  $('btn-diff').addEventListener('click', async function () {
    var a = $('diff-a').value, b = $('diff-b').value;
    if (!a || !b) { status('primero captura dos versiones', true); return; }
    var d = await api('/api/diff?url=' + encodeURIComponent(state.cur) + '&a=' + encodeURIComponent(a) + '&b=' + encodeURIComponent(b));
    var sum = d.summary;
    $('diff-summary').innerHTML =
      '<b class="plus">+' + sum.added + '</b> palabras añadidas · ' +
      '<b class="minus">−' + sum.removed + '</b> eliminadas · ' +
      (d.diff.truncated ? ' <i>(resumen acotado)</i>' : '');
    var body = $('diff-body');
    body.innerHTML = '';
    var chunk = [];
    for (var i = 0; i < d.diff.ops.length; i++) {
      var op = d.diff.ops[i];
      if (op.type === '=') {
        flushChunk(body, chunk);
        chunk = [];
        continue;
      }
      chunk.push(op);
    }
    flushChunk(body, chunk);
    $('diff').classList.add('open');
  });

  function flushChunk(body, chunk) {
    if (!chunk.length) return;
    var wrap = [];
    var linelen = 0;
    for (var i = 0; i < chunk.length; i++) {
      var op = chunk[i];
      for (var k = 0; k < op.tokens.length; k++) {
        var t = op.tokens[k];
        if (linelen > 0 && linelen + t.length > 60) { wrap.push('\n'); linelen = 0; }
        wrap.push(t, ' ');
        linelen += t.length + 1;
      }
    }
    var line = wrap.join('').replace(/\n /g, '\n').trim();
    var cls = chunk[0].type === '+' ? 'add' : 'del';
    var div = document.createElement('div');
    div.className = 'l ' + cls;
    div.textContent = (chunk[0].type === '+' ? '+ ' : '− ') + line.slice(0, 300);
    body.appendChild(div);
  }

  $('btn-diff-close').addEventListener('click', function () {
    $('diff').classList.remove('open');
  });
  $('diff-a').addEventListener('change', maybeAutoDiff);
  $('diff-b').addEventListener('change', maybeAutoDiff);

  function maybeAutoDiff() {
    status('selección cambiada — pulsa "Comparar versiones"');
  }

  // ---------- captura y refresco ----------
  $('btn-capture').addEventListener('click', async function () {
    var url = $('url-input').value.trim();
    if (!url) { status('escribe una URL primero', true); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    var btn = this;
    btn.disabled = true;
    status('capturando ' + url + ' …');
    try {
      var r = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url })
      });
      var data = await r.json();
      if (data.error) throw new Error(data.error);
      if (data.unchanged) {
        status('sin cambios desde la última captura de ' + url);
      } else {
        status('✓ archivada · ' + fmtDate(data.version.capturedAt));
      }
      await loadIndex();
      if (state.cur === url) await selectUrl(url);
    } catch (e) {
      status('✗ ' + e.message, true);
    }
    btn.disabled = false;
  });

  $('url-input').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') $('btn-capture').click();
  });

  $('btn-refresh').addEventListener('click', function () { loadIndex(); });

  loadIndex();
})();