// Testa os buscadores da versão web (mesmo código do navegador) com jsdom + fetch direto.
import { JSDOM } from 'jsdom';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
globalThis.TS = {};
TS.parseHtml = (html, base) => new JSDOM(html, { url: base || 'https://example.org/' }).window.document;
TS.parseXml = (xml) => new JSDOM(xml, { contentType: 'text/xml' }).window.document;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
TS.transport = async (r) => {
  const res = await fetch(r.url, { method: r.method, headers: { 'User-Agent': UA, ...r.headers }, body: r.body || undefined, redirect: r.redirect, signal: AbortSignal.timeout(25000) });
  const buf = await res.arrayBuffer();
  let cs = (/charset=([^;]+)/i.exec(res.headers.get('content-type') || '') || [])[1];
  if (!cs) cs = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(new TextDecoder('latin1').decode(buf.slice(0, 2048))) || [])[1];
  let text; try { text = new TextDecoder((cs || 'utf-8').toLowerCase()).decode(buf); } catch { text = new TextDecoder().decode(buf); }
  return { status: res.status, text, headers: { location: res.headers.get('location'), 'cf-mitigated': res.headers.get('cf-mitigated') } };
};
require('../web/core.js');
require('../web/providers.js');
const q = (p) => {
  const c = p.cats.join();
  if (c === 'Anime') return 'one piece'; if (c === 'Books') return 'harry potter'; if (c === 'Games') return 'minecraft';
  if (c === 'Porn') return 'amateur'; if (c === 'Series') return 'the office'; if (c === 'Movies') return 'matrix'; return 'ubuntu';
};
const report = await Promise.all(TS.providers.map(async (p) => {
  const r = { id: p.id, cf: p.cf };
  try {
    const list = await p.search(TS.encode(q(p)), 'All');
    r.results = list.length;
    const t = list[0];
    if (t) {
      r.sample = { name: t.name, size: t.size, seeders: t.seeders, peers: t.peers, date: t.date ? new Date(t.date).toISOString() : null, category: t.category, details: t.details };
      if (t.magnet) r.magnet = t.magnet.startsWith('magnet:') ? 'ok' : 'invalid';
      else if (t.fetch && p.getMagnet) { try { const m = await p.getMagnet(t.fetch); r.magnet = m.startsWith('magnet:') ? 'fetched-ok' : 'fetched-invalid'; } catch (e) { r.magnet = 'fetch-error: ' + e.message; } }
      else r.magnet = 'no-magnet';
    }
    if (p.latest) { try { r.latest = (await p.latest('All')).length; } catch (e) { r.latest = -1; } }
    if (p.top) { try { r.top = (await p.top('All')).length; } catch (e) { r.top = -1; } }
  } catch (e) { r.results = -1; r.error = String(e.message || e).slice(0, 200); }
  return r;
}));
report.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(process.env.REPORT_PATH || 'web-report.json', JSON.stringify(report, null, 2));
for (const r of report) console.log(`WEB ${r.id} results=${r.results} magnet=${r.magnet || '-'} err=${r.error || '-'}`);
