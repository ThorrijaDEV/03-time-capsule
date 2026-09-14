(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CAPSULE = root.CAPSULE || {};
    root.CAPSULE.Text = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Extrae el <title> de un HTML.
  function extractTitle(html) {
    var m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html || '');
    return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  }

  var BLOCK_RE = /<\/(h[1-6]|p|div|li|ul|ol|tr|table|blockquote|section|article|aside|header|footer|nav|figure|figcaption|pre|form)>|<br\s*\/?>|<hr\s*\/?>/gi;
  var TAG_RE = /<[^>]+>/g;
  var SCRIPT_RE = /<\s*(script|style|noscript|template|svg|math)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;

  var NAMED = {
    'aacute':'á','eacute':'é','iacute':'í','oacute':'ó','uacute':'ú',
    'Aacute':'Á','Eacute':'É','Iacute':'Í','Oacute':'Ó','Uacute':'Ú',
    'ntilde':'ñ','Ntilde':'Ñ','auml':'ä','euml':'ë','ouml':'ö','uuml':'ü',
    'Auml':'Ä','Ouml':'Ö','Uuml':'Ü',
    'agrave':'à','egrave':'è','igrave':'ì','ograve':'ò','ugrave':'ù',
    'ccedil':'ç','Ccedil':'Ç','szlig':'ß','aring':'å','oslash':'ø',
    'iexcl':'¡','iquest':'¿','middot':'·','laquo':'«','raquo':'»',
    'ndash':'–','mdash':'—','lsquo':'‘','rsquo':'’','ldquo':'“','rdquo':'”',
    'hellip':'…','bull':'•','deg':'°','plusmn':'±','times':'×','divide':'÷',
    'euro':'€','pound':'£','yen':'¥','copy':'©','reg':'®','trade':'™',
    'curren':'¤','sect':'§','para':'¶','micro':'µ','sup2':'²','sup3':'³',
    'frac14':'¼','frac12':'½','frac34':'¾','prime':'′','Prime':'″'
  };

  function decodeEntities(s) {
    return String(s)
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&#x22;/gi, '"')
      .replace(/&#(\d+);/g, function (_, d) {
        try { return String.fromCodePoint(+d); } catch (e) { return ''; }
      })
      .replace(/&([a-zA-Z][a-zA-Z0-9]{1,7});/g, function (m, name) {
        return Object.prototype.hasOwnProperty.call(NAMED, name) ? NAMED[name] : m;
      });
  }

  // Texto visible y plano de una página (para diffs y resumen).
  function extractText(html) {
    if (!html) return '';
    var s = String(html)
      .replace(/\<\!--[\s\S]*?--\>/g, ' ')
      .replace(/<\s*head[^>]*>[\s\S]*?<\s*\/\s*head\s*>/gi, '')
      .replace(/<\s*title[^>]*>[\s\S]*?<\s*\/\s*title\s*>/gi, '')
      .replace(SCRIPT_RE, '\n')
      .replace(BLOCK_RE, '\n')
      .replace(TAG_RE, ' ')
      .replace(/\u00a0/g, ' ');
    s = decodeEntities(s);
    s = s.replace(/[ \t\r]+/g, ' ')
          .replace(/\n[ \t]*/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
    return s.slice(0, 40000);
  }

  function countWords(text) {
    var m = text.match(/[\w\u00e0-\u00ff]+/g);
    return m ? m.length : 0;
  }

  // Limpia HTML para renderizarlo sin ejecutar nada.
  function sanitizeHtml(html) {
    if (!html) return '';
    var s = String(html)
      // fuera: scripts, hojas de estilo, embebidos y formularios
      .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
      .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, '')
      .replace(/<\s*(iframe|object|embed|applet|form|input|button|select|textarea|video|audio|canvas)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*(iframe|object|embed|applet|form|input|button|select|textarea|video|audio|canvas)[^>]*\/?>/gi, '')
      .replace(/<\s*(link|meta|base)[^>]*>/gi, '')
      // eventos javascript y urls peligrosas
      .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s*=\s*(["'])javascript:[\s\S]*?\1/gi, '')
      .replace(/\s*=\s*(javascript:)[^\s>]+/gi, '')
      // meta refresh que redirige
      .replace(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '');
    return s.slice(0, 500000);
  }

  // Convierte texto en tokens para diff a nivel de palabra.
  function tokenizeWords(text) {
    return String(text).match(/[\w\u00e0-\u00ff]+|[^\w\s\u00e0-\u00ff]/g) || [];
  }

  // Diff Myers/LCS a nivel de palabras, acotado para no explotar.
  function diffTexts(a, b, max) {
    max = max || 2500;
    var ta = tokenizeWords(a).slice(0, max);
    var tb = tokenizeWords(b).slice(0, max);
    var truncated = tokenizeWords(a).length > max || tokenizeWords(b).length > max;

    var n = ta.length, m = tb.length;
    var dp = new Uint32Array((n + 1) * (m + 1));
    var i, j;
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        var idx = i * (m + 1) + j;
        if (ta[i] === tb[j]) {
          dp[idx] = dp[(i + 1) * (m + 1) + j + 1] + 1;
        } else {
          var d1 = dp[(i + 1) * (m + 1) + j];
          var d2 = dp[i * (m + 1) + j + 1];
          dp[idx] = d1 >= d2 ? d1 : d2;
        }
      }
    }
    var ops = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (ta[i] === tb[j]) {
        appendOp(ops, '=', ta[i]); i++; j++;
      } else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) {
        appendOp(ops, '-', ta[i]); i++;
      } else {
        appendOp(ops, '+', tb[j]); j++;
      }
    }
    while (i < n) { appendOp(ops, '-', ta[i]); i++; }
    while (j < m) { appendOp(ops, '+', tb[j]); j++; }

    // Agrupa operaciones consecutivas del mismo tipo.
    var groups = [];
    for (var k = 0; k < ops.length; k++) {
      var o = ops[k];
      var last = groups[groups.length - 1];
      if (last && last.type === o.type) last.tokens.push(o.token);
      else groups.push({ type: o.type, tokens: [o.token] });
    }
    return { ops: groups, truncated: truncated };
  }

  function appendOp(list, type, token) {
    list.push({ type: type, token: token });
  }

  // Resumen estructural de un diff para la UI.
  function diffSummary(diff) {
    var added = 0, removed = 0, kept = 0;
    for (var i = 0; i < diff.ops.length; i++) {
      var o = diff.ops[i];
      if (o.type === '+') added += o.tokens.length;
      else if (o.type === '-') removed += o.tokens.length;
      else kept += o.tokens.length;
    }
    return { added: added, removed: removed, kept: kept };
  }

  return {
    extractTitle: extractTitle,
    extractText: extractText,
    countWords: countWords,
    sanitizeHtml: sanitizeHtml,
    tokenizeWords: tokenizeWords,
    diffTexts: diffTexts,
    diffSummary: diffSummary,
    decodeEntities: decodeEntities
  };
}));