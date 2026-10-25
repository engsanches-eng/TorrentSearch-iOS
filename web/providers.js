// Os 46 buscadores do TorrentSearch 0.5.2, portados para JavaScript.
(function (G) {
  'use strict';
  const TS = G.TS;
  const { $, $$, own, txt, at, abs, uint, uintL, nonBlank, T, magnet, infoHash, tid, parseHtml } = TS;
  const P = (TS.providers = []);
  const add = (p) => { p.cf = !!p.cf; p.def = !!p.def; P.push(p); return p; };
  const doc = async (u, h) => parseHtml(await TS.getText(u, h), u);
  const ALL9 = ['Anime', 'Apps', 'Books', 'Games', 'Movies', 'Music', 'Porn', 'Series', 'Other'];

  // ---------------- AniLibria ----------------
  add({ id: 'anilibria', name: 'AniLibria', url: 'https://www.anilibria.top', cats: ['Anime'],
    async search(q) {
      const api = 'https://anilibria.top/api/v1';
      const rel = (await TS.getJson(`${api}/app/search/releases?query=${q}`)) || [];
      const ids = rel.map((o) => o && o.id).filter((x) => x != null).slice(0, 15);
      const lists = await Promise.all(ids.map(async (id) => (await TS.getJson(`${api}/anime/torrents/release/${id}`)) || []));
      return lists.flat().map((o) => {
        if (!o || !o.hash) return null;
        const r = o.release || {};
        const name = o.label || (r.name && (r.name.english || r.name.main));
        if (!name) return null;
        return T({ id: tid(this.id, String(o.id ?? o.hash)), name, size: TS.formatBytes(o.size), seeders: o.seeders, peers: o.leechers,
          provider: this.name, date: TS.iso(o.created_at), category: 'Anime',
          details: r.alias ? `${this.url}/anime/releases/release/${r.alias}` : null, magnet: o.magnet || magnet(o.hash) });
      }).filter(Boolean);
    } });

  // ---------------- AniRena ----------------
  const aniRenaCat = (r) => ({ Anime: 'Anime', Manga: 'Books', Literature: 'Books', Audio: 'Music', 'Live Action': 'Series', Software: 'Apps', Hentai: 'Porn' }[r] || 'Other');
  add({ id: 'anirena', name: 'AniRena', url: 'https://anirena.com', cats: ['Anime', 'Apps', 'Books', 'Music', 'Porn', 'Series', 'Other'],
    map: { Anime: 'anime', Apps: 'software', Books: 'manga', Music: 'audio', Porn: 'hentai', Series: 'live', Other: 'other' },
    async search(q, c) {
      let u = `${this.url}?q=${q}&page=1`;
      if (c !== 'All' && this.map[c]) u += `&cat=${this.map[c]}`;
      return this.parse(await doc(u), u);
    },
    async latest() { return this.parse(await doc(this.url), this.url); },
    async top() { return this.latest(); },
    async getMagnet(u) { const m = await TS.getLocation(u); if (!m) throw new Error('Magnet não encontrado'); return m; },
    parse(d, base) {
      const NAME = 'td.col-name > div.tl-name-wrap > a.tl-torrent-name';
      return $$(d, 'table.tl-table > tbody > tr').map((li) => {
        const n = own($(li, NAME)); const src = abs($(li, 'td.col-actions > div.tl-actions > a:nth-child(1)'), 'href', base);
        if (!n || !src) return null;
        const rid = nonBlank(at($(li, NAME), 'data-torrent-id')) || src;
        const cat = nonBlank(at($(li, 'td.col-cat'), 'title'));
        return T({ id: tid(this.id, rid), name: n, size: own($(li, 'td.col-size')), seeders: uint(own($(li, 'td.col-se > span.tl-se'))),
          peers: uint(own($(li, 'td.col-le > span.tl-le'))), provider: this.name, date: TS.epoch(nonBlank(at(li, 'data-created-ts'))),
          category: cat ? aniRenaCat(cat.split('/')[0].trim()) : null, details: abs($(li, NAME), 'href', base), fetch: src,
          file: abs($(li, 'td.col-actions > div.tl-actions > a:nth-child(2)'), 'href', base) });
      }).filter(Boolean);
    } });

  // ---------------- AnimeTosho ----------------
  add({ id: 'animetosho', name: 'AnimeTosho', url: 'https://animetosho.org', cats: ['Anime'], def: true,
    async search(q) {
      const d = await doc(`${this.url}/search?q=${q}`);
      return $$(d, 'div.home_list_entry').map((e) => {
        const a = $(e, 'div.link > a'); const det = nonBlank(at(a, 'href')); const links = $(e, 'div.links');
        const mg = at($(links, 'a[href^="magnet:"]'), 'href');
        if (!a || !det || !links || !mg) return null;
        let s = 0, p = 0;
        const span = $$(links, 'span').find((x) => x.hasAttribute('title'));
        const g = span && (own(span) || '').match(/\[(\d+)↑\/(\d+)↓]/);
        if (g) { s = +g[1]; p = +g[2]; }
        let date = null;
        const raw = (at($(e, 'div.date'), 'title') || '').replace('Date/time submitted: ', '').trim();
        if (raw.startsWith('Today')) date = TS.today(); else if (raw.startsWith('Yesterday')) date = TS.today() - 86400000;
        else if (raw) date = TS.parseDate(raw.split(' ')[0], 'd/M/yyyy');
        return T({ id: tid(this.id, det), name: txt(a), size: own($(e, 'div.size')), seeders: s, peers: p, provider: this.name,
          date, category: 'Anime', details: det, magnet: mg, file: at($(links, 'a.dllink'), 'href') });
      }).filter(Boolean);
    } });

  // ---------------- AudioBookBay ----------------
  add({ id: 'audiobookbay', name: 'AudioBookBay', url: 'https://audiobookbay.lu', cats: ['Books'],
    async search(q) { const u = `${this.url}/?s=${q}`; return this.parse(await doc(u), u); },
    async latest() { return this.parse(await doc(this.url), this.url); },
    async getMagnet(u) {
      const h = TS.own(TS.containsOwn(await doc(u), 'td', 'Info Hash:')?.nextElementSibling);
      if (!h) throw new Error('Info hash não encontrado');
      return magnet(h);
    },
    parse(d, base) {
      return $$(d, 'div.post').map((li) => {
        const a = $(li, 'div.postTitle > h2 > a'); const n = own(a); const det = abs(a, 'href', base);
        if (!n || !det) return null;
        const lines = (TS.wholeText($(li, 'div.postContent > p:nth-child(3)')) || '').split('\n').map((l) => l.trim());
        const size = lines.find((l) => l.trim().startsWith('File Size: '));
        const posted = lines.find((l) => l.trim().startsWith('Posted: '));
        return T({ id: tid(this.id, det), name: n, size: size ? size.split('File Size: ')[1].trim().replace(/s$/, '') : null, provider: this.name,
          date: posted ? TS.parseDate(posted.split('Posted: ')[1].trim(), 'd MMM yyyy') : null, category: 'Books', details: det, fetch: det });
      }).filter(Boolean);
    } });

  // ---------------- BTDigg ----------------
  add({ id: 'btdigg', name: 'BTDigg', url: 'https://btdig.com', cats: ['Other'],
    async search(q) {
      const u = `https://btdig.com/search?q=${q}`; const d = await doc(u);
      return $$(d, 'div.one_result > div').map((li) => {
        const a = $(li, 'div.torrent_name > a'); const mg = at($(li, 'div.torrent_magnet > div.fa-magnet > a'), 'href'); const h = infoHash(mg);
        if (!a || !h) return null;
        return T({ id: tid(this.id, h), name: txt(a), size: own($(li, 'span.torrent_size')), provider: this.name,
          date: TS.relative((own($(li, 'span.torrent_age')) || '').replace(/^found /, '')), details: abs(a, 'href', u), magnet: mg });
      }).filter(Boolean);
    } });

  // ---------------- BangumiMoe ----------------
  add({ id: 'bangumimoe', name: 'BangumiMoe', url: 'https://bangumi.moe', cats: ['Anime'],
    async search(q) { return this.parse(await TS.postJson(`${this.url}/api/v2/torrent/search`, { query: TS.decode(q) })); },
    async latest() { return this.parse(await TS.getJson(`${this.url}/api/torrent/latest`)); },
    parse(j) {
      return ((j && j.torrents) || []).map((o) => {
        if (!o.title || !o.magnet) return null;
        return T({ id: tid(this.id, o._id || infoHash(o.magnet)), name: o.title, size: o.size, seeders: o.seeders, peers: o.leechers,
          provider: this.name, date: TS.iso(o.publish_time), category: 'Anime', details: o._id ? `${this.url}/torrent/${o._id}` : null, magnet: o.magnet });
      }).filter(Boolean);
    } });

  // ---------------- BitSearch ----------------
  const bitCat = (r) => r.startsWith('Movies') ? 'Movies' : r === 'TV' ? 'Series' : r.startsWith('Anime') ? 'Anime' : r.startsWith('Softwares') ? 'Apps' :
    r.startsWith('Games') ? 'Games' : r.startsWith('Music') ? 'Music' : (r === 'AudioBook' || r === 'Ebook/Course') ? 'Books' : r === 'XXX' ? 'Porn' : 'Other';
  add({ id: 'bitsearch', name: 'BitSearch', url: 'https://bitsearch.to', cats: ALL9,
    cid: { All: null, Anime: 4, Apps: 5, Books: 9, Games: 6, Movies: 2, Music: 7, Porn: 10, Series: 3, Other: 1 },
    async search(q, c) {
      const cid = this.cid[c];
      const pages = await Promise.all([1, 2, 3, 4, 5].map(async (p) => {
        let u = `${this.url}/search?q=${q}&page=${p}&sortBy=seeders`; if (cid) u += `&category=${cid}`;
        return this.parse(await doc(u), u);
      }));
      return pages.flat();
    },
    async latest(c) { let u = `${this.url}/latest`; if (this.cid[c]) u += `?category=${this.cid[c]}`; return this.parse(await doc(u), u); },
    async top(c) { let u = `${this.url}/trending`; if (this.cid[c]) u += `?category=${this.cid[c]}`; return this.parse(await doc(u), u); },
    parse(d, base) {
      const I = '> div:nth-child(1)', D = '> div:nth-child(2)', M = `${I} > div:nth-last-child(2)`, S = `${I} > div:nth-last-child(1)`;
      return $$(d, 'div.space-y-4 > div > div:nth-child(1)').map((li) => {
        const ne = $(li, `${I} h3`); const mg = at($(li, `${D} > a:nth-child(2)`), 'href');
        if (!ne || !mg) return null;
        const rawDate = own($(li, `${M} > span:nth-child(3) > span`));
        const cat = own($(li, `${M} > span:nth-child(1) > span`));
        return T({ id: tid(this.id, nonBlank(TS.lastSeg(at(ne, 'href'))) || infoHash(mg)), name: txt(ne), size: own($(li, `${M} > span:nth-child(2) > span`)),
          seeders: uint(own($(li, `${S} > span:nth-child(1) > span:nth-child(2)`))), peers: uint(own($(li, `${S} > span:nth-child(2) > span:nth-child(2)`))),
          provider: this.name, date: TS.parseDate(rawDate, 'M/d/yyyy') || TS.relative(rawDate), category: cat ? bitCat(cat) : null,
          details: abs($(li, `${I} h3 > a`), 'href', base), magnet: mg, file: abs($(li, `${D} > a:nth-child(1)`), 'href', base) });
      }).filter(Boolean);
    } });

  // ---------------- BlueRoms ----------------
  add({ id: 'blueroms', name: 'BlueRoms', url: 'https://www.blueroms.ws', cats: ['Games'],
    async search(q) {
      const u = `${this.url}/search?g=0&p=0&q=${q}`; const d = await doc(u);
      return $$(d, 'div.row > div.col-xs-12 > div.card').map((li) => {
        const dl = abs($(li, 'div.card-footer > a'), 'href', u); const game = own($(li, 'h4.card-title > a'));
        if (!dl || !game) return null;
        const plat = own(TS.containsOwn(li, 'strong', 'Platform:')?.nextElementSibling);
        const sz = TS.containsOwn(li, 'strong', 'Size:')?.nextSibling;
        return T({ id: tid(this.id, TS.lastSeg(dl)), name: plat ? `${game} - ${plat}` : game,
          size: sz && sz.nodeType === 3 ? TS.normalizeSize(sz.textContent.trim()) : null, provider: this.name, category: 'Games',
          details: abs($(li, 'h4.card-title > a'), 'href', u), fetch: dl });
      }).filter(Boolean);
    },
    async getMagnet(u) {
      const enc = nonBlank(at($(await doc(u), 'button#magnet-button'), 'data-link'));
      if (!enc) throw new Error('Magnet não encontrado');
      return typeof atob === 'function' ? atob(enc) : Buffer.from(enc, 'base64').toString('utf8');
    } });

  // ---------------- BT4G (Cloudflare) ----------------
  const bt4gCat = (r) => ({ Video: 'Movies', Movie: 'Movies', Audio: 'Music', Doc: 'Books', App: 'Apps', Application: 'Apps' }[r] || 'Other');
  add({ id: 'bt4g', name: 'BT4G', url: 'https://bt4gprx.com', cats: ['Apps', 'Books', 'Movies', 'Music', 'Other'], cf: true,
    map: { All: 'all', Apps: 'app', Books: 'doc', Movies: 'movie', Music: 'audio', Other: 'other' },
    async search(q, c) { const u = `${this.url}/search?q=${q}&category=${this.map[c] || 'all'}&orderby=seeders&p=1`; return this.parse(await doc(u), u); },
    async latest() { const u = `${this.url}/new`; return this.parse(await doc(u), u); },
    async top() { const u = `${this.url}/week`; return this.parse(await doc(u), u); },
    async getMagnet(u) {
      const h = (at($(await doc(u), 'a[href^="//downloadtorrentfile.com/hash/"]'), 'href') || '').replace('//downloadtorrentfile.com/hash/', '').split('?')[0];
      if (!h) throw new Error('Info hash não encontrado');
      return magnet(h);
    },
    parse(d, base) {
      return $$(d, 'div.notion-list-item').map((li) => {
        const a = $(li, 'div.notion-list-item-title > a'); const det = abs(a, 'href', base);
        if (!det) return null;
        const raw = (own($(li, 'div.notion-list-item-meta > span:nth-child(2)')) || '').replace('Creation Time: ', '').trim();
        const cat = own($(li, 'div.notion-list-item-meta span.notion-tag'));
        return T({ id: tid(this.id, TS.lastSeg(det)), name: txt(a), size: TS.normalizeSize(own($(li, 'div.notion-list-item-meta > span:nth-child(5) > b'))),
          seeders: uint(own($(li, 'div.notion-list-item-meta span#seeders'))), peers: uint(own($(li, 'div.notion-list-item-meta span#leechers'))),
          provider: this.name, date: TS.parseDate(raw, 'yyyy-MM-dd') || TS.relative(raw), category: cat ? bt4gCat(cat) : null, details: det, fetch: det });
      }).filter(Boolean);
    } });

  // ---------------- Btsow ----------------
  add({ id: 'btsow', name: 'Btsow', url: 'https://btsow.live', cats: ['Other'],
    async search(q) {
      const j = await TS.postJson('https://btsow.live/bts/data/api/search', [{ search: TS.decode(q) }, 30, 1]);
      return ((j && j.data) || []).map((o) => {
        const h = (o.hash || '').toLowerCase(); if (!o.name || !h) return null;
        return T({ id: tid(this.id, h), name: o.name.replace(/<\/?em>/g, ''), size: TS.formatBytes(o.size), provider: this.name,
          details: `${this.url}/magnet/detail/${h}`, magnet: magnet(h) });
      }).filter(Boolean);
    } });

  // ---------------- Dmhy ----------------
  const dmhyCat = (id) => (['2', '7', '31'].includes(id) ? 'Anime' : id === '3' ? 'Books' : ['41', '42', '6'].includes(id) ? 'Series' :
    ['4', '43', '44', '15'].includes(id) ? 'Music' : ['9', '17', '18', '19', '20', '21'].includes(id) ? 'Games' : 'Other');
  add({ id: 'dmhy', name: 'Dmhy', url: 'https://share.dmhy.org', cats: ['Anime', 'Books', 'Games', 'Music', 'Series', 'Other'],
    map: { All: 0, Anime: 2, Books: 3, Games: 9, Music: 4, Series: 6, Other: 1 },
    async search(q, c) { const u = `${this.url}/topics/list?keyword=${q}&sort_id=${this.map[c] ?? 0}&team_id=0&order=date-desc`; return this.parse(await doc(u), u); },
    async latest(c) { const u = `${this.url}/topics/list/sort_id/${this.map[c] ?? 0}`; return this.parse(await doc(u), u); },
    async top(c) { return this.latest(c); },
    parse(d, base) {
      return $$(d, 'table#topic_list > tbody > tr').map((li) => {
        const a = $(li, 'td.title > a'); const mg = at($(li, 'td:nth-child(4) > a[href^="magnet:?xt="]'), 'href'); const h = infoHash(mg);
        if (!a || !h) return null;
        const cls = ($(li, 'td:nth-child(2) > a')?.className || '').replace('sort-', '');
        return T({ id: tid(this.id, h), name: own(a), size: TS.normalizeSize(own($(li, 'td:nth-child(5)'))), seeders: uint(txt($(li, 'td:nth-child(6)'))),
          peers: uint(txt($(li, 'td:nth-child(7)'))), provider: this.name, date: TS.parseDate(own($(li, 'td:nth-child(1) > span')), 'yyyy/MM/dd HH:mm'),
          category: cls ? dmhyCat(cls) : null, details: abs(a, 'href', base), magnet: mg });
      }).filter(Boolean);
    } });

  // ---------------- EpubLibre ----------------
  add({ id: 'epublibre', name: 'EpubLibre', url: 'https://epublibre.org', cats: ['Books'],
    H: { 'X-Requested-With': 'XMLHttpRequest' },
    async search(q) { return this.parse(await TS.postJson(`${this.url}/catalogo/index/0/nuevo/todos/sin/todos/${q}/ajax`, null, this.H)); },
    async latest() { return this.parse(await TS.postJson(`${this.url}/catalogo/index/0/nuevo/novedades/sin/todos/--/ajax`, null, this.H)); },
    async top() { return this.parse(await TS.postJson(`${this.url}/catalogo/index/0/valorado/novedades/sin/todos/--/ajax`, null, this.H)); },
    async getMagnet(u) { return TS.firstMagnet(u, 'a#en_desc'); },
    parse(j) {
      if (!j || !j.contenido) return [];
      return $$(parseHtml(j.contenido), 'div.span2').map((li) => {
        const book = own($(li, 'a#stk > div.texto-portada > h1')); const det = nonBlank(at($(li, 'a#stk'), 'href'));
        if (!book || !det) return null;
        const au = own($(li, 'a#stk > div.texto-portada > h2'));
        return T({ id: tid(this.id, nonBlank(TS.lastSeg(det)) || det), name: au ? `${book} - ${au}` : book, provider: this.name, category: 'Books', details: det, fetch: det });
      }).filter(Boolean);
    } });

  // ---------------- Ext (Cloudflare) ----------------
  const extCat = (r) => ({ anime: 'Anime', applications: 'Apps', books: 'Books', games: 'Games', movies: 'Movies', music: 'Music', tv: 'Series', xxx: 'Porn' }[r] || 'Other');
  add({ id: 'extdotto', name: 'Ext', url: 'https://ext.to', cats: ALL9, cf: true,
    map: { Anime: 7, Apps: 5, Books: 6, Games: 4, Movies: 1, Music: 3, Other: 8, Porn: 10, Series: 2 },
    async search(q, c) { let u = `${this.url}/browse/?`; if (this.map[c]) u += `cat=${this.map[c]}&`; u += `q=${q}`; return this.parse(await doc(u), u); },
    async latest(c) { return this.browse('age', c); },
    async top(c) { return this.browse('seeds', c); },
    async browse(s, c) { let u = `${this.url}/browse/?sort=${s}&order=desc&age=4`; if (c !== 'All' && this.map[c]) u += `&cat=${this.map[c]}`; return this.parse(await doc(u), u); },
    parse(d, base) {
      const N = 'td:nth-child(1) > div:nth-child(1) > a.torrent-title-link';
      return $$(d, 'table.search-table > tbody > tr').map((li) => {
        const a = $(li, N); const det = abs(a, 'href', base); const rid = at($(li, 'td:nth-child(1) > div:nth-child(2) > a.search-magnet-btn'), 'data-id');
        if (!det || !rid) return null;
        const cat = (at($(li, 'td:nth-child(1) > div:nth-child(1) > div.related-posted > a:nth-child(2)'), 'href') || '').replace(/^\/|\/$/g, '');
        return T({ id: tid(this.id, rid), name: txt(a), size: own($(li, 'td:nth-child(2) > div > span:nth-child(2)')),
          seeders: uint(own($(li, 'td:nth-child(5) > div > span:nth-child(2)'))), peers: uint(own($(li, 'td:nth-child(6) > div > span:nth-child(2)'))),
          provider: this.name, date: TS.parseDate(at($(li, 'td:nth-child(4) > div > span:nth-child(2)'), 'title'), 'dd MMMM yyyy'),
          category: cat ? extCat(cat) : null, details: det, fetch: det });
      }).filter(Boolean);
    },
    async getMagnet() { throw new Error('Disponível só no app (proteção Cloudflare)'); } });

  // ---------------- Eztv (Cloudflare) ----------------
  add({ id: 'eztvx', name: 'Eztv', url: 'https://eztvx.to', cats: ['Series'], cf: true, def: true,
    async search(q) {
      const u = `${this.url}/search/${q}`; const d = await doc(u, { Cookie: 'layout=def_wlinks' });
      return $$(d, 'table:last-of-type > tbody > tr').slice(2).map((li) => {
        const a = $(li, 'td:nth-child(2) > a.epinfo'); const mg = at($(li, 'td:nth-child(3) > a.magnet'), 'href'); const h = infoHash(mg);
        if (!a || !h) return null;
        return T({ id: tid(this.id, h), name: own(a), size: own($(li, 'td:nth-child(4)')), seeders: uint(own($(li, 'td:nth-child(6)'))), peers: 0,
          provider: this.name, category: 'Series', details: abs(a, 'href', u), magnet: mg, file: abs($(li, 'td:nth-child(3) > a:nth-child(2)'), 'href', u) });
      }).filter(Boolean);
    } });

  // ---------------- FileMood ----------------
  add({ id: 'filemood', name: 'FileMood', url: 'https://filemood.com', cats: ['Other'],
    async search(q) {
      const u = `${this.url}/result?q=${q}+in%3Atitle`; const d = await doc(u);
      return $$(d, 'table > tbody > tr').filter((tr) => $(tr, 'a.btn-success')).map((li) => {
        const n = txt($(li, '> td.dn-title')); const det = abs($(li, 'td.dn-btn > div > a'), 'href', u);
        if (!n || !det) return null;
        const h = TS.lastSeg(det.replace(/\.html$/, ''), '-').toLowerCase().trim();
        const sp = (txt($(li, 'td.dn-status')) || '').split('/');
        return T({ id: tid(this.id, h), name: n, size: txt($(li, 'td.dn-size')), seeders: uint(sp[0]), peers: uint(sp[1]), provider: this.name,
          category: 'Other', details: det, magnet: magnet(h) });
      }).filter(Boolean);
    } });

  // ---------------- FitGirl Repacks ----------------
  add({ id: 'fitgirlrepacks', name: 'FitGirl Repacks', url: 'https://fitgirl-repacks.site', cats: ['Games'],
    async search(q) { const u = `${this.url}/?s=${q}`; return this.parse(await doc(u), u); },
    async latest() { return this.parse(await doc(this.url), this.url); },
    async getMagnet(u) { return TS.firstMagnet(u, 'a[href^="magnet:?xt="]'); },
    parse(d, base) {
      return $$(d, 'article.category-lossless-repack').map((li) => {
        const a = $(li, 'header > h1.entry-title > a'); const det = abs(a, 'href', base);
        if (!det) return null;
        const mg = nonBlank(at($(li, 'div.entry-content a[href^="magnet:?xt="]'), 'href'));
        return T({ id: tid(this.id, nonBlank(li.id) || det), name: own(a), provider: this.name,
          date: TS.iso(at($(li, 'header > div.entry-meta > span.entry-date > a > time'), 'datetime')), category: 'Games', details: det,
          magnet: mg, fetch: mg ? null : det });
      }).filter(Boolean);
    } });

  // ---------------- InternetArchive ----------------
  add({ id: 'internetarchive', name: 'InternetArchive', url: 'https://archive.org', cats: ['Apps', 'Books', 'Movies', 'Other'],
    async search(q, c) {
      let u = `${this.url}/advancedsearch.php?q=title:${q}`;
      if (c !== 'All') u += `%20AND%20mediatype:%28${({ Apps: 'software', Books: 'texts', Movies: 'movies' })[c] || 'other'}%29`;
      u += '&fl%5B%5D=title,item_size,publicdate,mediatype,identifier,btih&rows=100&page=1&output=json';
      const j = await TS.getJson(u);
      return ((j && j.response && j.response.docs) || []).map((o) => {
        const h = (o.btih || '').toLowerCase().trim(); if (!o.title || !h) return null;
        return T({ id: tid(this.id, o.identifier || h), name: o.title, size: TS.formatBytes(o.item_size), provider: this.name, date: TS.iso(o.publicdate),
          category: ({ software: 'Apps', texts: 'Books', movies: 'Movies' })[o.mediatype] || 'Other',
          details: o.identifier ? `${this.url}/details/${o.identifier}` : null, magnet: magnet(h) });
      }).filter(Boolean);
    } });

  // ---------------- Knaben ----------------
  add({ id: 'knaben', name: 'Knaben', url: 'https://knaben.org', cats: ALL9, def: true,
    ids: { All: [], Music: [1000000], Series: [2000000], Movies: [3000000], Apps: [4000000], Porn: [5000000], Anime: [6000000], Games: [7000000], Books: [9000000], Other: [10000000] },
    body(q, c, order) {
      const b = { size: 300, order_by: order, order_direction: 'desc', hide_unsafe: true, hide_xxx: false };
      if (q != null) b.query = TS.decode(q);
      if ((this.ids[c] || []).length) b.categories = this.ids[c];
      return b;
    },
    async search(q, c) { return this.parse(await TS.postJson('https://api.knaben.org/v1', this.body(q, c, 'seeders'))); },
    async latest(c) { return this.parse(await TS.postJson('https://api.knaben.org/v1', this.body(null, c, 'date'))); },
    async top(c) { return this.parse(await TS.postJson('https://api.knaben.org/v1', this.body(null, c, 'seeders'))); },
    parse(j) {
      return ((j && j.hits) || []).map((o) => {
        if (!o.title || !o.magnetUrl) return null;
        const f = Math.min(...(o.categoryId || []).map(Number).filter(isFinite));
        const cat = !isFinite(f) ? 'All' : f < 2e6 ? 'Music' : f < 3e6 ? 'Series' : f < 4e6 ? 'Movies' : f < 5e6 ? 'Apps' : f < 6e6 ? 'Porn' :
          f < 7e6 ? 'Anime' : f < 8e6 ? 'Games' : f >= 9e6 && f < 1e7 ? 'Books' : f >= 1e7 && f < 11e6 ? 'Other' : 'All';
        return T({ id: tid(this.id, o.id || infoHash(o.magnetUrl)), name: o.title, size: TS.formatBytes(o.bytes), seeders: o.seeders, peers: o.peers,
          provider: this.name, date: TS.iso(o.date), category: cat, details: o.details, magnet: o.magnetUrl });
      }).filter(Boolean);
    } });

  // ---------------- LimeTorrents ----------------
  const limeCat = (r) => ({ TV: 'Series', Movie: 'Movies', Music: 'Music', App: 'Apps', 'E-book': 'Books', Anime: 'Anime', Games: 'Games' }[r] || 'Other');
  add({ id: 'limetorrents', name: 'LimeTorrents', url: 'https://limetorrents.fun', cats: ['Anime', 'Apps', 'Games', 'Movies', 'Music', 'Series', 'Other'],
    unsafe: 'Não é inseguro de fato, mas ignora a categoria escolhida. Escolha com cuidado.',
    s: { All: 'all', Books: 'all', Porn: 'all', Anime: 'anime', Apps: 'applications', Games: 'games', Movies: 'movies', Music: 'music', Series: 'tv', Other: 'other' },
    b: { Anime: 'Anime', Apps: 'Applications', Books: 'Other-E-books', Games: 'Games', Movies: 'Movies', Music: 'Music', Series: 'TV-shows', Other: 'Other' },
    async search(q, c) { const u = `${this.url}/search/${this.s[c]}/${q}/date/1/`; return this.parse(await doc(u), u, null); },
    async latest(c) { if (!this.b[c] || !this.cats.includes(c)) return []; const u = `${this.url}/browse-torrents/${this.b[c]}/`; return this.parse(await doc(u), u, c); },
    async top(c) { if (!this.b[c] || !this.cats.includes(c)) return []; const u = `${this.url}/cat_top/16/${this.b[c]}/`; return this.parse(await doc(u), u, c); },
    parse(d, base, sc) {
      const N = 'td:nth-child(1) > div.tt-name > a:nth-child(2)';
      return $$(d, '.table2 > tbody > tr').map((li) => {
        const a = $(li, N); const dl = at($(li, 'td:nth-child(1) > div.tt-name > a:nth-child(1)'), 'href');
        if (!a || !dl) return null;
        const h = dl.replace('http://itorrents.net/torrent/', '').split('.')[0].toLowerCase();
        const t = own($(li, 'td:nth-child(2)')) || ''; let rd = t, rc = null;
        if (t.includes('- in')) { const i = t.indexOf('-'); rd = t.slice(0, i).trim(); rc = t.slice(i + 1).trim().replace(/^in /, '').replace(/\.$/, ''); }
        return T({ id: tid(this.id, h), name: own(a), size: own($(li, 'td:nth-child(3)')), seeders: uintL(own($(li, 'td.tdseed'))), peers: uintL(own($(li, 'td.tdleech'))),
          provider: this.name, date: TS.relative(rd), category: rc ? limeCat(rc) : sc, details: abs(a, 'href', base), magnet: magnet(h), file: dl });
      }).filter(Boolean);
    } });

  // ---------------- LinuxTracker ----------------
  add({ id: 'linuxtracker', name: 'LinuxTracker', url: 'https://linuxtracker.org', cats: ['Apps'],
    async search(q) { const u = `${this.url}/index.php?page=torrents&search=${q}&category=0&active=0`; return this.parse(await doc(u), u); },
    async latest() { const u = `${this.url}/torrents/`; return this.parse(await doc(u), u); },
    async top() { return this.latest(); },
    async getMagnet(u) { return TS.firstMagnet(u); },
    parse(d, base) {
      return $$(d, 'table.torrent-table > tbody > tr').map((li) => {
        const a = $(li, 'td.torrent-name-cell > a.torrent-name'); const det = abs(a, 'href', base);
        if (!det) return null;
        return T({ id: tid(this.id, TS.lastSeg(det.replace(/\/$/, ''))), name: own(a), size: own($(li, 'td:nth-child(4)')),
          seeders: uint(own($(li, 'td.seeds > strong'))), peers: uint(own($(li, 'td.leeches > strong'))), provider: this.name,
          date: TS.parseDate(own($(li, 'td:nth-child(3)')), 'MMM d, yyyy'), category: 'Apps', details: det, fetch: det });
      }).filter(Boolean);
    } });

  // ---------------- MegaPeer ----------------
  add({ id: 'megapeer', name: 'MegaPeer', url: 'https://megapeer.vip', cats: ['Apps', 'Books', 'Games', 'Movies', 'Music', 'Other', 'Series'],
    map: { All: 0, Apps: 29, Books: 52, Games: 28, Movies: 80, Music: 94, Other: 59, Series: 6 },
    async search(q, c) { const u = `${this.url}/browse.php?search=${q}&age=&cat=${this.map[c] ?? 0}&stype=0&sort=0&ascdesc=0`; return this.parse(await doc(u), u); },
    async latest() { return this.parse(await doc(this.url), this.url); },
    async top() { const u = `${this.url}/top`; return this.parse(await doc(u), u); },
    async getMagnet(u) { return TS.firstMagnet(u, 'a[href^="magnet:?xt="]'); },
    parse(d, base) {
      return $$(d, 'div#index > table > tbody > tr.table_fon').map((li) => {
        const a = $(li, 'td:nth-child(2) > a:nth-child(2)'); const det = abs(a, 'href', base);
        if (!det) return null;
        return T({ id: tid(this.id, det), name: own(a), size: own($(li, 'td:nth-child(3)')), seeders: uint(own($(li, 'td:nth-child(4) > font:nth-child(2)'))),
          peers: uint(own($(li, 'td:nth-child(4) > font:nth-child(4)'))), provider: this.name,
          date: TS.parseDate(TS.ruMonth(own($(li, 'td:nth-child(1)'))), 'd MMM yy'), details: det, fetch: det,
          file: abs($(li, 'td:nth-child(2) > a:nth-child(1)'), 'href', base) });
      }).filter(Boolean);
    } });

  // ---------------- Mikan ----------------
  add({ id: 'mikanproject', name: 'Mikan', url: 'https://mikanani.me', cats: ['Anime'],
    async search(q) {
      const u = `${this.url}/Home/Search?searchstr=${q}`; const d = await doc(u);
      return $$(d, 'tr.js-search-results-row').map((li) => {
        const a = $(li, 'td:nth-child(2) > a:nth-child(1)'); const mg = at($(li, 'td:nth-child(2) > a[data-clipboard-text]'), 'data-clipboard-text'); const h = infoHash(mg);
        if (!a || !h) return null;
        return T({ id: tid(this.id, h), name: own(a), size: TS.normalizeSize(own($(li, 'td:nth-child(3)'))), provider: this.name,
          date: TS.parseDate(own($(li, 'td:nth-child(4)')), 'yyyy/MM/dd HH:mm'), category: 'Anime', details: abs(a, 'href', u), magnet: mg,
          file: abs($(li, 'td:nth-child(5) > a'), 'href', u) });
      }).filter(Boolean);
    } });

  // ---------------- MyPornClub ----------------
  add({ id: 'mypornclub', name: 'MyPornClub', url: 'https://myporn.club', cats: ['Porn'],
    async search(q) { const u = `${this.url}/s/${q.trim().replace(/%20/g, '-')}/seeders`; return this.parse(await doc(u), u); },
    async latest() { const u = `${this.url}/ts/latest/alltime`; return this.parse(await doc(u), u); },
    async top() { const u = `${this.url}/ts/hits/alltime`; return this.parse(await doc(u), u); },
    async getMagnet(u) { return TS.firstMagnet(u, 'a.md_btn'); },
    parse(d, base) {
      return $$(d, 'div.torrents_list > div.torrent_element').map((li) => {
        const det = abs($(li, 'div.torrent_element_text_div > a:nth-child(2)'), 'href', base);
        const n = own($(li, 'div.torrent_element_text_div > a:nth-child(2) > span.torrent_element_text_span'));
        if (!det || !n) return null;
        return T({ id: tid(this.id, TS.lastSeg(det.split('?')[0])), name: n, size: (own($(li, 'div.torrent_element_info > span.teiv:nth-child(4)')) || '').toUpperCase() || null,
          seeders: uint(own($(li, 'div.torrent_element_info > span.teiv.teiv_seeders'))), peers: uint(own($(li, 'div.torrent_element_info > span.teiv.teiv_leechers'))),
          provider: this.name, date: TS.relative(txt($(li, 'div.torrent_element_info > span.teiv:nth-child(2)'))), category: 'Porn', details: det, fetch: det });
      }).filter(Boolean);
    } });

  // ---------------- NekoBT ----------------
  add({ id: 'nekobt', name: 'NekoBT', url: 'https://nekobt.to', cats: ['Anime'],
    async search(q) { const u = `${this.url}/search?query=${q}`; return this.parse(await doc(u), u); },
    async latest() { const u = `${this.url}/search?sort-by=latest`; return this.parse(await doc(u), u); },
    async top() { const u = `${this.url}/search?sort-by=seeders`; return this.parse(await doc(u), u); },
    parse(d, base) {
      const N = 'td:nth-child(3) > div:nth-child(1) > div > a';
      return $$(d, 'table.table > tbody > tr').map((li) => {
        const n = own($($(li, N), 'span > span:nth-child(1)')); const mg = nonBlank(at($(li, 'td:nth-child(4) > div > a:nth-child(1)'), 'href'));
        if (!n || !mg) return null;
        const det = abs($(li, N), 'href', base);
        return T({ id: tid(this.id, nonBlank(TS.lastSeg(det)) || infoHash(mg) || mg), name: n, size: own($(li, 'td:nth-child(5) > span')),
          seeders: uint(own($(li, 'td:nth-child(7) > span'))), peers: uint(own($(li, 'td:nth-child(8) > span'))), provider: this.name,
          date: TS.parseDate(own($(li, 'td:nth-child(6) > span')), 'yyyy-MM-dd HH:mm:ss'), category: 'Anime', details: det, magnet: mg,
          file: abs($(li, 'td:nth-child(4) > div > a:nth-child(2)'), 'href', base) });
      }).filter(Boolean);
    } });

  // ---------------- NoNameClub ----------------
  const NNM = {};
  [['Other', '48 925 872'],
   ['Series', '724 725 729 731 1345 733 1346 1329 1330 1331 1332 1340 658 890 1336 1337 1338 1339 660 232 734 742 735 738 967 907 739 1109 736 737 898 935 871 973 960 1239 740 741 1219 1221 1220 722 768 1344 779 1288 787 1141 777 786 776 785 775 1265 1242 1140 782 773 1142 772 771 783 1144 804 1290 1300 784 774 922 770 1320 780 781 1322 769 799 800 791 793 794 796 795 713 706 577 894 578 580 579 953 581 806 714 761 809 924 812 576 590 591 588 589 598 652 599 959 956 597 593 594 819 595 587 584 586 585 600 596 1295 614 603 1308 1309 1206 1194 1062 974 609 1263 951 975 608 607 606 750 605 604 950 610 613 612 653 654 611 656 437 466 1319 463 958 1223 467 464 465 1348 469'],
   ['Apps', '503 504 506 763 1335 1241 1023 717 509 508 510 1254 1042 511 916 512 561 1284 562 513 514 515 516 517 518 519 520 521 522 523 524 532 533 535 530 529 525 526 527 545 764 765 820 552 553 554 550 549 548'],
   ['Movies', '216 270 218 219 954 217 1293 1298 318 320 677 1177 319 678 885 908 1310 909 910 911 912 220 221 222 882 889 224 225 226 227 1296 891 1299 682 694 884 1211 693 913 228 1150 1311 1313 1312 256 257 258 883 955 905 271 1210 264 265 272 1262 266 1294'],
   ['Anime', '615 616 617 648 619 620 623 622 621 632 624 627 626 625 644 628 635 634 638 646 645 639 640'],
   ['Books', '432 755 481 557 442 441 875 1176 444 443 440 1199 433 447 445 817 818 434 1349 957 931 1152 455 453 1063 452 451 449 1153 1347 482 483 484 1343 438 485 473 472 471 895 470 896 480 439 477 476 475 474 886 478 486 490 657 489 488 487 1198 1227 893 491 767 299 887 301 1334 300 1341 492 558 1173 1174 1171 662 1175 1172 933 815 1170 398 816'],
   ['Music', '313 1291 680 1149 429 681 330 1256 1285 370 1260 371 1261 375 1259 374 1257 373 1258 372 1160 876 1255 376 326 1352 359 358 1353 1188 1189 328 1370 1180 1181 364 363 1179 879 322 1350 962 333 1356 965 336 1362 337 338 1351 963 334 1357 961 332 325 1354 1355 1165 1166 1168 1167 1162 352 1164 1163 1161 353 324 1327 1328 1325 1326 1365 1366 1323 1324 976 346 1363 977 345 349 1243 347 979 673 671 1224 1225 1367 980 672 1316 1317 1364 981 344 1368 983 984 982 348 674 323 1369 1187 339 1186 340 1185 341 329 1361 369 368 1218 365 1217 366 1215 1216 1213 367 331 1358 1157 711 1159 378 1359 1158 379 380 1178 1360 361 360 327 1184 824 1182 354 877 1183 1190 917 1096 1097 1095'],
   ['Games', '410 411 412 1008 415 746 428 1009 413 414 1010 1012 1014 416 1013 1015 268 1016 1041 1018 1017 972 971 970 969 968 1146 418 1061 1060 1059 1058 1057 1056 1054 1053 1052 1051 1050 1049 1048 1047 1046 1045 1044 382 390 387 388 1264 1318 385 386 848 1321 383 384 1292 389 391 417 1193 1192'],
  ].forEach(([c, ids]) => ids.split(' ').forEach((i) => { NNM[i] = c; }));
  add({ id: 'nonameclub', name: 'NoNameClub', url: 'https://nnmclub.to', cats: ['Anime', 'Apps', 'Books', 'Games', 'Movies', 'Music', 'Series', 'Other'],
    map: { Anime: 615, Apps: 512, Books: 434, Games: 410, Movies: 216, Music: 313, Series: 768, Other: 48 },
    async search(q, c) { return this.run(TS.decode(q), c, 2, -1); },
    async latest(c) { return this.run(null, c, 1, 1); },
    async top(c) { return this.run(null, c, 10, -1); },
    async getMagnet(u) { return TS.firstMagnet(u, 'a[href^="magnet:?xt="]'); },
    async run(q, c, o, tm) {
      const u = `${this.url}/forum/tracker.php`;
      const html = await TS.submitForm(u, [['f[]', String(this.map[c] ?? -1)], ['o', String(o)], ['s', '2'], ['tm', String(tm)], ['shf', '1'], ['ta', '-1'], ['sns', '-1'], ['sds', '4'], ['nm', q || ''], ['submit', 'Поиск']]);
      const d = parseHtml(html, u);
      return $$(d, 'table.forumline.tablesorter > tbody > tr').filter((tr) => $(tr, 'a[href^="viewtopic.php?t="]') && $(tr, 'a[href^="download.php?id="]')).map((li) => {
        const det = abs($(li, 'a[href^="viewtopic.php?t="]'), 'href', u); const n = own($(li, 'a[href^="viewtopic.php?t="] > b'));
        if (!det || !n) return null;
        const cid = (at($(li, 'a[href^="tracker.php?f="]'), 'href') || '').replace('tracker.php?f=', '').split('&')[0];
        return T({ id: tid(this.id, nonBlank(TS.lastSeg(det, '=')) || det), name: n, size: TS.formatBytes(own($(li, 'td:nth-child(6) > u'))),
          seeders: uint(own($(li, 'td.seedmed > b'))), peers: uint(own($(li, 'td.leechmed > b'))), provider: this.name,
          date: TS.epoch(own($(li, 'td:last-child > u'))), category: cid ? (NNM[cid] || 'Other') : null, details: det, fetch: det,
          file: abs($(li, 'a[href^="download.php?id="]'), 'href', u) });
      }).filter(Boolean);
    } });

  // ---------------- Nyaa / Sukebei ----------------
  const nyaaCat = (id) => (/^1_/.test(id) ? 'Anime' : /^2_/.test(id) ? 'Music' : /^3_/.test(id) ? 'Books' : /^4_/.test(id) ? 'Series' :
    ['6_0', '6_1'].includes(id) ? 'Apps' : id === '6_2' ? 'Games' : 'Other');
  function nyaaParse(p, d, base, fixed) {
    return $$(d, 'table.torrent-list > tbody > tr').map((li) => {
      const a = $(li, 'td:nth-child(2) > a:not(.comments)'); const mg = at($(li, 'td:nth-child(3) > a:nth-child(2)'), 'href'); const h = infoHash(mg);
      if (!a || !h) return null;
      const det = nonBlank(abs(a, 'href', base));
      const cat = fixed || nyaaCat((at($(li, 'td:nth-child(1) > a'), 'href') || '').replace('/?c=', ''));
      return T({ id: tid(p.id, det ? TS.lastSeg(det) : h), name: own(a), size: own($(li, 'td:nth-child(4)')), seeders: uint(own($(li, 'td:nth-child(6)'))),
        peers: uint(own($(li, 'td:nth-child(7)'))), provider: p.name, date: TS.epoch(nonBlank(at($(li, 'td:nth-child(5)'), 'data-timestamp'))),
        category: cat, details: det, magnet: mg, file: abs($(li, 'td:nth-child(3) > a:nth-child(1)'), 'href', base) });
    }).filter(Boolean);
  }
  add({ id: 'nyaasi', name: 'Nyaa', url: 'https://nyaa.si', cats: ['Anime', 'Apps', 'Books', 'Games', 'Music', 'Series'], def: true,
    map: { All: '0_0', Anime: '1_0', Apps: '6_1', Books: '3_0', Games: '6_2', Music: '2_0', Series: '4_0' },
    async search(q, c) { const u = `${this.url}/?f=0&c=${this.map[c] || '0_0'}&q=${q}`; return nyaaParse(this, await doc(u), u); },
    async latest(c) { const u = `${this.url}?c=${this.map[c] || '0_0'}`; return nyaaParse(this, await doc(u), u); },
    async top(c) { const u = `${this.url}?s=seeders&o=desc&c=${this.map[c] || '0_0'}`; return nyaaParse(this, await doc(u), u); } });
  add({ id: 'sukebeinyaa', name: 'Sukebei', url: 'https://sukebei.nyaa.si', cats: ['Porn'],
    async search(q) { const u = `${this.url}/?f=0&c=0_0&q=${q}`; return nyaaParse(this, await doc(u), u, 'Porn'); },
    async latest() { return nyaaParse(this, await doc(this.url), this.url, 'Porn'); },
    async top() { const u = `${this.url}/?s=seeders&o=desc`; return nyaaParse(this, await doc(u), u, 'Porn'); } });

  // ---------------- OxTorrent (Cloudflare) ----------------
  const oxCat = (r) => ({ ebook: 'Books', films: 'Movies', 'jeux-consoles': 'Games', 'jeux-pc': 'Games', logiciels: 'Apps', musique: 'Music', series: 'Series' }[r] || 'Other');
  function frParse(p, d, base) {
    return $$(d, 'table > tbody > tr').map((li) => {
      const a = $(li, 'td:nth-child(1) > a'); const det = abs(a, 'href', base);
      if (!det || !own(a)) return null;
      const cls = $(li, 'td:nth-child(1) > i')?.className;
      return T({ id: tid(p.id, det), name: p.id === 'torrent9' ? txt(a) : own(a), size: own($(li, 'td:nth-child(2)')), seeders: uint(own($(li, 'td:nth-child(3)'))),
        peers: uint(own($(li, 'td:nth-child(4)'))), provider: p.name, category: cls ? oxCat(cls) : null, details: det, fetch: det });
    }).filter(Boolean);
  }
  add({ id: 'oxtorrent', name: 'OxTorrent', url: 'https://oxtorrent.co', cats: ['Apps', 'Books', 'Games', 'Movies', 'Music', 'Series'], cf: true,
    map: { Apps: 'logiciels', Books: 'ebook', Games: 'jeux-pc', Movies: 'films', Music: 'musique', Series: 'series' },
    async search(q, c) { let u = `${this.url}/recherche`; if (this.map[c]) u += `/${this.map[c]}`; u += `/${q}`; return frParse(this, await doc(u), u); },
    async latest(c) { if (!this.map[c]) return []; const u = `${this.url}/torrents/${this.map[c]}`; return frParse(this, await doc(u), u); },
    async top() { const u = `${this.url}/top`; return frParse(this, await doc(u), u); },
    async getMagnet(u) { return TS.firstMagnet(u, 'div.btn-magnet > a'); } });

  // ---------------- Rutor ----------------
  add({ id: 'rutorinfo', name: 'Rutor', url: 'https://rutor.info', cats: ['Anime', 'Apps', 'Books', 'Games', 'Movies', 'Music', 'Other', 'Series'],
    map: { All: 0, Anime: 10, Apps: 9, Books: 11, Games: 8, Movies: 1, Music: 2, Other: 3, Series: 4 },
    async search(q, c) { const u = `${this.url}/search/0/${this.map[c] ?? 0}/010/2/${q}`; return this.parse(await doc(u), u, c); },
    async latest(c) { const u = `${this.url}/browse/0/${this.map[c] ?? 0}/0/0`; return this.parse(await doc(u), u, c); },
    async top(c) { const u = `${this.url}/top`; return this.parse(await doc(u), u, c); },
    parse(d, base, c) {
      const seen = new Set();
      return $$(d, 'div#index > table > tbody > tr').slice(1).map((li) => {
        const a = $(li, 'td:nth-child(2) > a:nth-child(3)'); const mg = at($(li, 'td:nth-child(2) > a:nth-child(2)'), 'href'); const h = infoHash(mg);
        if (!a || !h || seen.has(h)) return null;
        seen.add(h);
        return T({ id: tid(this.id, h), name: own(a), size: (own($(li, 'td:nth-last-child(2)')) || '').replace(/ /g, ' ') || null,
          seeders: uint(own($(li, 'td:nth-last-child(1) > span:nth-child(1)'))), peers: uint(own($(li, 'td:nth-last-child(1) > span:nth-child(3)'))),
          provider: this.name, date: TS.parseDate(TS.ruMonth(own($(li, 'td:nth-child(1)'))), 'dd MMM yy'), category: c === 'All' ? null : c,
          details: abs(a, 'href', base), magnet: mg, file: abs($(li, 'td:nth-child(2) > a:nth-child(1)'), 'href', base) });
      }).filter(Boolean);
    } });

  // ---------------- SubsPlease ----------------
  add({ id: 'subsplease', name: 'SubsPlease', url: 'https://subsplease.org', cats: ['Anime'],
    async search(q) { return this.parse(await TS.getJson(`${this.url}/api?f=search&tz=$&s=${q}`)); },
    async latest() { return this.parse(await TS.getJson(`${this.url}/api/?f=latest&tz=$`)); },
    parse(j) {
      if (!j || typeof j !== 'object' || Array.isArray(j)) return [];
      return Object.keys(j).sort().flatMap((show) => {
        const a = j[show] || {}; const date = TS.iso(a.release_date); const page = a.page ? `${this.url}/${a.page}` : null;
        return (a.downloads || []).map((d) => {
          const h = infoHash(d.magnet); if (!h) return null;
          const xl = (d.magnet.split('?')[1] || '').split('&').find((x) => x.startsWith('xl='));
          return T({ id: tid(this.id, h), name: `${show} [${d.res}p]`, size: xl ? TS.formatBytes(xl.slice(3)) : null, provider: this.name, date,
            category: 'Anime', details: page ? `${page}?ep=${a.episode}&res=${d.res}` : null, magnet: d.magnet });
        }).filter(Boolean);
      });
    } });

  // ---------------- ThePirateBay ----------------
  const tpbCat = (id) => ((id >= 300 && id <= 306) || id === 399 ? 'Apps' : id === 601 ? 'Books' : (id >= 400 && id <= 408) || id === 499 ? 'Games' :
    [201, 202, 204, 207, 209, 210, 211].includes(id) ? 'Movies' : (id >= 100 && id <= 104) || id === 199 ? 'Music' :
    (id >= 500 && id <= 507) || id === 599 ? 'Porn' : [205, 208, 212].includes(id) ? 'Series' : 'Other');
  add({ id: 'thepiratebay', name: 'ThePirateBay', url: 'https://thepiratebay.org', cats: ['Apps', 'Books', 'Games', 'Movies', 'Music', 'Porn', 'Series', 'Other'],
    unsafe: 'Muitos relatos de malware por falta de moderação.',
    cid: { All: 0, Anime: 0, Apps: 300, Books: 601, Games: 400, Movies: 200, Series: 200, Music: 101, Porn: 500, Other: 600 },
    async search(q, c) { return this.parse(await TS.getJson(`https://apibay.org/q.php?q=${q}&cat=${this.cid[c]}`)); },
    async latest(c) { return this.parse(await TS.getJson(c === 'All' ? 'https://apibay.org/precompiled/data_top100_recent.json' : `https://apibay.org/q.php?q=category%3A${this.cid[c]}`)); },
    async top(c) { return this.parse(await TS.getJson(c === 'All' ? 'https://apibay.org/precompiled/data_top100_48h.json' : `https://apibay.org/precompiled/data_top100_48h_${this.cid[c]}.json`)); },
    parse(j) {
      return (Array.isArray(j) ? j : []).map((o) => {
        if (!o.name || o.name === 'No results returned' || !o.info_hash || !o.id) return null;
        return T({ id: tid(this.id, String(o.id)), name: o.name, size: TS.formatBytes(o.size), seeders: uint(o.seeders), peers: uint(o.leechers), provider: this.name,
          date: TS.epoch(o.added), category: tpbCat(+o.category), details: `${this.url}/description.php?id=${o.id}`, magnet: magnet(o.info_hash.toLowerCase().trim()) });
      }).filter(Boolean);
    } });

  // ---------------- TheRarBg ----------------
  const rarCat = (r) => ({ Anime: 'Anime', Apps: 'Apps', Books: 'Books', Games: 'Games', Movies: 'Movies', Music: 'Music', XXX: 'Porn', Tv: 'Series' }[r] || 'Other');
  add({ id: 'therarbag', name: 'TheRarBg', url: 'https://therarbg.com', cats: ALL9,
    unsafe: 'Clone do RARBG original com muitos torrents falsos. Use com extremo cuidado.',
    n: { All: '', Anime: 'Anime', Apps: 'Apps', Books: 'Books', Games: 'Games', Movies: 'Movies', Music: 'Music', Porn: 'XXX', Series: 'Tv', Other: 'Other' },
    async search(q, c) { let u = `${this.url}/get-posts/keywords:${q}`; if (c !== 'All') u += `:category:${this.n[c]}`; return this.parse(await doc(u), u); },
    async latest(c) { let u = `${this.url}/get-posts/time:2D`; if (c !== 'All') u += `:category:${this.n[c]}`; return this.parse(await doc(u), u); },
    async top(c) { let u = `${this.url}/get-posts/time:2D:order:-se`; if (c !== 'All') u += `:category:${this.n[c]}`; return this.parse(await doc(u), u); },
    async getMagnet(u) { return TS.firstMagnet(u); },
    parse(d, base) {
      return $$(d, 'table > tbody > tr.list-entry').map((li) => {
        const a = $(li, 'td.cellName > div > a'); const det = abs(a, 'href', base);
        if (!det || !own(a)) return null;
        const cat = own($(li, 'td:nth-child(3) > a'));
        return T({ id: tid(this.id, det), name: own(a), size: TS.formatBytes(at($(li, 'td.sizeCell'), 'data-order')), seeders: uint(own($(li, 'td:nth-child(7)'))),
          peers: uint(own($(li, 'td:nth-child(8)'))), provider: this.name, date: TS.epoch(nonBlank(at($(li, 'td:nth-child(4)'), 'data-order'))),
          category: cat ? rarCat(cat) : null, details: det, fetch: det });
      }).filter(Boolean);
    } });

  // ---------------- 1337x (Cloudflare) ----------------
  const x1337Cat = (id) => (['28', '78', '79', '80', '81'].includes(id) ? 'Anime' : ['22', '23', '24', '25', '26', '27', '53', '58', '59', '60', '68', '69'].includes(id) ? 'Music' :
    ['1', '2', '3', '4', '42', '54', '55', '66', '70', '73', '76'].includes(id) ? 'Movies' : ['5', '6', '7', '41', '71', '74', '75', '9'].includes(id) ? 'Series' :
    ['18', '19', '20', '21', '56', '57'].includes(id) ? 'Apps' : ['10', '11', '12', '13', '14', '15', '16', '17', '43', '44', '45', '46', '72', '77', '82'].includes(id) ? 'Games' :
    ['48', '49', '50', '51', '67'].includes(id) ? 'Porn' : 'Other');
  add({ id: '1337x', name: '1337x', url: 'https://1337x.to', cats: ['Anime', 'Apps', 'Games', 'Movies', 'Music', 'Other', 'Porn', 'Series'], cf: true,
    map: { Anime: 'Anime', Apps: 'Apps', Games: 'Games', Movies: 'Movies', Music: 'Music', Other: 'Other', Porn: 'XXX', Series: 'TV' },
    async search(q, c) { const u = c === 'All' ? `${this.url}/search/${q}/1/` : `${this.url}/category-search/${q}/${this.map[c] || 'Other'}/1/`; return this.parse(await doc(u), u); },
    async top() { const u = `${this.url}/top-100`; return this.parse(await doc(u), u); },
    async getMagnet(u) { return TS.firstMagnet(u); },
    parse(d, base) {
      return $$(d, 'table.table-list > tbody > tr').map((li) => {
        const a = $(li, 'td.name > a:nth-child(2)'); const det = abs(a, 'href', base);
        if (!det || !own(a)) return null;
        let ds = (own($(li, 'td.coll-date')) || '').replace(/(\d+)(st|nd|rd|th)/g, '$1').replace(/(\d)(am|pm)\b/g, '$1 $2').replace(/[.']/g, '');
        const cid = (at($(li, 'td.name > a:nth-child(1)'), 'href') || '').replace('/sub/', '').split('/')[0];
        return T({ id: tid(this.id, det), name: own(a), size: (own($(li, 'td.size')) || '').replace(/,/g, '') || null, seeders: uint(own($(li, 'td.seeds'))),
          peers: uint(own($(li, 'td.leeches'))), provider: this.name,
          date: TS.parseDate(ds, 'MMM d yy') || TS.parseDate(`${ds} ${new Date().getUTCFullYear()}`, 'h a MMM d yyyy'),
          category: cid ? x1337Cat(cid) : null, details: det, fetch: det });
      }).filter(Boolean);
    } });

  // ---------------- TokyoToshokan (Cloudflare) ----------------
  const tokyoCat = (id) => (['1', '7', '8', '10', '11'].includes(id) ? 'Anime' : id === '3' ? 'Books' : ['2', '9'].includes(id) ? 'Music' :
    ['4', '12', '13', '14', '15'].includes(id) ? 'Porn' : 'Other');
  add({ id: 'tokyotoshokan', name: 'TokyoToshokan', url: 'https://tokyotosho.info', cats: ['Anime', 'Books', 'Music', 'Porn', 'Other'], cf: true, def: true,
    map: { All: 0, Anime: 1, Books: 3, Music: 2, Porn: 15, Other: 5 },
    async search(q, c) { const u = `${this.url}/search.php?terms=${q}&type=${this.map[c] ?? 0}&searchName=true`; return this.parse(await doc(u), u); },
    async latest(c) { let u = `${this.url}/index.php`; if (c !== 'All' && this.map[c] != null) u += `?cat=${this.map[c]}`; return this.parse(await doc(u), u); },
    async top(c) { return this.latest(c); },
    parse(d, base) {
      const rows = $$(d, 'table.listing > tbody > tr:nth-child(n+2)'); const out = [];
      for (let i = 0; i < rows.length - 1; i++) {
        const t1 = rows[i], t2 = rows[i + 1];
        const ne = $(t1, 'td.desc-top > a:nth-child(2)'); const mg = at($(t1, 'td.desc-top > a:nth-child(1)'), 'href'); const h = infoHash(mg);
        if (!ne || !own(ne) || !h) continue;
        const parts = (own($(t2, 'td.desc-bot')) || '').split('|').slice(1).map((x) => x.trim().replace(/^\S+\s*/, '').trim());
        out.push(T({ id: tid(this.id, h), name: own(ne), size: TS.normalizeSize(parts[0] || null), seeders: uint(own($(t2, 'td.stats > span:nth-child(1)'))),
          peers: uint(own($(t2, 'td.stats > span:nth-child(2)'))), provider: this.name, date: TS.parseDate(parts[1], 'yyyy-MM-dd HH:mm z'),
          category: tokyoCat((at($(t1, 'td:nth-child(1) > a'), 'href') || '').replace('/?cat=', '')), details: abs($(t1, 'td.web > a:last-child'), 'href', base),
          magnet: mg, file: abs(ne, 'href', base) }));
      }
      return out;
    } });

  // ---------------- Torrent9 ----------------
  add({ id: 'torrent9', name: 'Torrent9', url: 'https://www6.torrent9.to', cats: ['Apps', 'Books', 'Games', 'Movies', 'Music', 'Series'],
    map: { Apps: 'logiciels', Books: 'ebook', Games: 'jeux-pc', Movies: 'films', Music: 'musique', Series: 'series' },
    async search(q, c) { let u = `${this.url}/search_torrent`; if (this.map[c]) u += `/${this.map[c]}`; u += `/${q}.html`; return this.parse(await doc(u), u); },
    async latest(c) { if (!this.map[c]) return []; const u = `${this.url}/torrents_${this.map[c]}.html`; return this.parse(await doc(u), u); },
    async top() { const u = `${this.url}/top_torrent.html`; return this.parse(await doc(u), u); },
    async getMagnet(u) { return TS.firstMagnet(u); },
    parse(d, base) {
      const icon = { 'fa-desktop': 'Series', 'fa-video-camera': 'Movies', 'fa-music': 'Music', 'fa-book': 'Books', 'fa-laptop': 'Apps', 'fa-gamepad': 'Games' };
      return $$(d, 'table > tbody > tr').map((li) => {
        const a = $(li, 'td:nth-child(1) > a'); const det = abs(a, 'href', base);
        if (!det) return null;
        const cls = Array.from($(li, 'td:nth-child(1) > i')?.classList || []).filter((x) => x !== 'fa').join(' ');
        return T({ id: tid(this.id, det), name: txt(a), size: TS.normalizeSize((own($(li, 'td:nth-child(3)')) || '').replace(/o/g, 'B')) || null,
          seeders: uint(own($(li, 'td:nth-child(4) > span.seed_ok'))), peers: uint(own($(li, 'td:nth-child(5)'))), provider: this.name,
          date: TS.parseDate(own($(li, 'td:nth-child(2)')), 'dd/MM/yyyy'), category: cls ? (icon[cls] || 'Other') : null, fetch: det });
      }).filter(Boolean);
    } });

  // ---------------- TorrentDatabase (Cloudflare) ----------------
  const tdbCat = (raw) => {
    const r = raw.toLowerCase();
    return ({ software: 'Apps', 'e-books': 'Books', ebooks: 'Books', audiobooks: 'Books', games: 'Games', movies: 'Movies', music: 'Music', porn: 'Porn', xxx: 'Porn', tv: 'Series' })[r] ||
      (raw.startsWith('games') ? 'Games' : raw.startsWith('movies') ? 'Movies' : raw.startsWith('music') ? 'Music' : raw.startsWith('software') ? 'Apps' : raw.startsWith('tv') ? 'Series' : 'Other');
  };
  add({ id: 'torrentdatabase', name: 'TorrentDatabase', url: 'https://developify.ca', cats: ['Apps', 'Books', 'Games', 'Movies', 'Music', 'Porn', 'Series'], cf: true,
    map: { Apps: 'software', Books: 'e-books', Games: 'games', Movies: 'movies', Music: 'music', Porn: 'porn', Series: 'tv' },
    slug(c) { const s = this.map[c]; return s ? (c === 'Books' ? s.replace('-', '') : s) : null; },
    async search(q, c) { let u = `${this.url}/search?q=${q}`; if (this.map[c]) u += `&category=${this.map[c]}`; return this.parse(await doc(u), u); },
    async latest(c) { let u = `${this.url}/newest`; if (c !== 'All' && this.slug(c)) u += `_${this.slug(c)}`; return this.parse(await doc(u), u); },
    async top(c) { if (c === 'All') return this.latest('All'); if (!this.slug(c)) return []; const u = `${this.url}/top_seeded_${this.slug(c)}`; return this.parse(await doc(u), u); },
    parse(d, base) {
      return $$(d, 'table.torrent-table > tbody > tr').map((li) => {
        const a = $(li, 'td:nth-child(1) > a:nth-child(2)'); if (!a) return null;
        const h = (at(a, 'href') || '').replace('/track/magnet/', '').split('?')[0]; if (!h) return null;
        const det = nonBlank(abs($(li, 'td:nth-child(1) > a:nth-child(1)'), 'href', base)); const cat = own($(li, 'td:nth-child(2) > span.category-bubble'));
        return T({ id: tid(this.id, det ? TS.lastSeg(det) : h), name: own(a), size: own($(li, 'td.size-cell')), seeders: uint(own($(li, 'td:nth-child(5) > div > span:nth-child(1)'))),
          peers: uint(own($(li, 'td:nth-child(5) > div > span:nth-child(3)'))), provider: this.name, date: TS.parseDate(own($(li, 'td.date-cell')), 'yyyy-MM-dd HH:mm:ss'),
          category: cat ? tdbCat(cat) : null, details: det, magnet: magnet(h) + '&tr=https%3A%2F%2Fdevelopify.ca%2Fannounce' });
      }).filter(Boolean);
    } });

  // ---------------- TorrentDownload ----------------
  const tdCat = (raw) => {
    const r = raw.replace(/[^A-Za-z]+/g, '');
    const m = { Porn: 'XXX XXXVideo XXXHDVideo XXXPictures Adult AdultPornHDVideo AdultPornPictures AdultPornVideo', Anime: 'Anime AnimeEnglishtranslated AnimeAnimeOther',
      Apps: 'Applications ApplicationsAndroid ApplicationsWindows Software',
      Books: 'BooksAcademic BooksComics BooksEbooks BooksEducational BooksMagazines BooksFiction BooksNonfiction BooksTextbooks Ebooks OtherEbooks OtherComics AudioBooks AudioAudiobooks',
      Games: 'Games GamesWindows', Movies: 'Movies MoviesAction MoviesConcerts MoviesCrime MoviesDocumentary MoviesDubbedMovies MoviesHighresMovies MoviesMusicvideos MoviesThriller VideoMovies',
      Music: 'Music MusicHardrock MusicMp MusicFLAC MusicLossless MusicRB MusicTranceHouseDance VideoMusic AudioMusic', Series: 'TV TVBBC TVshows Television' };
    return Object.keys(m).find((k) => m[k].split(' ').includes(r)) || 'Other';
  };
  add({ id: 'torrentdownloadinfo', name: 'TorrentDownload', url: 'https://torrentdownload.info', cats: ALL9,
    async search(q) { const u = `${this.url}/search?q=${q}`; return this.parse(await doc(u), u); },
    async latest() { const u = `${this.url}/latest`; return this.parse(await doc(u), u); },
    async top() { const u = `${this.url}/top`; return this.parse(await doc(u), u); },
    parse(d, base) {
      if (own($(d, 'h3')) === 'No Results Found') return [];
      return $$(d, 'table.table2 > tbody > tr').filter((tr) => $(tr, 'span.smallish')).map((li) => {
        const a = $(li, 'td:nth-child(1) > div.tt-name > a'); const det = abs(a, 'href', base);
        if (!det) return null;
        const h = TS.lastSeg(det.slice(0, det.lastIndexOf('/'))).trim().toLowerCase();
        const cat = own($(li, 'td:nth-child(1) > div.tt-name > span'));
        return T({ id: tid(this.id, h), name: txt(a), size: own($(li, 'td:nth-child(3)')), seeders: uintL(own($(li, 'td:nth-child(4)'))),
          peers: uintL(own($(li, 'td:nth-child(5)'))), provider: this.name, date: TS.relative(own($(li, 'td:nth-child(2)'))),
          category: cat ? tdCat(cat) : null, details: det, magnet: magnet(h) });
      }).filter(Boolean);
    } });

  // ---------------- TorrentDownloads (Cloudflare) ----------------
  add({ id: 'torrentdownloads', name: 'TorrentDownloads', url: 'https://torrentdownloads.pro', cats: ['Anime', 'Apps', 'Books', 'Games', 'Movies', 'Music', 'Series', 'Other'], cf: true, def: true,
    cid: { All: 0, Anime: 1, Apps: 7, Books: 2, Games: 3, Movies: 4, Music: 5, Series: 8, Porn: 9, Other: 9 },
    names: { Anime: 'Anime', Apps: 'Software', Books: 'Books', Games: 'Games', Movies: 'Movies', Music: 'Music', Series: 'TV_Shows', Other: 'Other' },
    async search(q, c) { const u = `${this.url}/search/?s_cat=${this.cid[c] ?? 0}&search=${q}`; return this.parse(await doc(u), u); },
    async latest(c) { const u = this.names[c] ? `${this.url}/view/today/${this.names[c]}.html` : `${this.url}/most-active`; return this.parse(await doc(u), u); },
    async top(c) { const u = this.names[c] ? `${this.url}/view/popular/${this.names[c]}.html` : `${this.url}/most-seeded`; return this.parse(await doc(u), u); },
    async getMagnet(u) { return TS.firstMagnet(u); },
    parse(d, base) {
      const cs = $$(d, 'div.inner_container'); const last = cs[cs.length - 1];
      const icons = { 'menu_icon0.png': 'All', 'menu_icon1.png': 'Anime', 'menu_icon2.png': 'Books', 'menu_icon3.png': 'Games', 'menu_icon4.png': 'Movies', 'menu_icon5.png': 'Music', 'menu_icon7.png': 'Apps', 'menu_icon8.png': 'Series' };
      return $$(last, 'div.grey_bar3').slice(2).map((li) => {
        const a = $(li, 'p:nth-child(1) > a:nth-child(2)'); const det = abs(a, 'href', base);
        if (!det || !own(a)) return null;
        const src = (at($(li, 'p:nth-child(1) > img:nth-child(1)'), 'src') || '').replace('/templates/new/images/icons/', '');
        return T({ id: tid(this.id, det), name: own(a), size: own($(li, 'span:nth-child(5)')), seeders: uint(own($(li, 'span:nth-child(4)'))),
          peers: uint(own($(li, 'span:nth-child(3)'))), provider: this.name, category: src ? (icons[src] || 'Other') : null, details: det, fetch: det });
      }).filter(Boolean);
    } });

  // ---------------- TorrentKitty ----------------
  add({ id: 'torrentkitty', name: 'TorrentKitty', url: 'https://torrentkitty.tv', cats: ['Other'],
    async search(q) {
      const u = `${this.url}/search/${q}`; const d = await doc(u);
      return $$(d, 'table#archiveResult > tbody > tr').slice(1).map((li) => {
        const n = own($(li, 'td.name')); const mg = at($(li, 'td.action > a:nth-child(2)'), 'href'); const h = infoHash(mg);
        if (!n || !h) return null;
        return T({ id: tid(this.id, h), name: n, size: (own($(li, 'td.size')) || '').toUpperCase() || null, provider: this.name,
          date: TS.parseDate(own($(li, 'td.date')), 'yyyy-MM-dd'), details: abs($(li, 'td.action > a:nth-child(1)'), 'href', u), magnet: mg,
          file: abs($(li, 'td.action > a:nth-child(3)'), 'href', u) });
      }).filter(Boolean);
    } });

  // ---------------- TorrentsCSV ----------------
  add({ id: 'torrentscsv', name: 'TorrentsCSV', url: 'https://torrents-csv.com', cats: ['Other'], def: true,
    async search(q) {
      const j = await TS.getJson(`${this.url}/service/search?q=${q}`);
      return ((j && j.torrents) || []).map((o) => {
        if (!o.name || !o.infohash || o.id == null) return null;
        return T({ id: tid(this.id, String(o.id)), name: o.name, size: TS.formatBytes(o.size_bytes), seeders: o.seeders, peers: o.leechers, provider: this.name,
          date: TS.epoch(o.created_unix), category: 'Other', magnet: magnet(o.infohash) });
      }).filter(Boolean);
    } });

  // ---------------- Torrentz ----------------
  add({ id: 'torrentz', name: 'Torrentz', url: 'https://torrentz2.nz', cats: ['Other', 'Movies', 'Series', 'Anime', 'Apps', 'Games', 'Music', 'Books', 'Porn'],
    map: { Other: 1, Movies: 2, Series: 3, Anime: 4, Apps: 5, Games: 6, Music: 7, Books: 9, Porn: 10 },
    async search(q, c) { let u = `${this.url}/search?q=${q}`; if (c !== 'All' && this.map[c]) u += `&category=${this.map[c]}`; return this.parse(await doc(u), u); },
    async latest(c) { let u = `${this.url}/latest`; if (c !== 'All' && this.map[c]) u += `?category=${this.map[c]}`; return this.parse(await doc(u), u); },
    async top(c) { let u = `${this.url}/trending`; if (c !== 'All' && this.map[c]) u += `?category=${this.map[c]}`; return this.parse(await doc(u), u); },
    async getMagnet(u) { return TS.firstMagnet(u, 'div.download a[href^="magnet:?"]'); },
    parse(d, base) {
      return $$(d, 'div.results > dl').map((li) => {
        const a = $(li, 'dt > a'); const det = abs(a, 'href', base);
        if (!det || !own(a)) return null;
        const raw = at($(li, 'dd > span.a > span'), 'title');
        let date = TS.iso(raw);
        if (!date && raw && raw.includes('(')) date = TS.parseDate(raw.slice(0, raw.lastIndexOf('(')).trim().replace(/\s+\S+$/, ''), 'E MMM dd yyyy HH:mm:ss');
        const rc = (own($(li, 'dt')) || '').replace(/^» /, '');
        const cat = rc.startsWith('Anime') ? 'Anime' : rc.startsWith('Softwares') ? 'Apps' : rc.startsWith('Music') ? 'Music' : rc.startsWith('Games') ? 'Games' :
          rc === 'Movies' ? 'Movies' : rc === 'TV' ? 'Series' : 'Other';
        return T({ id: tid(this.id, TS.lastSeg(det)), name: own(a), size: own($(li, 'dd > span.s')), seeders: uintL(own($(li, 'dd > span.u'))),
          peers: uintL(own($(li, 'dd > span.d'))), provider: this.name, date, category: cat, details: det, fetch: det });
      }).filter(Boolean);
    } });

  // ---------------- UIndex (Cloudflare) ----------------
  add({ id: 'uindex', name: 'UIndex', url: 'https://uindex.org', cats: ['Anime', 'Apps', 'Games', 'Movies', 'Music', 'Porn', 'Series', 'Other'], cf: true, def: true,
    map: { All: 0, Books: 0, Anime: 7, Apps: 5, Games: 3, Movies: 1, Music: 4, Porn: 6, Series: 2, Other: 8 },
    async search(q, c) { const u = `${this.url}/search.php?search=${q}&c=${this.map[c] ?? 0}`; return this.parse(await doc(u), u); },
    async latest(c) { const u = `${this.url}/search.php?c=${this.map[c] ?? 0}`; return this.parse(await doc(u), u); },
    async top(c) { const u = `${this.url}/top.php?t=24h&c=${this.map[c] ?? 0}`; return this.parse(await doc(u), u); },
    parse(d, base) {
      const cat = (r) => ({ Anime: 'Anime', Apps: 'Apps', Games: 'Games', Movies: 'Movies', Music: 'Music', XXX: 'Porn', TV: 'Series' }[r] || 'Other');
      return $$($(d, 'table.sr-table, table.top-table'), 'tbody > tr').map((li) => {
        const a = $(li, 'td.sr-col-name > a.sr-torrent-link'); const mg = nonBlank(at($(li, 'td.sr-col-name > a.sr-magnet'), 'href'));
        if (!a || !mg) return null;
        const det = nonBlank(abs(a, 'href', base)); const rc = own($(li, 'td.sr-col-cat > a.sr-cat-badge'));
        return T({ id: tid(this.id, det ? TS.lastSeg(det, '=') : infoHash(mg) || mg), name: txt(a), size: own($(li, 'td.sr-col-size')),
          seeders: uintL(own($(li, 'td.sr-col-seeders > span.sr-seed'))), peers: uintL(own($(li, 'td.sr-col-leechers > span.sr-leech'))), provider: this.name,
          date: TS.relative(own($(li, 'td.sr-col-uploaded'))), category: rc ? cat(rc) : null, details: det, magnet: mg });
      }).filter(Boolean);
    } });

  // ---------------- XXXClub ----------------
  add({ id: 'xxxclub', name: 'XXXClub', url: 'https://xxxclub.to', cats: ['Porn'],
    async search(q) { const u = `${this.url}/torrents/search/all/${q}`; return this.parse(await doc(u), u); },
    async latest() { const u = `${this.url}/torrents/browse/all`; return this.parse(await doc(u), u); },
    async top() { const u = `${this.url}/torrents/top100`; return this.parse(await doc(u), u); },
    async getMagnet(u) { return TS.firstMagnet(u); },
    parse(d, base) {
      return $$($(d, 'div.browsetableinside, div.divtableinside'), 'ul > li').map((li) => {
        const a = $(li, 'span:nth-child(2) > a[href^="/torrents/details"]'); const det = abs(a, 'href', base);
        if (!det) return null;
        return T({ id: tid(this.id, det), name: txt(a), size: own($(li, 'span.siz')), seeders: uint(own($(li, 'span.see'))), peers: uint(own($(li, 'span.lee'))),
          provider: this.name, date: TS.parseDate(own($(li, 'span.adde')), 'dd MMM yyyy HH:mm:ss'), category: 'Porn', details: det, fetch: det });
      }).filter(Boolean);
    } });

  // ---------------- XXXTracker ----------------
  add({ id: 'xxxtracker', name: 'XXXTracker', url: 'https://xxxtor.com', cats: ['Porn'],
    async search(q) { const u = `${this.url}/b.php?search=${q}`; return this.parse(await doc(u), u); },
    async latest() { const u = `${this.url}/b.php`; return this.parse(await doc(u), u); },
    async top() { const u = `${this.url}/top`; return this.parse(await doc(u), u); },
    parse(d, base) {
      return $$(d, 'table > tbody > tr').slice(1).map((li) => {
        const a = $(li, 'td:nth-child(2) > a:nth-child(3)'); const mg = at($(li, 'td:nth-child(2) > a:nth-child(1)'), 'href'); const h = infoHash(mg);
        if (!a || !h) return null;
        return T({ id: tid(this.id, h), name: own(a), size: own($(li, 'td:nth-last-child(2)')), seeders: uint(own($(li, 'td:nth-last-child(1) > span.green'))),
          peers: uint(own($(li, 'td:nth-last-child(1) > span.red'))), provider: this.name, date: TS.parseDate(TS.ruMonth(own($(li, 'td:nth-child(1)'))), 'dd MMM yy'),
          category: 'Porn', details: abs(a, 'href', base), magnet: mg, file: abs($(li, 'td:nth-child(2) > a:nth-child(2)'), 'href', base) });
      }).filter(Boolean);
    } });

  // ---------------- YTS ----------------
  add({ id: 'ytsmx', name: 'Yts', url: 'https://yts.bz', cats: ['Movies'], def: true,
    async search(q) { return this.parse(await TS.getJson(`https://movies-api.accel.li/api/v2/list_movies.json?query_term=${q}&limit=50`)); },
    async latest() { return this.parse(await TS.getJson('https://movies-api.accel.li/api/v2/list_movies.json')); },
    async top() { return this.latest(); },
    parse(j) {
      return ((j && j.data && j.data.movies) || []).flatMap((m) => {
        if (m.id == null || !m.title_long) return [];
        return (m.torrents || []).map((t) => {
          const h = (t.hash || '').toLowerCase(); if (!h) return null;
          return T({ id: tid(this.id, h), name: `${m.title_long} [${t.quality || '-'}] [${t.type || '-'}] [${t.video_codec || '-'}]`, size: t.size, seeders: t.seeds,
            peers: t.peers, provider: this.name, date: TS.epoch(t.date_uploaded_unix), category: 'Movies',
            details: m.url ? `${m.url}?movieid=${m.id}&infohash=${h}` : null, magnet: magnet(h) });
        }).filter(Boolean);
      });
    } });

  // ---------------- 0Magnet ----------------
  add({ id: '0magnet', name: '0Magnet', url: 'https://9mag.net', cats: ['Porn'],
    async search(q) {
      const u = `${this.url}/search?q=${q}`; const d = await doc(u);
      return $$(d, 'table.file-list > tbody > tr').map((li) => {
        const n = txt($(li, 'td.result-title > a')); const det = abs($(li, 'td:nth-child(1) > a'), 'href', u);
        if (!n || !det) return null;
        return T({ id: tid(this.id, det), name: n, size: TS.normalizeSize(own($(li, 'td.result-meta > div:nth-child(1)'))), provider: this.name,
          date: TS.parseDate(own($(li, 'td.result-meta > div.result-date')), 'yyyy-MM-dd'), category: 'Porn', details: det, fetch: det });
      }).filter(Boolean);
    },
    async getMagnet(u) { return TS.firstMagnet(u, 'input#input-magnet', 'value'); } });

  // ---------------- Execução em paralelo ----------------
  /** Busca em todos os buscadores e chama onUpdate a cada buscador concluído. */
  TS.runAll = async (providers, fn, onUpdate, signal, limit) => {
    const acc = { torrents: [], errors: [], done: 0, total: providers.length };
    onUpdate && onUpdate(acc);
    await Promise.all(providers.map(async (p) => {
      try {
        const list = await fn(p);
        if (signal && signal.aborted) return;
        acc.torrents.push(...(list || []));
      } catch (e) {
        if (signal && signal.aborted) return;
        acc.errors.push({ id: p.id, name: p.name, cloudflare: !!e.cloudflare, message: e.message || String(e) });
      }
      acc.done++;
      if (limit && acc.torrents.length > limit) acc.torrents.length = limit;
      onUpdate && onUpdate(acc);
    }));
    return acc;
  };
})(typeof window !== 'undefined' ? window : globalThis);
