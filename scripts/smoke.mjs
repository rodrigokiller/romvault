#!/usr/bin/env node
/**
 * ROMVault — smoke test pós-deploy: bate no site no ar e diz verde/vermelho.
 *
 *   npm run smoke                          # usa https://romvault.app
 *   npm run smoke -- --url=https://x.app   # outra URL (preview do Vercel)
 */
const arg = process.argv.find((a) => a.startsWith('--url='));
const BASE = (arg ? arg.slice(6) : 'https://romvault.app').replace(/\/$/, '');

const CHECKS = [
  { name: 'home (SPA)', path: '/', expect: (t) => t.includes('<div id="root">') },
  { name: 'rota interna (rewrite SPA)', path: '/games', expect: (t) => t.includes('<div id="root">') },
  { name: 'robots.txt', path: '/robots.txt', expect: (t) => t.includes('Sitemap:') },
  { name: 'llms.txt', path: '/llms.txt', expect: (t) => t.includes('ROMVault') },
  { name: 'sitemap.xml (serverless)', path: '/sitemap.xml', expect: (t) => t.includes('<urlset') },
  {
    name: 'OG pra bots (api/meta)', path: '/games/chrono-trigger',
    headers: { 'User-Agent': 'Discordbot/2.0' },
    expect: (t) => t.includes('og:title'),
  },
];

let fail = 0;
for (const c of CHECKS) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${c.path}`, { headers: c.headers ?? {}, redirect: 'follow' });
    const text = await res.text();
    const ok = res.ok && c.expect(text);
    const ms = Date.now() - started;
    console.log(`${ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m'} ${c.name}  \x1b[2m(${res.status}, ${ms}ms)\x1b[0m`);
    if (!ok) fail++;
  } catch (err) {
    console.log(`\x1b[31m✖\x1b[0m ${c.name}  \x1b[2m(${err.message})\x1b[0m`);
    fail++;
  }
}

console.log(fail === 0 ? '\n\x1b[32mTudo no ar.\x1b[0m' : `\n\x1b[31m${fail} check(s) falharam.\x1b[0m`);
process.exit(fail === 0 ? 0 : 1);
