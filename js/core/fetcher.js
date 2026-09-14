'use strict';

const zlib = require('zlib');

function decodeBody(buf, headers) {
  const enc = (headers['content-encoding'] || '').toLowerCase();
  if (enc.includes('gzip') || enc.includes('x-gzip')) {
    return zlib.gunzipSync(buf);
  }
  if (enc.includes('deflate')) {
    try { return zlib.inflateSync(buf); } catch (e) { return buf; }
  }
  if (enc.includes('br')) {
    try { return zlib.brotliDecompressSync(buf); } catch (e) { return buf; }
  }
  return buf;
}

function sniffCharset(headers) {
  return (headers['content-type'] || '').match(/charset=["']?([\w.-]+)/i);
}

function decodeText(buf, headers) {
  const body = decodeBody(buf, headers);
  const m = sniffCharset(headers);
  let charset = m ? m[1].toLowerCase() : '';
  if (!charset) {
    const probe = body.slice(0, 4096).toString('utf8', 0, 4096);
    const meta = probe.match(/charset=["']?([\w.-]+)/i);
    if (meta) charset = meta[1].toLowerCase();
  }
  if (charset && charset !== 'utf-8' && charset !== 'utf8') {
    try { return new TextDecoder(charset).decode(body); } catch (e) { /* fallar silencioso */ }
  }
  return body.toString('utf8');
}

async function fetchUrl(url, opts) {
  opts = opts || {};
  const res = await fetch(url, {
    redirect: 'follow',
    headers: Object.assign({
      'user-agent': 'TimeCapsule/1.0 (archive personal)',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'es-ES,es;q=0.8'
    }, opts.headers || {}),
    signal: opts.timeout ? AbortSignal.timeout(opts.timeout) : undefined
  });
  if (!res.ok) {
    throw new Error('HTTP ' + res.status + ' ' + res.statusText + ' para ' + url);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const headers = {};
  res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const html = decodeText(buf, headers);
  return {
    html: html,
    finalUrl: res.url || url,
    status: res.status,
    type: headers['content-type'] || '',
    length: html.length
  };
}

module.exports = { fetchUrl: fetchUrl, decodeText: decodeText, decodeBody: decodeBody };