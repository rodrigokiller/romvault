/**
 * ROMVault — sitemap.xml dinâmico (Vercel serverless): páginas fixas + jogos
 * + traduções + romhacks. Paginado no PostgREST (teto 1000/req), cap em 40k
 * URLs (limite do protocolo é 50k). Cacheado 12h na CDN.
 */
export default async function handler(req, res) {
  const base = process.env.SITE_URL ?? 'https://romvault.app';
  const supaUrl = process.env.VITE_SUPABASE_URL;
  const supaKey = process.env.VITE_SUPABASE_ANON_KEY;

  const urls = ['/', '/games', '/translations', '/romhacks', '/tools', '/docs', '/collections', '/articles', '/scene', '/stats', '/api']
    .map((p) => `${base}${p}`);

  async function collect(table, ref, route, cap) {
    let got = 0;
    for (let from = 0; got < cap; from += 1000) {
      const r = await fetch(
        `${supaUrl}/rest/v1/${table}?select=${ref}&order=${ref}.asc&limit=1000&offset=${from}`,
        { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } },
      );
      if (!r.ok) break;
      const rows = await r.json();
      for (const row of rows) {
        if (row[ref]) { urls.push(`${base}${route}/${encodeURIComponent(row[ref])}`); got++; }
      }
      if (rows.length < 1000) break;
    }
  }

  /** Séries distintas (o PostgREST não agrega): varre a coluna e dedupe. */
  async function collectSeries(cap) {
    const seen = new Set();
    for (let from = 0; seen.size < cap; from += 1000) {
      const r = await fetch(
        `${supaUrl}/rest/v1/games?select=series&series=not.is.null&order=series.asc&limit=1000&offset=${from}`,
        { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } },
      );
      if (!r.ok) break;
      const rows = await r.json();
      for (const row of rows) {
        if (row.series && !seen.has(row.series)) {
          seen.add(row.series);
          urls.push(`${base}/series/${encodeURIComponent(row.series)}`);
        }
      }
      if (rows.length < 1000) break;
    }
  }

  if (supaUrl && supaKey) {
    try {
      await collect('games', 'slug', '/games', 30000);
      await collect('translations', 'id', '/translations', 5000);
      await collect('romhacks', 'id', '/romhacks', 5000);
      await collectSeries(3000);
    } catch { /* parcial vale mais que erro */ }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    + urls.map((u) => `<url><loc>${u}</loc></url>`).join('\n')
    + `\n</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
  res.status(200).send(xml);
}
