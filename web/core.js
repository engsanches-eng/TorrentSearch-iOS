// Núcleo da versão web do Torrent Search: utilitários, rede e parsing.
// Funciona no navegador (via proxy do Worker) e no Node (testes do CI).
(function (G) {
  'use strict';
  const TS = (G.TS = G.TS || {});

  // ---------- Categorias ----------
  TS.CATEGORIES = ['All', 'Anime', 'Apps', 'Books', 'Games', 'Movies', 'Music', 'Porn', 'Series', 'Other'];

  // ---------- Torrent / magnet ----------
  const TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce', 'udp://open.demonoid.ch:6969/announce',
    'udp://open.demonii.com:1337/announce', 'udp://open.stealth.si:80/announce',
    'udp://exodus.desync.com:6969/announce', 'udp://tracker.torrent.eu.org:451/announce',
    'udp://explodie.org:6969/announce', 'udp://tracker2.dler.org:80/announce',
    'udp://tracker.qu.ax:6969/announce', 'udp://tracker.filemail.com:6969/announce',
    'udp://tracker.dler.org:6969/announce', 'udp://tracker.bittor.pw:1337/announce',
    'udp://tracker.0x7c0.com:6969/announce', 'udp://tracker-udp.gbitt.info:80/announce',
    'udp://run.publictracker.xyz:6969/announce', 'udp://retracker01-msk-virt.corbina.net:80/announce',
    'udp://p4p.arenabg.com:1337/announce', 'udp://opentracker.io:6969/announce',
    'udp://open.tracker.cl:1337/announce', 'udp://leet-tracker.moe:1337/announce',
  ];
  const TR = TRACKERS.map((t) => 'tr=' + t).join('&');
  const PREFIX = 'magnet:?xt=urn:btih:';
  TS.magnet = (h) => `${PREFIX}${h}&${TR}`;
  TS.infoHash = (m) => {
    if (!m || !m.startsWith(PREFIX)) return null;
    return m.slice(PREFIX.length).split('&')[0].toLowerCase().trim();
  };
  TS.tid = (pid, src) => `${pid}:${src}`;

  // ---------- Tamanho ----------
  const KB = 1024, MB = KB * 1024, GB = MB * 1024, TB = GB * 1024, PB = TB * 1024;
  TS.formatBytes = (b) => {
    b = Number(b);
    if (!isFinite(b)) return null;
    const [v, u] = b >= PB ? [b / PB, 'PB'] : b >= TB ? [b / TB, 'TB'] : b >= GB ? [b / GB, 'GB'] : b >= MB ? [b / MB, 'MB'] : b >= KB ? [b / KB, 'KB'] : [0, 'B'];
    return `${v.toFixed(2)} ${u}`;
  };
  TS.normalizeSize = (s) => (s == null ? s : s.replace(/(\d)([A-Za-z])/g, '$1 $2'));
  TS.getBytes = (s) => {
    if (!s) return 0;
    const m = String(s).trim().match(/^([\d.,]+)\s*([A-Za-z]+)?/);
    if (!m) return 0;
    const v = parseFloat(m[1].replace(',', '.'));
    const u = m[2] || 'KB';
    const map = { PB, PiB: PB, TB, TiB: TB, GB, GiB: GB, MB, MiB: MB, KB, KiB: KB };
    return (map[u] || 0) * v;
  };

  // ---------- Datas ----------
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const MONTHS_FULL = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  /** Interpreta datas com padrões estilo Java (yyyy, MMM, dd, HH, a, z, E…), em UTC. */
  TS.parseDate = (str, fmt) => {
    if (!str) return null;
    const s = String(str).trim();
    const tokens = fmt.match(/(yyyy|yy|MMMM|MMM|MM|M|dd|d|HH|H|hh|h|mm|m|ss|s|a|z|E+|[^A-Za-z]+|[A-Za-z]+)/g);
    let re = '^', groups = [];
    for (const t of tokens) {
      switch (t) {
        case 'yyyy': re += '(\\d{4})'; groups.push('y'); break;
        case 'yy': re += '(\\d{2})'; groups.push('yy'); break;
        case 'MMMM': re += '([A-Za-z]+)'; groups.push('MMMM'); break;
        case 'MMM': re += '([A-Za-z]{3})[a-z]*\\.?'; groups.push('MMM'); break;
        case 'MM': case 'M': re += '(\\d{1,2})'; groups.push('M'); break;
        case 'dd': case 'd': re += '(\\d{1,2})'; groups.push('d'); break;
        case 'HH': case 'H': case 'hh': case 'h': re += '(\\d{1,2})'; groups.push(t[0] === 'H' ? 'H' : 'h'); break;
        case 'mm': case 'm': re += '(\\d{1,2})'; groups.push('m'); break;
        case 'ss': case 's': re += '(\\d{1,2})'; groups.push('s'); break;
        case 'a': re += '([AaPp][Mm])'; groups.push('a'); break;
        case 'z': re += '([A-Za-z]+|[+-]\\d{2}:?\\d{2})'; groups.push('z'); break;
        default:
          if (/^E+$/.test(t)) { re += '[A-Za-z]+'; break; }
          re += t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
      }
    }
    const m = s.match(new RegExp(re + '$', 'i'));
    if (!m) return null;
    let y = 1970, mo = 0, d = 1, H = 0, mi = 0, se = 0, ampm = null;
    groups.forEach((g, i) => {
      const v = m[i + 1];
      if (g === 'y') y = +v;
      else if (g === 'yy') y = 2000 + +v;
      else if (g === 'MMM') mo = MONTHS.indexOf(v.slice(0, 3).toLowerCase());
      else if (g === 'MMMM') mo = MONTHS_FULL.indexOf(v.toLowerCase());
      else if (g === 'M') mo = +v - 1;
      else if (g === 'd') d = +v;
      else if (g === 'H' || g === 'h') H = +v;
      else if (g === 'm') mi = +v;
      else if (g === 's') se = +v;
      else if (g === 'a') ampm = v.toLowerCase();
    });
    if (mo < 0) return null;
    if (ampm === 'pm' && H < 12) H += 12;
    if (ampm === 'am' && H === 12) H = 0;
    const t = Date.UTC(y, mo, d, H, mi, se);
    return isNaN(t) ? null : t;
  };
  const DAY = 86400000;
  TS.today = () => { const n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); };
  TS.relative = (raw) => {
    if (!raw) return null;
    let s = String(raw).trim().replace(/\+$/, '').trim();
    const sp = { 'today': Date.now(), 'just now': Date.now(), 'moments ago': Date.now(), 'yesterday': TS.today() - DAY,
      'last week': Date.now() - 7 * DAY, 'last month': Date.now() - 30 * DAY, 'last year': Date.now() - 365 * DAY }[s.toLowerCase()];
    if (sp) return sp;
    const m = s.match(/\b(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years)\b/i);
    if (!m) return null;
    const v = Math.floor(+m[1]), u = m[2].toLowerCase();
    const f = /^(s|sec|secs|second|seconds)$/.test(u) ? 1000 : /^(m|min|mins|minute|minutes)$/.test(u) ? 60000 :
      /^(h|hr|hrs|hour|hours)$/.test(u) ? 3600000 : /^(d|day|days)$/.test(u) ? DAY : /^(w|wk|wks|week|weeks)$/.test(u) ? 7 * DAY :
      /^(mo|mos|month|months)$/.test(u) ? 30 * DAY : 365 * DAY;
    return Date.now() - v * f;
  };
  TS.iso = (s) => { if (!s) return null; const t = Date.parse(s); return isNaN(t) ? null : t; };
  TS.epoch = (s) => { const n = Number(s); return s === '' || s == null || !isFinite(n) ? null : n * 1000; };
  const RU = { 'Янв': 'Jan', 'Фев': 'Feb', 'Мар': 'Mar', 'Апр': 'Apr', 'Май': 'May', 'Мая': 'May', 'Июн': 'Jun', 'Июл': 'Jul', 'Авг': 'Aug', 'Сен': 'Sep', 'Окт': 'Oct', 'Ноя': 'Nov', 'Дек': 'Dec' };
  TS.ruMonth = (s) => {
    if (!s) return null;
    const p = s.replace(/\u00a0/g, ' ').trim().split(/\s+/);
    if (p.length < 3 || !RU[p[1]]) return null;
    return `${p[0]} ${RU[p[1]]} ${p.slice(2).join(' ')}`;
  };

  // ---------- HTML ----------
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const fixSel = (sel) => sel.trim().startsWith('>') ? ':scope ' + sel : sel;
  TS.$ = (el, sel) => { try { return el ? el.querySelector(fixSel(sel)) : null; } catch (e) { return null; } };
  TS.$$ = (el, sel) => { try { return el ? Array.from(el.querySelectorAll(fixSel(sel))) : []; } catch (e) { return []; } };
  /** Texto próprio do elemento (sem os filhos), como ownText() do Jsoup. */
  TS.own = (el) => el ? norm(Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ')) : null;
  /** Texto preservando quebras de linha (<br>), como wholeText() do Jsoup. */
  TS.wholeText = (el) => {
    if (!el) return null;
    let out = '';
    const walk = (n) => { if (n.nodeType === 3) out += n.textContent; else if (n.nodeType === 1) { if (n.tagName === 'BR') out += '\n'; n.childNodes.forEach(walk); } };
    el.childNodes.forEach(walk);
    return out;
  };
  TS.txt = (el) => el ? norm(el.textContent) : null;
  TS.at = (el, n) => el ? (el.getAttribute(n) || '') : null;
  TS.abs = (el, n, base) => {
    if (!el) return null;
    const v = el.getAttribute(n);
    if (!v) return '';
    try { return new URL(v, base).href; } catch (e) { return ''; }
  };
  /** Equivale a `tag:containsOwn(text)` do Jsoup. */
  TS.containsOwn = (root, tag, text) => TS.$$(root, tag).find((e) => (TS.own(e) || '').toLowerCase().includes(text.toLowerCase())) || null;
  TS.uint = (s) => { if (s == null) return null; const t = String(s).trim(); return /^\d+$/.test(t) ? +t : null; };
  TS.uintL = (s) => s == null ? null : TS.uint(String(s).replace(/[,.\s]/g, ''));
  TS.nonBlank = (s) => (s && String(s).trim() ? s : null);
  TS.lastSeg = (s, ch = '/') => s ? s.slice(s.lastIndexOf(ch) + 1) : s;

  // ---------- Rede ----------
  class CloudflareError extends Error { constructor(u) { super('Bloqueado pelo Cloudflare'); this.cloudflare = true; this.url = u; } }
  TS.CloudflareError = CloudflareError;

  /** Implementação de transporte definida pelo ambiente (navegador ou Node). */
  TS.transport = TS.transport || null;

  async function http(url, opts = {}) {
    const r = await TS.transport({ url, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body || null, redirect: opts.redirect || 'follow' });
    const cf = (r.headers['cf-mitigated'] || '').toLowerCase() === 'challenge';
    if (cf || r.status === 403 || r.status === 503) throw new CloudflareError(url);
    return r;
  }
  TS.http = http;
  TS.getText = async (url, headers) => (await http(url, { headers })).text;
  TS.getJson = async (url, headers) => { const t = (await http(url, { headers })).text; try { return JSON.parse(t); } catch (e) { return null; } };
  TS.postJson = async (url, payload, headers = {}) => {
    const h = Object.assign({}, headers);
    let body = null;
    if (payload !== undefined && payload !== null) { body = JSON.stringify(payload); h['Content-Type'] = 'application/json'; }
    const t = (await http(url, { method: 'POST', headers: h, body })).text;
    try { return JSON.parse(t); } catch (e) { return null; }
  };
  TS.submitForm = async (url, pairs) => {
    const body = pairs.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v).replace(/%20/g, '+')).join('&');
    return (await http(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body })).text;
  };
  TS.getLocation = async (url) => (await http(url, { redirect: 'manual' })).headers['location'] || null;

  // ---------- Parsing (DOMParser no navegador; jsdom no Node) ----------
  TS.parseHtml = TS.parseHtml || ((html) => new DOMParser().parseFromString(html, 'text/html'));
  TS.parseXml = TS.parseXml || ((xml) => new DOMParser().parseFromString(xml, 'application/xml'));

  /** Busca o primeiro link magnet de uma página. */
  TS.firstMagnet = async (url, sel = 'a[href^="magnet:?"]', attr = 'href') => {
    const doc = TS.parseHtml(await TS.getText(url), url);
    const m = TS.nonBlank(TS.at(TS.$(doc, sel), attr));
    if (!m) throw new Error('Magnet não encontrado');
    return m;
  };

  /** Equivale ao Uri.encode do Android. */
  TS.encode = (q) => encodeURIComponent(q).replace(/[!'()*]/g, (c) => c);
  TS.decode = (q) => { try { return decodeURIComponent(q); } catch (e) { return q; } };

  /** Cria um objeto Torrent. */
  TS.T = (o) => ({
    id: o.id, name: o.name, size: o.size ?? null, seeders: o.seeders ?? null, peers: o.peers ?? null,
    provider: o.provider, date: o.date ?? null, category: o.category ?? null, details: o.details || null,
    magnet: o.magnet || null, fetch: o.fetch || null, file: o.file || null,
  });
})(typeof window !== 'undefined' ? window : globalThis);
