/**
 * ROMVault — OG tags dinâmicas pra CRAWLERS (Discord/Twitter/WhatsApp/Slack).
 *
 * O SPA serve um index.html único, então bots nunca veriam título/capa por
 * rota. O vercel.json reescreve /games/:slug PRA CÁ quando o User-Agent é de
 * bot; humanos seguem no SPA normal. Aqui montamos um HTML mínimo com
 * og:title/og:image (a capa do jogo) + redirect de segurança.
 *
 * Envs (as mesmas do build): VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.
 */
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default async function handler(req, res) {
  const slug = String(req.query.slug ?? '').slice(0, 200);
  const base = process.env.SITE_URL ?? 'https://romvault.app';
  const supaUrl = process.env.VITE_SUPABASE_URL;
  const supaKey = process.env.VITE_SUPABASE_ANON_KEY;

  let title = 'ROMVault';
  let description = 'O hub do romhacking: jogos, traduções, romhacks, docs e ferramentas.';
  let image = null;

  if (slug && supaUrl && supaKey) {
    try {
      const r = await fetch(
        `${supaUrl}/rest/v1/games?slug=eq.${encodeURIComponent(slug)}&select=title,description,cover_url,thumbnail,platforms&limit=1`,
        { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } },
      );
      const [game] = await r.json();
      if (game) {
        title = `${game.title} — ROMVault`;
        if (game.description) description = String(game.description).slice(0, 200);
        else if (game.platforms?.length) description = `Jogo de ${game.platforms.join(', ')} no ROMVault.`;
        image = game.cover_url ?? game.thumbnail ?? null;
      }
    } catch {
      /* catálogo fora do ar: cai no padrão */
    }
  }

  const pageUrl = `${base}/games/${slug}`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta property="og:site_name" content="ROMVault">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta property="og:url" content="${esc(pageUrl)}">
<meta name="twitter:card" content="${image ? 'summary' : 'summary_large_image'}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
${image ? `<meta name="twitter:image" content="${esc(image)}">` : ''}
<meta http-equiv="refresh" content="0;url=${esc(pageUrl)}">
</head>
<body><a href="${esc(pageUrl)}">${esc(title)}</a></body>
</html>`);
}
