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
  const user = String(req.query.user ?? '').slice(0, 60);
  const year = String(req.query.year ?? '').slice(0, 4);
  const series = String(req.query.series ?? '').slice(0, 120);
  const base = process.env.SITE_URL ?? 'https://romvault.app';
  const supaUrl = process.env.VITE_SUPABASE_URL;
  const supaKey = process.env.VITE_SUPABASE_ANON_KEY;
  const headers = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };

  let title = 'ROMVault';
  let description = 'O hub do romhacking: jogos, traduções, romhacks, docs e ferramentas.';
  let image = null;
  let pageUrl = base;

  if (slug && supaUrl && supaKey) {
    // página de JOGO
    pageUrl = `${base}/games/${slug}`;
    try {
      const r = await fetch(
        `${supaUrl}/rest/v1/games?slug=eq.${encodeURIComponent(slug)}&select=title,description,cover_url,thumbnail,platforms&limit=1`,
        { headers },
      );
      const [game] = await r.json();
      if (game) {
        title = `${game.title}: ROMVault`;
        if (game.description) description = String(game.description).slice(0, 200);
        else if (game.platforms?.length) description = `Jogo de ${game.platforms.join(', ')} no ROMVault.`;
        image = game.cover_url ?? game.thumbnail ?? null;
      }
    } catch { /* catálogo fora do ar: cai no padrão */ }
  } else if (series && supaUrl && supaKey) {
    // LINHA DO TEMPO da série/franquia (link de /series compartilhado)
    pageUrl = `${base}/series/${encodeURIComponent(series)}`;
    try {
      const enc = encodeURIComponent(series);
      const r = await fetch(
        `${supaUrl}/rest/v1/games?or=(series.eq.${enc},franchise.eq.${enc})&select=cover_url,thumbnail&order=release_date.asc&limit=1`,
        { headers: { ...headers, Prefer: 'count=exact' } },
      );
      const total = Number((r.headers.get('content-range') ?? '/0').split('/')[1] || 0);
      const [first] = await r.json();
      title = `Série ${series}: ROMVault`;
      description = total > 0
        ? `${total} ${total === 1 ? 'lançamento' : 'lançamentos'} na linha do tempo da série ${series}.`
        : `A linha do tempo da série ${series} no ROMVault.`;
      image = first?.cover_url ?? first?.thumbnail ?? null;
    } catch { /* catálogo fora do ar: padrão */ }
  } else if (user && year && supaUrl && supaKey) {
    // RETROSPECTIVA anual (compartilhada no Discord aparece bonita)
    pageUrl = `${base}/u/${user}/year/${year}`;
    try {
      const pr = await fetch(
        `${supaUrl}/rest/v1/profiles?username=eq.${encodeURIComponent(user)}&select=id,avatar_url&limit=1`,
        { headers },
      );
      const [prof] = await pr.json();
      if (prof) {
        const cr = await fetch(
          `${supaUrl}/rest/v1/game_playthroughs?user_id=eq.${prof.id}&finished_on=gte.${year}-01-01&finished_on=lte.${year}-12-31&select=id`,
          { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } },
        );
        const total = Number((cr.headers.get('content-range') ?? '/0').split('/')[1] || 0);
        title = `Retrospectiva ${year} de @${user}: ROMVault`;
        description = total > 0
          ? `${total} ${total === 1 ? 'jogo zerado' : 'jogos zerados'} em ${year}. Veja a retrospectiva completa.`
          : `A retrospectiva de @${user} em ${year} no ROMVault.`;
        image = prof.avatar_url ?? null;
      }
    } catch { /* perfil privado/fora do ar: padrão */ }
  }
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
