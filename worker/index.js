// Worker do Torrent Search Web.
// Serve a página (pasta web/) e faz as requisições aos buscadores no lugar do navegador
// (o Safari bloqueia leitura de outros sites por CORS).
// Segurança: só aceita os domínios dos buscadores; não grava logs nem dados.

const ALLOWED = [
  'anilibria.top', 'anirena.com', 'animetosho.org', 'audiobookbay.lu', 'btdig.com', 'bangumi.moe', 'bitsearch.to',
  'blueroms.ws', 'bt4gprx.com', 'btsow.live', 'share.dmhy.org', 'epublibre.org', 'ext.to', 'eztvx.to', 'filemood.com',
  'fitgirl-repacks.site', 'archive.org', 'knaben.org', 'limetorrents.fun', 'linuxtracker.org', 'megapeer.vip',
  'mikanani.me', 'myporn.club', 'nekobt.to', 'nnmclub.to', 'nyaa.si', 'oxtorrent.co', 'rutor.info', 'subsplease.org',
  'apibay.org', 'thepiratebay.org', 'therarbg.com', '1337x.to', 'tokyotosho.info', 'torrent9.to', 'developify.ca',
  'torrentdownload.info', 'torrentdownloads.pro', 'torrentkitty.tv', 'torrents-csv.com', 'torrentz2.nz', 'uindex.org',
  'xxxclub.to', 'xxxtor.com', 'movies-api.accel.li', '9mag.net', 'itorrents.net',
];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

function allowed(u) {
  try {
    const url = new URL(u);
    if (!['https:', 'http:'].includes(url.protocol)) return false;
    return ALLOWED.some((d) => url.hostname === d || url.hostname.endsWith('.' + d));
  } catch { return false; }
}

function decode(buf, contentType) {
  let cs = (/charset=([^;]+)/i.exec(contentType || '') || [])[1];
  if (!cs) {
    const head = new TextDecoder('latin1').decode(buf.slice(0, 2048));
    cs = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || [])[1];
  }
  try { return new TextDecoder((cs || 'utf-8').trim().toLowerCase()).decode(buf); } catch { return new TextDecoder().decode(buf); }
}

const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

async function proxy(request) {
  // Só aceita chamadas da própria página.
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return new Response('forbidden', { status: 403 });
  let req;
  try { req = await request.json(); } catch { return new Response('bad request', { status: 400 }); }
  if (!req || !allowed(req.url)) return new Response(JSON.stringify({ error: 'domínio não permitido' }), { status: 400, headers: SEC });
  const headers = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' };
  for (const [k, v] of Object.entries(req.headers || {})) {
    if (['content-type', 'x-requested-with', 'cookie', 'accept'].includes(k.toLowerCase())) headers[k] = String(v);
  }
  let res;
  try {
    res = await fetch(req.url, {
      method: req.method === 'POST' ? 'POST' : 'GET', headers,
      body: req.method === 'POST' ? (req.body ?? undefined) : undefined,
      redirect: req.redirect === 'manual' ? 'manual' : 'follow',
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 502, headers: { ...SEC, 'Content-Type': 'application/json' } });
  }
  const buf = await res.arrayBuffer();
  const out = {
    status: res.status,
    headers: { location: res.headers.get('location'), 'cf-mitigated': res.headers.get('cf-mitigated'), 'content-type': res.headers.get('content-type') },
    body: decode(buf, res.headers.get('content-type')),
  };
  return new Response(JSON.stringify(out), { headers: { ...SEC, 'Content-Type': 'application/json; charset=utf-8' } });
}

async function file(request) {
  const u = new URL(request.url).searchParams.get('u');
  const name = (new URL(request.url).searchParams.get('n') || 'arquivo').replace(/[^\w .()[\]-]+/g, '_').slice(0, 100);
  if (!u || !allowed(u)) return new Response('domínio não permitido', { status: 400 });
  const res = await fetch(u, { headers: { 'User-Agent': UA } });
  if (!res.ok) return new Response('não encontrado', { status: 404 });
  return new Response(res.body, { headers: { ...SEC, 'Content-Type': 'application/x-bittorrent', 'Content-Disposition': `attachment; filename="${name}.torrent"` } });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/p' && request.method === 'POST') return proxy(request);
    if (path === '/f') return file(request);
    const res = await env.ASSETS.fetch(request);
    const h = new Headers(res.headers);
    h.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
    h.set('X-Content-Type-Options', 'nosniff');
    h.set('Referrer-Policy', 'no-referrer');
    return new Response(res.body, { status: res.status, headers: h });
  },
};
