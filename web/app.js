// Interface da versão web do Torrent Search.
(function () {
  'use strict';
  const TS = window.TS;

  // ---------- Armazenamento local (só neste navegador) ----------
  const ls = {
    get(k, d) { try { const v = localStorage.getItem('ts.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ts.' + k, JSON.stringify(v)); } catch (e) { /* armazenamento indisponível */ } },
  };
  const S = {
    lang: ls.get('lang', (navigator.language || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en'),
    theme: ls.get('theme', 'system'),
    nsfw: ls.get('nsfw', false),
    sort: ls.get('sort', { c: 'seeders', o: 'desc' }),
    max: ls.get('max', 0),
    saveHistory: ls.get('saveHistory', true),
    showRecent: ls.get('showRecent', true),
    enabled: ls.get('enabled', null),
    bookmarks: ls.get('bookmarks', []),
    history: ls.get('history', []),
    viewed: ls.get('viewed', []),
  };
  const save = (k) => ls.set(k, S[k]);

  // ---------- Tradução ----------
  function t(k, ...a) {
    let s = S.lang === 'en' ? (window.TS_EN[k] || k) : k;
    a.forEach((v) => { s = s.replace(/%ld|%@/, String(v)); });
    return s;
  }
  const CAT = { All: 'Todas', Anime: 'Anime', Apps: 'Apps', Books: 'Livros', Games: 'Jogos', Movies: 'Filmes', Music: 'Música', Porn: 'Adulto', Series: 'Séries', Other: 'Outros' };
  const catName = (c) => t(CAT[c] || c);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Transporte (via Worker /p) ----------
  TS.transport = async (r) => {
    const res = await fetch('/p', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) });
    const j = await res.json().catch(() => null);
    if (!j || j.error) throw new Error(j && j.error ? j.error : `HTTP ${res.status}`);
    return { status: j.status, text: j.body || '', headers: j.headers || {} };
  };

  // ---------- Elementos ----------
  const $ = (s) => document.querySelector(s);
  const main = $('#main'), title = $('#title'), back = $('#back'), topActions = $('#top-actions');
  const sheet = $('#sheet'), sheetCard = $('#sheet-card');
  let toastTimer;
  function toast(m) { const el = $('#toast'); el.textContent = m; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 2200); }
  function applyTheme() { document.documentElement.dataset.theme = S.theme === 'system' ? '' : S.theme; if (S.theme === 'system') delete document.documentElement.dataset.theme; }
  applyTheme();

  // ---------- Buscadores ----------
  const isNSFWProv = (p) => p.cats.includes('Porn') || !!p.unsafe;
  const enabledProviders = (c = 'All') => TS.providers.filter((p) => (S.enabled || []).includes(p.id)).filter((p) => c === 'All' || p.cats.includes(c));
  const visibleCats = () => TS.CATEGORIES.filter((c) => S.nsfw || c !== 'Porn');
  function setEnabled(id, on) { const s = new Set(S.enabled || []); on ? s.add(id) : s.delete(id); S.enabled = [...s]; save('enabled'); }

  // ---------- Estado de navegação ----------
  let tab = 'search', stack = [], current = null, abort = null, refreshHook = null;

  function setTab(name) {
    tab = name; stack = [];
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    ({ search: viewHome, browse: viewBrowse, bookmarks: viewBookmarks, settings: viewSettings })[name]();
  }
  function push(render) { stack.push(current); render(); }
  function goBack() { if (abort) abort.abort(); const prev = stack.pop(); if (prev) prev(); }
  function frame(name, html, render, actions = '') {
    current = render;
    refreshHook = null;
    title.textContent = name;
    back.hidden = stack.length === 0;
    topActions.innerHTML = actions;
    main.innerHTML = html;
    window.scrollTo(0, 0);
  }
  back.addEventListener('click', goBack);
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.textContent); });

  // ---------- Componentes ----------
  const chips = (sel, attr) => `<div class="chips">${visibleCats().map((c) => `<button class="chip" data-${attr}="${c}" aria-pressed="${c === sel}">${esc(catName(c))}</button>`).join('')}</div>`;
  function when(ts) {
    if (!ts) return '';
    const d = Date.now() - ts, day = 86400000;
    if (d < 3600000) return `${Math.max(1, Math.round(d / 60000))} min`;
    if (d < day) return `${Math.round(d / 3600000)} h`;
    if (d < 30 * day) return `${Math.round(d / day)} d`;
    return new Date(ts).toLocaleDateString(S.lang === 'en' ? 'en-US' : 'pt-BR');
  }
  function row(tor) {
    const viewed = S.viewed.includes(tor.id), bm = S.bookmarks.some((b) => b.id === tor.id);
    const dead = tor.seeders === 0 && tor.peers === 0;
    return `<button class="row ${viewed ? 'viewed' : ''}" data-tid="${esc(tor.id)}">
      <div class="name">${esc(tor.name)}</div>
      <div class="meta">${tor.size ? `<span>💾 ${esc(tor.size)}</span>` : ''}${tor.seeders != null ? `<span class="se">▲ ${tor.seeders}</span>` : ''}${tor.peers != null ? `<span class="pe">▼ ${tor.peers}</span>` : ''}${tor.date ? `<span>📅 ${esc(when(tor.date))}</span>` : ''}</div>
      <div class="tags"><span class="tag prov">${esc(tor.provider)}</span>${tor.category && tor.category !== 'All' ? `<span class="tag">${esc(catName(tor.category))}</span>` : ''}${tor.category === 'Porn' ? '<span class="tag red">NSFW</span>' : ''}${dead ? `<span class="tag red">${esc(t('Sem fontes'))}</span>` : ''}${bm ? '<span class="tag">★</span>' : ''}</div>
    </button>`;
  }
  function sortList(list, s) {
    const key = { name: (x) => x.name.toLowerCase(), seeders: (x) => x.seeders, peers: (x) => x.peers, size: (x) => (x.size ? TS.getBytes(x.size) : null), date: (x) => x.date }[s.c] || ((x) => x.seeders);
    const dir = s.o === 'asc' ? 1 : -1;
    return list.map((x, i) => [x, i]).sort((a, b) => {
      const va = key(a[0]), vb = key(b[0]);
      if (va == null && vb == null) return a[1] - b[1];
      if (va == null) return -dir; if (vb == null) return dir;
      return va < vb ? -dir : va > vb ? dir : a[1] - b[1];
    }).map((x) => x[0]);
  }
  const matches = (tor, q) => { const w = q.split(' ').filter((x) => x.trim()); return !w.length || w.some((x) => tor.name.toLowerCase().includes(x.toLowerCase())); };
  const sortSelect = (s, id) => `<select id="${id}" aria-label="${esc(t('Ordenar por'))}">
    ${[['seeders', 'Seeders'], ['peers', 'Peers'], ['size', 'Tamanho'], ['date', 'Data'], ['name', 'Nome']].map(([v, l]) => `<option value="${v}" ${s.c === v ? 'selected' : ''}>${esc(t(l))}</option>`).join('')}
  </select><select id="${id}-o" aria-label="${esc(t('Ordem'))}"><option value="desc" ${s.o === 'desc' ? 'selected' : ''}>${esc(t('Decrescente'))}</option><option value="asc" ${s.o === 'asc' ? 'selected' : ''}>${esc(t('Crescente'))}</option></select>`;

  // ---------- Início ----------
  let homeCat = 'All';
  function viewHome() {
    if (!S.nsfw && homeCat === 'Porn') homeCat = 'All';
    const recent = S.showRecent ? S.history.slice(0, 5) : [];
    frame('Torrent Search', `
      <div class="hero"><img src="/icon-180.png" alt=""><h2>Torrent Search</h2><p>${esc(t('Busca em vários sites ao mesmo tempo, sem anúncios e sem rastreamento.'))}</p></div>
      <form id="sf" class="searchbox" role="search"><input id="q" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(t('Buscar…'))}" aria-label="${esc(t('Buscar'))}"><button class="btn primary small" type="submit">${esc(t('Buscar'))}</button></form>
      ${chips(homeCat, 'hc')}
      <p id="msg" class="muted center"></p>
      ${recent.length ? `<div class="section-title">${esc(t('Buscas recentes'))}</div><div class="chips">${recent.map((h) => `<button class="chip" data-recent="${esc(h.q)}">${esc(h.q)}</button>`).join('')}</div>` : ''}
      <p class="muted center">${esc(t('%ld de %ld buscadores ativos', enabledProviders().length, TS.providers.length))}</p>
      ${!navigator.standalone ? `<p class="muted center">📲 ${esc(t('Instalar na tela de início'))}: ${esc(t('No Safari, toque em Compartilhar → Adicionar à Tela de Início.'))}</p>` : ''}
    `, viewHome);
    main.querySelectorAll('[data-hc]').forEach((b) => b.addEventListener('click', () => { homeCat = b.dataset.hc; viewHome(); }));
    main.querySelectorAll('[data-recent]').forEach((b) => b.addEventListener('click', () => startSearch(b.dataset.recent, homeCat)));
    $('#sf').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#q').value.trim(); if (!q) { $('#msg').textContent = t('Digite algo para buscar'); return; } if (/^https?:\/\//i.test(q)) { $('#msg').textContent = t('Não é possível buscar usando uma URL'); return; } $('#q').blur(); startSearch(q, homeCat); });
    if (S.enabled === null) askDefaults();
  }

  function askDefaults() {
    openSheet(`<div class="grabber"></div><h3>${esc(t('Ativar buscadores'))}</h3><p>${esc(t('Nenhum buscador está ativo ainda. Quer ativar os recomendados?'))}</p>
      <div class="actions"><button class="btn primary" id="d-yes">${esc(t('Ativar recomendados'))}</button><button class="btn" id="d-no">${esc(t('Vou escolher'))}</button></div>`);
    $('#d-yes').onclick = () => { S.enabled = TS.providers.filter((p) => p.def && !p.cf).map((p) => p.id); save('enabled'); closeSheet(); viewHome(); };
    $('#d-no').onclick = () => { S.enabled = []; save('enabled'); closeSheet(); viewHome(); };
  }

  // ---------- Busca ----------
  function startSearch(q, cat) {
    if (S.saveHistory) {
      S.history = [{ q, d: Date.now() }, ...S.history.filter((h) => h.q.toLowerCase() !== q.toLowerCase())].slice(0, 300);
      save('history');
    }
    push(() => viewResults(q, cat));
  }

  function viewResults(q, cat) {
    if (abort) abort.abort();
    abort = new AbortController();
    const signal = abort.signal;
    const st = { acc: { torrents: [], errors: [], done: 0, total: 0 }, filter: '', showDead: true, hideViewed: false, sort: { ...S.sort }, excluded: new Set(), catFilter: 'All' };
    const render = () => {
      const a = st.acc;
      let list = a.torrents.filter((x) => S.nsfw || x.category !== 'Porn');
      if (!st.showDead) list = list.filter((x) => !(x.seeders === 0 && x.peers === 0));
      if (st.hideViewed) list = list.filter((x) => !S.viewed.includes(x.id));
      if (st.excluded.size) list = list.filter((x) => !st.excluded.has(x.provider));
      if (st.catFilter !== 'All') list = list.filter((x) => x.category === st.catFilter);
      if (st.filter.trim()) list = list.filter((x) => matches(x, st.filter));
      list = sortList(list, st.sort);
      const busy = a.done < a.total;
      const res = main.querySelector('#res');
      main.querySelector('#prog').innerHTML = busy ? `<div class="progress"><div style="width:${a.total ? (a.done / a.total) * 100 : 0}%"></div></div><p class="muted">${a.done}/${a.total} — ${esc(t('buscando…'))}</p>` : '';
      main.querySelector('#errs').innerHTML = a.errors.length ? `<button class="btn small" id="showerr">⚠️ ${esc(t('Ver erros'))} (${a.errors.length})</button>` : '';
      const eb = main.querySelector('#showerr'); if (eb) eb.onclick = () => showErrors(a.errors);
      res.innerHTML = list.length ? `<div class="section-title">${esc(t('%ld resultados para “%@”', list.length, q))}</div><div class="list">${list.map(row).join('')}</div>`
        : busy ? '' : (enabledProviders(cat).length ? `<div class="empty"><div class="big">🗂️</div><h3>${esc(t('Nenhum resultado'))}</h3><p>${esc(t('Nenhum torrent encontrado para “%@”. Tente outro termo ou ative mais buscadores.', q))}</p></div>`
        : `<div class="empty"><div class="big">🔎</div><h3>${esc(t('Nenhum buscador ativo'))}</h3><p>${esc(t('Ative buscadores na aba Ajustes → Buscadores.'))}</p></div>`);
      res.querySelectorAll('[data-tid]').forEach((b) => b.addEventListener('click', () => openTorrent(list.find((x) => x.id === b.dataset.tid))));
    };
    frame(q, `
      <input class="filter" id="flt" type="search" placeholder="${esc(t('Filtrar resultados'))}" aria-label="${esc(t('Filtrar resultados'))}">
      <div class="toolbar">${sortSelect(st.sort, 'srt')}
        <button class="chip" id="dead" aria-pressed="true">${esc(t('Sem fontes'))}</button>
        <button class="chip" id="hv" aria-pressed="false">${esc(t('Ocultar vistos'))}</button>
        <button class="chip" id="pf">${esc(t('Buscadores'))}</button>
        ${cat === 'All' ? `<select id="cf" aria-label="${esc(t('Categoria'))}">${visibleCats().map((c) => `<option value="${c}">${esc(catName(c))}</option>`).join('')}</select>` : ''}
        <span id="errs"></span></div>
      <div id="prog"></div><div id="res"></div>`, () => viewResults(q, cat),
      `<button class="icon-btn small" id="refresh" aria-label="${esc(t('Atualizar'))}">↻</button>`);
    refreshHook = render;
    $('#refresh').onclick = () => viewResults(q, cat);
    $('#flt').addEventListener('input', (e) => { st.filter = e.target.value; render(); });
    $('#srt').addEventListener('change', (e) => { st.sort.c = e.target.value; render(); });
    $('#srt-o').addEventListener('change', (e) => { st.sort.o = e.target.value; render(); });
    $('#dead').onclick = (e) => { st.showDead = !st.showDead; e.target.setAttribute('aria-pressed', String(st.showDead)); render(); };
    $('#hv').onclick = (e) => { st.hideViewed = !st.hideViewed; e.target.setAttribute('aria-pressed', String(st.hideViewed)); render(); };
    const cfSel = $('#cf'); if (cfSel) cfSel.addEventListener('change', (e) => { st.catFilter = e.target.value; render(); });
    $('#pf').onclick = () => providerFilter([...new Set(st.acc.torrents.map((x) => x.provider))].sort(), st.excluded, render);
    const providers = enabledProviders(cat);
    const enc = TS.encode(q);
    TS.runAll(providers, (p) => p.search(enc, cat), (a) => { if (!signal.aborted) { st.acc = { ...a, torrents: a.torrents.slice() }; render(); } }, signal, S.max || 0);
  }

  function showErrors(errs) {
    openSheet(`<div class="grabber"></div><h3>${esc(t('Buscadores com falha'))}</h3><div class="list">${errs.map((e) => `<div class="err"><b>${esc(e.name)}</b><span class="k ${e.cloudflare ? 'cf' : ''}">${esc(e.cloudflare ? t('Só no app (Cloudflare)') : t('Falhou'))}</span><div class="muted">${esc(e.message)}</div></div>`).join('')}</div>
      <p class="muted">${esc(t('Buscadores com Cloudflare costumam ser bloqueados na versão web. Use o app para eles.'))}</p>
      <div class="actions"><button class="btn primary" data-close>${esc(t('OK'))}</button></div>`);
  }

  function providerFilter(all, excluded, onChange) {
    const draw = () => {
      openSheet(`<div class="grabber"></div><h3>${esc(t('Filtrar por buscador'))}</h3><div class="list">${all.map((n) => `<div class="setting"><span class="lbl">${esc(n)}</span><label class="switch"><input type="checkbox" data-pn="${esc(n)}" ${excluded.has(n) ? '' : 'checked'}><span></span></label></div>`).join('')}</div>
        <div class="toolbar" style="margin-top:10px"><button class="btn small" id="pa">${esc(t('Todos'))}</button><button class="btn small" id="pn">${esc(t('Nenhum'))}</button><button class="btn small" id="pi">${esc(t('Inverter'))}</button><button class="btn small primary" data-close>${esc(t('OK'))}</button></div>`);
      sheetCard.querySelectorAll('[data-pn]').forEach((i) => i.addEventListener('change', () => { i.checked ? excluded.delete(i.dataset.pn) : excluded.add(i.dataset.pn); onChange(); }));
      $('#pa').onclick = () => { excluded.clear(); onChange(); draw(); };
      $('#pn').onclick = () => { all.forEach((n) => excluded.add(n)); onChange(); draw(); };
      $('#pi').onclick = () => { all.forEach((n) => (excluded.has(n) ? excluded.delete(n) : excluded.add(n))); onChange(); draw(); };
    };
    draw();
  }

  // ---------- Ações do torrent ----------
  function openTorrent(tor) {
    if (!tor) return;
    if (!S.viewed.includes(tor.id)) { S.viewed.push(tor.id); if (S.viewed.length > 3000) S.viewed.shift(); save('viewed'); }
    let mag = tor.magnet;
    const draw = (state, err) => {
      const bm = S.bookmarks.some((b) => b.id === tor.id);
      const h = mag ? TS.infoHash(mag) : null;
      const kv = (k, v) => (v != null && v !== '' ? `<div class="kv"><span>${esc(t(k))}</span><span>${esc(v)}</span></div>` : '');
      openSheet(`<div class="grabber"></div>
        <h3 style="word-break:break-word">${esc(tor.name)}</h3>
        <div class="list">${kv('Tamanho', tor.size)}${kv('Seeders', tor.seeders)}${kv('Peers', tor.peers)}${kv('Data de envio', tor.date ? new Date(tor.date).toLocaleDateString(S.lang === 'en' ? 'en-US' : 'pt-BR') : null)}${kv('Buscador', tor.provider)}${kv('Categoria', tor.category ? catName(tor.category) : null)}${kv('Info hash', h)}</div>
        <div class="section-title">${esc(t('Link magnet'))}</div>
        <div class="actions">${state === 'loading' ? `<p class="muted">${esc(t('Obtendo o link…'))}</p>` : state === 'error' ? `<p class="muted" style="color:var(--danger)">${esc(t('Não foi possível obter o link'))}: ${esc(err)}</p><button class="btn" id="retry">${esc(t('Tentar de novo'))}</button>` :
          `<a class="btn primary" href="${esc(mag)}" id="open">${esc(t('Abrir no app de torrent'))}</a><button class="btn" id="copy">📋 ${esc(t('Copiar link magnet'))}</button>${navigator.share ? `<button class="btn" id="share">📤 ${esc(t('Compartilhar link magnet'))}</button>` : ''}`}</div>
        <div class="section-title">${esc(t('Arquivo torrent'))}</div>
        <div class="actions">${tor.file || h ? `<a class="btn" href="/f?u=${encodeURIComponent(tor.file || `https://itorrents.net/torrent/${h.toUpperCase()}.torrent`)}&n=${encodeURIComponent(tor.name.slice(0, 80))}">⬇️ ${esc(t('Baixar arquivo .torrent'))}</a>` : `<p class="muted">${esc(t('Obtendo o link…'))}</p>`}</div>
        ${tor.details ? `<div class="section-title">${esc(t('Página de detalhes'))}</div><div class="actions"><a class="btn" href="${esc(tor.details)}" target="_blank" rel="noopener noreferrer">🌐 ${esc(t('Abrir no navegador'))}</a><button class="btn" id="copyp">🔗 ${esc(t('Copiar link da página'))}</button></div>` : ''}
        <div class="actions" style="margin-top:14px"><button class="btn" id="bm">${bm ? '☆ ' + esc(t('Remover dos favoritos')) : '★ ' + esc(t('Adicionar aos favoritos'))}</button><button class="btn" data-close>${esc(t('Fechar'))}</button></div>`);
      const g = (id) => sheetCard.querySelector('#' + id);
      if (g('copy')) g('copy').onclick = () => copy(mag, t('Link magnet copiado!'));
      if (g('share')) g('share').onclick = () => navigator.share({ text: mag }).catch(() => {});
      if (g('copyp')) g('copyp').onclick = () => copy(tor.details, t('Link copiado!'));
      if (g('retry')) g('retry').onclick = load;
      g('bm').onclick = () => { toggleBookmark(tor); draw(mag ? 'ready' : state, err); };
    };
    const load = async () => {
      if (mag) return draw('ready');
      draw('loading');
      const p = TS.providers.find((x) => x.name === tor.provider);
      try {
        if (!p || !p.getMagnet) throw new Error(t('Buscador não encontrado'));
        mag = await p.getMagnet(tor.fetch);
        if (sheet.hidden) return;
        draw('ready');
      } catch (e) { if (!sheet.hidden) draw('error', e.message); }
    };
    load();
  }
  async function copy(s, msg) { try { await navigator.clipboard.writeText(s); toast(msg); } catch (e) { prompt('', s); } }
  function toggleBookmark(tor) {
    if (S.bookmarks.some((b) => b.id === tor.id)) S.bookmarks = S.bookmarks.filter((b) => b.id !== tor.id);
    else S.bookmarks.unshift({ ...tor, addedAt: Date.now() });
    save('bookmarks');
  }

  // ---------- Folha (modal) ----------
  function openSheet(html) { sheetCard.innerHTML = html; sheet.hidden = false; sheetCard.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeSheet)); }
  function closeSheet() { sheet.hidden = true; sheetCard.innerHTML = ''; if (refreshHook) refreshHook(); }
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

  // ---------- Explorar ----------
  let browseMode = 'latest', browseCat = 'All', browseData = null;
  function viewBrowse() {
    if (!S.nsfw && browseCat === 'Porn') browseCat = 'All';
    frame(t('Explorar'), `
      <div class="toolbar"><button class="chip" data-bm="latest" aria-pressed="${browseMode === 'latest'}">${esc(t('Mais recentes'))}</button><button class="chip" data-bm="top" aria-pressed="${browseMode === 'top'}">${esc(t('Em alta'))}</button></div>
      ${chips(browseCat, 'bc')}
      <input class="filter" id="bflt" type="search" placeholder="${esc(t('Filtrar'))}">
      <div id="bprog"></div><div id="bres"></div>`, viewBrowse,
      `<button class="icon-btn small" id="brefresh" aria-label="${esc(t('Atualizar'))}">↻</button>`);
    main.querySelectorAll('[data-bm]').forEach((b) => b.onclick = () => { browseMode = b.dataset.bm; browseData = null; viewBrowse(); });
    main.querySelectorAll('[data-bc]').forEach((b) => b.onclick = () => { browseCat = b.dataset.bc; browseData = null; viewBrowse(); });
    $('#brefresh').onclick = () => { browseData = null; viewBrowse(); };
    let filter = '';
    const draw = () => {
      const a = browseData || { torrents: [], done: 0, total: 0 };
      const list = a.torrents.filter((x) => S.nsfw || x.category !== 'Porn').filter((x) => matches(x, filter));
      const busy = a.done < a.total;
      main.querySelector('#bprog').innerHTML = busy ? `<div class="progress"><div style="width:${(a.done / a.total) * 100}%"></div></div>` : '';
      main.querySelector('#bres').innerHTML = list.length ? `<div class="section-title">${esc(t('%ld torrents', list.length))}</div><div class="list">${list.map(row).join('')}</div>` :
        busy ? '' : `<div class="empty"><div class="big">✨</div><h3>${esc(t('Nada para mostrar'))}</h3><p>${esc(t('Os buscadores necessários podem estar desativados ou fora do ar.'))}</p></div>`;
      main.querySelectorAll('#bres [data-tid]').forEach((b) => b.onclick = () => openTorrent(list.find((x) => x.id === b.dataset.tid)));
    };
    $('#bflt').addEventListener('input', (e) => { filter = e.target.value; draw(); });
    refreshHook = draw;
    if (browseData) return draw();
    const fn = browseMode === 'latest' ? 'latest' : 'top';
    const providers = enabledProviders().filter((p) => p[fn] && (browseCat === 'All' || p.cats.includes(browseCat)));
    const mode = browseMode, cat = browseCat;
    TS.runAll(providers, (p) => p[fn](cat), (a) => { if (tab === 'browse' && mode === browseMode && cat === browseCat) { browseData = { ...a, torrents: a.torrents.slice() }; if (main.querySelector('#bres')) draw(); } });
  }

  // ---------- Favoritos ----------
  function viewBookmarks() {
    let filter = '';
    const bs = ls.get('bsort', { c: 'date', o: 'desc' });
    frame(t('Favoritos'), `
      <input class="filter" id="bkf" type="search" placeholder="${esc(t('Buscar nos favoritos'))}">
      <div class="toolbar">${sortSelect(bs, 'bks')}<button class="btn small" id="exp">${esc(t('Exportar favoritos'))}</button><label class="btn small">${esc(t('Importar favoritos'))}<input type="file" id="imp" accept="application/json,.json" hidden></label>${S.bookmarks.length ? `<button class="btn small danger" id="delall">${esc(t('Apagar todos'))}</button>` : ''}</div>
      <div id="bkl"></div>`, viewBookmarks);
    const draw = () => {
      const list = sortList(S.bookmarks.filter((x) => matches(x, filter)), bs.c === 'date' ? { c: 'date', o: bs.o } : bs);
      main.querySelector('#bkl').innerHTML = list.length ? `<div class="list">${list.map(row).join('')}</div>` :
        `<div class="empty"><div class="big">★</div><h3>${esc(S.bookmarks.length ? t('Nenhum favorito encontrado') : t('Nenhum favorito'))}</h3></div>`;
      main.querySelectorAll('#bkl [data-tid]').forEach((b) => b.onclick = () => openTorrent(list.find((x) => x.id === b.dataset.tid)));
    };
    $('#bkf').addEventListener('input', (e) => { filter = e.target.value; draw(); });
    refreshHook = draw;
    $('#bks').onchange = (e) => { bs.c = e.target.value; ls.set('bsort', bs); draw(); };
    $('#bks-o').onchange = (e) => { bs.o = e.target.value; ls.set('bsort', bs); draw(); };
    $('#exp').onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(S.bookmarks, null, 2)], { type: 'application/json' }));
      a.download = 'torrentsearch_favoritos.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    $('#imp').onchange = async (e) => {
      try {
        const arr = JSON.parse(await e.target.files[0].text());
        if (!Array.isArray(arr)) throw 0;
        const ids = new Set(S.bookmarks.map((b) => b.id));
        const add = arr.filter((b) => b && b.id && b.name && !ids.has(b.id));
        S.bookmarks.push(...add); save('bookmarks'); toast(t('%ld favoritos importados', add.length)); viewBookmarks();
      } catch (err) { toast(t('Arquivo inválido')); }
    };
    const del = $('#delall'); if (del) del.onclick = () => { if (confirm(t('Apagar todos os favoritos?'))) { S.bookmarks = []; save('bookmarks'); viewBookmarks(); } };
    draw();
  }

  // ---------- Ajustes ----------
  const sw = (id, on, label, hint = '') => `<div class="setting"><span class="lbl">${esc(t(label))}${hint ? `<small>${esc(t(hint))}</small>` : ''}</span><label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} aria-label="${esc(t(label))}"><span></span></label></div>`;
  function viewSettings() {
    frame(t('Ajustes'), `
      <div class="section-title">${esc(t('Aparência'))}</div>
      <div class="list">
        <div class="setting"><span class="lbl">${esc(t('Tema'))}</span><select id="theme" class="field"><option value="system">${esc(t('Seguir o sistema'))}</option><option value="light">${esc(t('Claro'))}</option><option value="dark">${esc(t('Escuro'))}</option></select></div>
        <div class="setting"><span class="lbl">${esc(t('Idioma'))}</span><select id="lang"><option value="pt">Português</option><option value="en">English</option></select></div>
      </div>
      <div class="section-title">${esc(t('Busca'))}</div>
      <div class="list">
        <button class="row" id="go-prov"><b>${esc(t('Buscadores'))}</b><div class="muted">${esc(t('%ld de %ld ativos', enabledProviders().length, TS.providers.length))}</div></button>
        <div class="setting"><span class="lbl">${esc(t('Ordenar resultados por'))}</span><span>${sortSelect(S.sort, 'dsort')}</span></div>
        <div class="setting"><span class="lbl">${esc(t('Número máximo de resultados'))}</span><select id="max"><option value="0">${esc(t('Ilimitado'))}</option>${[50, 100, 200, 500, 1000].map((n) => `<option value="${n}">${n}</option>`).join('')}</select></div>
      </div>
      <div class="section-title">${esc(t('Histórico'))}</div>
      <div class="list">${sw('sh', S.saveHistory, 'Salvar histórico de buscas')}${sw('sr', S.showRecent, 'Mostrar buscas recentes no início')}<button class="row" id="go-hist"><b>${esc(t('Histórico de buscas'))}</b></button></div>
      <div class="section-title">${esc(t('Conteúdo e privacidade'))}</div>
      <div class="list">${sw('nsfw', S.nsfw, 'Modo NSFW (conteúdo adulto)', 'Com o modo NSFW desligado, a categoria Adulto, os resultados adultos e os buscadores marcados como inseguros ficam ocultos.')}
        <div class="setting"><span class="lbl">${esc(t('Limpar torrents vistos'))}</span><button class="btn small" id="clrv">${esc(t('Limpar'))}</button></div></div>
      <div class="section-title">${esc(t('Privacidade'))}</div>
      <div class="list"><div class="setting"><span class="lbl">🛡️ ${esc(t('Sem anúncios, analytics ou rastreamento'))}</span></div>
        <div class="setting"><span class="lbl">🌐 ${esc(t('As buscas passam pelo seu Worker no Cloudflare, que só acessa os sites dos buscadores. Nada é gravado no servidor.'))}</span></div>
        <div class="setting"><span class="lbl">📱 ${esc(t('Dados ficam só neste navegador (armazenamento local).'))}</span></div>
        <div class="setting"><span class="lbl">${esc(t('Apagar todos os dados do app'))}</span><button class="btn small danger" id="erase">${esc(t('Apagar tudo'))}</button></div></div>
      <div class="section-title">${esc(t('Sobre'))}</div>
      <div class="list"><div class="setting"><span class="lbl">${esc(t('Versão web'))} 0.5.2</span></div>
        <div class="setting"><span class="lbl muted">${esc(t('Versão para iPhone baseada no TorrentSearch de Prajwal Chapagain (licença MIT).'))}</span></div></div>
    `, viewSettings);
    $('#theme').value = S.theme; $('#lang').value = S.lang; $('#max').value = String(S.max);
    $('#theme').onchange = (e) => { S.theme = e.target.value; save('theme'); applyTheme(); };
    $('#lang').onchange = (e) => { S.lang = e.target.value; save('lang'); location.reload(); };
    $('#max').onchange = (e) => { S.max = +e.target.value; save('max'); };
    $('#dsort').onchange = (e) => { S.sort.c = e.target.value; save('sort'); };
    $('#dsort-o').onchange = (e) => { S.sort.o = e.target.value; save('sort'); };
    $('#sh').onchange = (e) => { S.saveHistory = e.target.checked; save('saveHistory'); };
    $('#sr').onchange = (e) => { S.showRecent = e.target.checked; save('showRecent'); };
    $('#nsfw').onchange = (e) => {
      S.nsfw = e.target.checked; save('nsfw');
      if (!S.nsfw && S.enabled) { S.enabled = S.enabled.filter((id) => !isNSFWProv(TS.providers.find((p) => p.id === id) || { cats: [] })); save('enabled'); }
    };
    $('#clrv').onclick = () => { if (confirm(t('Limpar todos os torrents vistos?'))) { S.viewed = []; save('viewed'); toast('✓'); } };
    $('#erase').onclick = () => { if (confirm(t('Apagar todos os dados?'))) { try { Object.keys(localStorage).filter((k) => k.startsWith('ts.')).forEach((k) => localStorage.removeItem(k)); } catch (e) {} location.reload(); } };
    $('#go-prov').onclick = () => push(viewProviders);
    $('#go-hist').onclick = () => push(viewHistory);
  }

  function viewProviders() {
    let filter = '', cat = 'All';
    frame(t('Buscadores'), `
      <input class="filter" id="pfl" type="search" placeholder="${esc(t('Buscar buscadores'))}">
      <div id="pcat"></div>
      <div class="toolbar"><button class="btn small" id="pea">${esc(t('Ativar todos'))}</button><button class="btn small" id="pda">${esc(t('Desativar todos'))}</button><button class="btn small" id="prd">${esc(t('Restaurar padrão'))}</button></div>
      <p class="muted">⚠️ ${esc(t('Buscadores com Cloudflare costumam ser bloqueados na versão web. Use o app para eles.'))}</p>
      <div id="pl"></div>`, viewProviders);
    const shown = () => TS.providers.filter((p) => cat === 'All' || p.cats.includes(cat))
      .filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
    const draw = () => {
      main.querySelector('#pcat').innerHTML = chips(cat, 'pc');
      main.querySelectorAll('[data-pc]').forEach((b) => b.onclick = () => { cat = b.dataset.pc; draw(); });
      main.querySelector('#pl').innerHTML = `<div class="section-title">${esc(t('%ld de %ld ativos', enabledProviders().length, TS.providers.length))}</div><div class="list">${shown().map((p) => `
        <div class="setting"><span class="lbl"><b>${esc(p.name)}</b>${p.cf ? `<span class="badge cf">${esc(t('Só no app (Cloudflare)'))}</span>` : ''}${p.unsafe ? '<span class="badge unsafe">⚠︎</span>' : ''}
          <small>${esc(p.cats.map(catName).join(' · '))}</small>${p.unsafe ? `<small style="color:var(--danger)">${esc(t(p.unsafe))}</small>` : ''}</span>
          <label class="switch"><input type="checkbox" data-pid="${p.id}" ${(S.enabled || []).includes(p.id) ? 'checked' : ''} aria-label="${esc(p.name)}"><span></span></label></div>`).join('')}</div>`;
      main.querySelectorAll('[data-pid]').forEach((i) => i.onchange = () => { setEnabled(i.dataset.pid, i.checked); });
    };
    $('#pfl').addEventListener('input', (e) => { filter = e.target.value; draw(); });
    $('#pea').onclick = () => { S.enabled = [...new Set([...(S.enabled || []), ...shown().filter((p) => !p.cf).map((p) => p.id)])]; save('enabled'); draw(); };
    $('#pda').onclick = () => { const ids = new Set(shown().map((p) => p.id)); S.enabled = (S.enabled || []).filter((id) => !ids.has(id)); save('enabled'); draw(); };
    $('#prd').onclick = () => { S.enabled = TS.providers.filter((p) => p.def && !p.cf).map((p) => p.id); save('enabled'); draw(); };
    draw();
  }

  function viewHistory() {
    frame(t('Histórico de buscas'), `<div class="toolbar">${S.history.length ? `<button class="btn small danger" id="hclr">${esc(t('Limpar'))}</button>` : ''}</div><div id="hl"></div>`, viewHistory);
    const day = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const today = day(Date.now());
    const groups = {};
    S.history.forEach((h) => { (groups[day(h.d)] = groups[day(h.d)] || []).push(h); });
    main.querySelector('#hl').innerHTML = S.history.length ? Object.keys(groups).sort((a, b) => b - a).map((k) => {
      const label = +k === today ? t('Hoje') : +k === today - 86400000 ? t('Ontem') : new Date(+k).toLocaleDateString(S.lang === 'en' ? 'en-US' : 'pt-BR');
      return `<div class="section-title">${esc(label)}</div><div class="list">${groups[k].map((h) => `<div class="setting"><button class="row" style="border:0;padding:0" data-hq="${esc(h.q)}">${esc(h.q)}</button><button class="icon-btn small" data-hdel="${esc(h.q)}" aria-label="${esc(t('Apagar'))}">✕</button></div>`).join('')}</div>`;
    }).join('') : `<div class="empty"><div class="big">🕘</div><h3>${esc(t('Nenhuma busca no histórico'))}</h3></div>`;
    main.querySelectorAll('[data-hq]').forEach((b) => b.onclick = () => startSearch(b.dataset.hq, 'All'));
    main.querySelectorAll('[data-hdel]').forEach((b) => b.onclick = () => { S.history = S.history.filter((h) => h.q !== b.dataset.hdel); save('history'); viewHistory(); });
    const c = $('#hclr'); if (c) c.onclick = () => { if (confirm(t('Limpar o histórico de buscas?'))) { S.history = []; save('history'); viewHistory(); } };
  }

  document.documentElement.lang = S.lang === 'en' ? 'en' : 'pt-BR';
  setTab('search');
})();
