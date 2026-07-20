/**
 * ROMVault — enrich de "PRIMEIRA CARGA": Metacritic (nota) + HowLongToBeat
 * (tempos de jogo) pros jogos que ainda não têm. O acervo já existe; isto só
 * preenche o que falta, de forma incremental (o Killer roda com --limit e vai
 * mastigando; também entra no --source=all).
 *
 *   npm run import -- --source=enrich --limit=300
 *   npm run import -- --source=enrich --platform=snes
 *
 * IMPORTANTE: a lógica AQUI espelha o game-sync (edge) — HLTB pelo fluxo novo
 * /api/bleed/init + /api/bleed, Metacritic com match EXATO (nada de cair no 1º
 * resultado: "GTA VI" trazia Vice City). Mantenha os dois em sincronia.
 *
 * Jogos sem match viram mc_miss / hltb_miss em metadata pra não re-gastar
 * request toda rodada (pra re-tentar: limpe o flag no SQL).
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normTitle = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const fmtH = (secs) => (secs && secs > 0 ? `${Math.round((secs / 3600) * 2) / 2}h` : null);

/** HowLongToBeat pelo fluxo novo (init anti-bot -> POST /api/bleed). */
async function hltbTimes(title) {
  try {
    const initRes = await fetch(`https://howlongtobeat.com/api/bleed/init?t=${Date.now()}`, {
      headers: { 'User-Agent': UA, referer: 'https://howlongtobeat.com/' },
    });
    if (!initRes.ok) return null;
    const sec = await initRes.json();
    const body = {
      searchType: 'games',
      searchTerms: String(title).split(/\s+/).filter(Boolean),
      searchPage: 1, size: 5,
      searchOptions: {
        games: {
          userId: 0, platform: '', sortCategory: 'popular', rangeCategory: 'main',
          rangeTime: { min: null, max: null },
          gameplay: { perspective: '', flow: '', genre: '', difficulty: '' },
          rangeYear: { min: '', max: '' }, modifier: '',
        },
        users: { sortCategory: 'postcount' }, lists: { sortCategory: 'follows' },
        filter: '', sort: 0, randomizer: 0,
      },
      useCache: true,
    };
    if (sec.hpKey) body[sec.hpKey] = sec.hpVal;
    const res = await fetch('https://howlongtobeat.com/api/bleed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'User-Agent': UA,
        origin: 'https://howlongtobeat.com', referer: 'https://howlongtobeat.com/',
        'x-auth-token': sec.token ?? '', 'x-hp-key': sec.hpKey ?? '', 'x-hp-val': sec.hpVal ?? '',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const hits = (await res.json())?.data ?? [];
    const best = hits.find((h) => normTitle(h.game_name) === normTitle(title)) ?? hits[0];
    if (!best) return null;
    return {
      main_story: fmtH(best.comp_main), main_extras: fmtH(best.comp_plus),
      completionist: fmtH(best.comp_100), source: 'HowLongToBeat',
    };
  } catch { return null; }
}

const MC_KEY = '1MOZgmNFxvmljaQR1X9KAij9Mo4xAY3u';
/** Metacritic pelo finder do frontend deles — SÓ título idêntico (+ano ±1). */
async function mcScore(title, releaseDate) {
  try {
    const q = encodeURIComponent(String(title).slice(0, 60));
    const res = await fetch(
      `https://backend.metacritic.com/finder/metacritic/search/${q}/web?apiKey=${MC_KEY}&offset=0&limit=10&mcoTypeId=13`,
      { headers: { 'User-Agent': UA } },
    );
    if (!res.ok) return null;
    const items = (await res.json())?.data?.items ?? [];
    const gamesOnly = items.filter((i) => i.type === 'game-title' || i.criticScoreSummary);
    const target = normTitle(title);
    const ourYear = releaseDate ? new Date(String(releaseDate)).getFullYear() : null;
    const yearOf = (i) => {
      const raw = i?.premiereYear ?? i?.releaseYear ?? i?.releaseDate ?? null;
      if (raw == null) return null;
      const y = typeof raw === 'number' ? raw : new Date(String(raw)).getFullYear();
      return Number.isFinite(y) ? y : null;
    };
    const exact = gamesOnly.filter((i) => normTitle(i.title) === target);
    const best = ourYear != null
      ? (exact.find((i) => { const y = yearOf(i); return y == null || Math.abs(y - ourYear) <= 1; }) ?? null)
      : (exact[0] ?? null);
    const score = best?.criticScoreSummary?.score;
    if (!best || !score) return null;
    return { score: Number(score), url: `https://www.metacritic.com/game/${best.slug}/`, slug: best.slug };
  } catch { return null; }
}

export async function importEnrich(ctx) {
  const { sb, flag, DRY, log, c, step, itemLog, fetchAll } = ctx;
  const only = flag('platform') && flag('platform') !== true ? String(flag('platform')).toUpperCase() : null;
  const limit = Number(flag('limit', 300)) || 300;

  step('Enrich de primeira carga — Metacritic + HowLongToBeat');
  // alvo: jogos de catálogo (com igdb_id) que faltam NOTA ou TEMPOS e que ainda
  // não foram marcados como "sem match".
  let games = await fetchAll(() => sb.from('games')
    .select('id, title, platforms, release_date, metadata, completion_times')
    .not('igdb_id', 'is', null));
  games = games.filter((g) => {
    if (only && !((g.platforms ?? []).some((p) => p.toUpperCase() === only))) return false;
    const md = g.metadata ?? {};
    const ct = g.completion_times ?? null;
    const hasMc = md.scores?.metacritic || md.mc_miss;
    const hasHltb = (ct && (ct.main_story || ct.completionist)) || md.hltb_miss;
    return !hasMc || !hasHltb;
  }).slice(0, limit);
  log(`  ${games.length} jogos pra enriquecer${only ? ` (${only})` : ''}`);
  if (games.length === 0) return { metacritic: 0, hltb: 0, sem_match: 0 };

  const stats = { metacritic: 0, hltb: 0, sem_match: 0 };
  for (const g of games) {
    const md = { ...(g.metadata ?? {}) };
    const ct = g.completion_times ?? null;
    const needHltb = !(ct && (ct.main_story || ct.completionist)) && !md.hltb_miss;
    const needMc = !(md.scores?.metacritic) && !md.mc_miss;
    const patch = {};
    let got = false;

    if (needHltb) {
      const times = await hltbTimes(g.title);
      await sleep(500); // gentileza + o token é por request
      if (times) { patch.completion_times = times; stats.hltb++; got = true; }
      else md.hltb_miss = true;
    }
    if (needMc) {
      const s = await mcScore(g.title, g.release_date);
      await sleep(300);
      if (s) { md.scores = { ...(md.scores ?? {}), metacritic: s }; stats.metacritic++; got = true; }
      else md.mc_miss = true;
    }
    patch.metadata = md; // sempre grava (marca os miss pra não repetir)

    if (!DRY) await sb.from('games').update(patch).eq('id', g.id);
    if (got) itemLog(stats.hltb + stats.metacritic, `  ${c.green('~')} ${g.title}`);
    else stats.sem_match++;
  }
  return stats;
}
