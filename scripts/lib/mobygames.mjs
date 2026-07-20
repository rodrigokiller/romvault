/**
 * ROMVault — scans de capa via MobyGames (API paga: Hobbyist US$9,99/mês).
 *
 * O acervo mais rico de SCANS por release/região: frente, VERSO e mídia.
 * Rate limit Hobbyist: 1 request a cada 5s (respeitado com folga: 5,5s).
 *
 *   .env raiz:  MOBY_API_KEY=xxxx   (mobygames.com/info/api depois de assinar)
 *
 *   npm run import -- --source=mobygames --inspect            # lista plataformas
 *   npm run import -- --source=mobygames --platform=snes --limit=10 --dry
 *   npm run import -- --source=mobygames --platform=snes      # 50 jogos (default)
 *   npm run import -- --source=mobygames --platform=snes --all  # fila inteira
 *
 * Preenche games.metadata.moby = { front, back, media } (copiado pro nosso
 * Storage) e usa a frente como boxart/capa quando faltarem.
 */

import { upsertMedia, regionOf } from './game-media.mjs';

const API = 'https://api.mobygames.com/v1';

const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* nossos nomes -> nomes de plataforma do MobyGames (casados via /platforms) */
const PLATFORM_NAMES = {
  SNES: 'snes', NES: 'nes', N64: 'nintendo 64', GameCube: 'gamecube', Wii: 'wii',
  'Game Boy': 'game boy', GBC: 'game boy color', GBA: 'game boy advance',
  NDS: 'nintendo ds', '3DS': 'nintendo 3ds',
  Genesis: 'genesis', 'Master System': 'sega master system', 'Game Gear': 'game gear',
  'Sega CD': 'sega cd', Saturn: 'sega saturn', Dreamcast: 'dreamcast',
  PS1: 'playstation', PS2: 'playstation 2', PSP: 'psp',
  'TG-16': 'turbografx-16', 'Neo Geo': 'neo geo', Arcade: 'arcade',
};

async function mobyJson(path, key, log, c, tries = 3) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}api_key=${key}`);
    if (res.status === 429) { await sleep(10_000 * attempt); continue; }
    if (!res.ok) { log(c.red(`  ✖ Moby ${path.split('?')[0]}: HTTP ${res.status}`)); return null; }
    return res.json();
  }
  return null;
}

export async function importMobygames(ctx) {
  const { sb, flag, DRY, log, c, step, itemLog, fetchAll, ENV } = ctx;
  const key = ENV.MOBY_API_KEY;
  if (!key) {
    log(c.red('✖ MOBY_API_KEY ausente no .env da raiz.'));
    log('  Assine em mobygames.com (Hobbyist US$9,99/mes) e pegue a key em /info/api.');
    process.exit(1);
  }

  if (flag('inspect')) {
    step('Plataformas do MobyGames');
    const data = await mobyJson('/platforms', key, log, c);
    for (const p of data?.platforms ?? []) log(`  ${String(p.platform_id).padStart(4)}  ${p.platform_name}`);
    return { ok: 1 };
  }

  const rawPlat = flag('platform');
  const ourPlatform = rawPlat && rawPlat !== true ? String(rawPlat) : 'SNES';
  const platKey = Object.keys(PLATFORM_NAMES).find((k) => norm(k) === norm(ourPlatform)) ?? ourPlatform;
  // --all = fila inteira da plataforma (fullset); senão --limit (default 50)
  const limit = flag('all') ? Infinity : (Number(flag('limit', 50)) || 50);

  step(`MobyGames — ${platKey} (frente/verso/mídia; 1 req/5,5s — paciência)`);

  // resolve o platform_id pela lista oficial
  const plats = await mobyJson('/platforms', key, log, c);
  const wanted = norm(PLATFORM_NAMES[platKey] ?? platKey);
  const plat = (plats?.platforms ?? []).find((p) => norm(p.platform_name) === wanted)
    ?? (plats?.platforms ?? []).find((p) => norm(p.platform_name).includes(wanted));
  if (!plat) { log(c.red(`✖ plataforma nao achada no Moby: ${platKey}`)); process.exit(1); }
  log(`  platform_id: ${plat.platform_id} (${plat.platform_name})`);

  // alvo: jogos da plataforma sem scans do moby ainda (e sem miss registrado —
  // um "sem match" marcado nao volta pra fila, senao re-gasta rate-limit toda rodada)
  const games = (await fetchAll(() =>
    sb.from('games').select('id, title, cover_url, metadata').contains('platforms', [platKey])))
    .filter((g) => !(g.metadata && (g.metadata.moby || g.metadata.moby_miss)))
    .slice(0, limit);
  log(`  ${games.length} jogos nesta leva`);

  /** Marca o jogo como tentado-sem-resultado (re-tentar: limpar moby_miss no SQL). */
  async function markMiss(g) {
    if (DRY) return;
    await sb.from('games').update({ metadata: { ...(g.metadata ?? {}), moby_miss: true } }).eq('id', g.id);
  }

  const stats = { com_scans: 0, sem_match: 0, erros: 0 };
  for (const g of games) {
    await sleep(5500);
    const search = await mobyJson(
      `/games?title=${encodeURIComponent(g.title)}&platform=${plat.platform_id}&limit=3&format=normal`,
      key, log, c,
    );
    // match exato; fallback SÓ se os títulos forem parentes (um contém o
    // outro) — cair cego no 1º resultado colava scan de outro jogo
    const cand = search?.games ?? [];
    const me = norm(g.title);
    const hit = cand.find((m) => norm(m.title) === me)
      ?? cand.find((m) => { const other = norm(m.title); return other.includes(me) || me.includes(other); });
    if (!hit) { stats.sem_match++; itemLog(stats.sem_match, c.dim(`  – sem match: ${g.title}`)); await markMiss(g); continue; }

    await sleep(5500);
    const covers = await mobyJson(`/games/${hit.game_id}/platforms/${plat.platform_id}/covers`, key, log, c);
    // grupos de capa por região; preferimos US/Worldwide, senão o primeiro
    const groups = covers?.cover_groups ?? [];
    const pick = groups.find((cg) => (cg.countries ?? []).some((x) => /united states|worldwide/i.test(x))) ?? groups[0];
    if (!pick) { stats.sem_match++; await markMiss(g); continue; }
    const byType = (type) => (pick.covers ?? []).find((cv) => new RegExp(type, 'i').test(cv.scan_of ?? ''))?.image ?? null;
    const front = byType('front');
    const back = byType('back');
    const media = byType('media');
    if (!front && !back) { stats.sem_match++; await markMiss(g); continue; }

    if (DRY) {
      stats.com_scans++;
      itemLog(stats.com_scans, `  ${c.dim('[dry]')} ${g.title} ${c.dim(`front:${front ? 's' : '-'} back:${back ? 's' : '-'} media:${media ? 's' : '-'}`)}`);
      continue;
    }
    try {
      const moby = {};
      for (const [kind, url] of [['front', front], ['back', back], ['media', media]]) {
        if (!url) continue;
        const imgRes = await fetch(url);
        if (!imgRes.ok) continue;
        const bytes = new Uint8Array(await imgRes.arrayBuffer());
        const path = `covers/mobygames/${norm(platKey).replace(/\s+/g, '-')}/${norm(g.title).replace(/\s+/g, '-')}-${kind}.jpg`;
        const { error } = await sb.storage.from('uploads')
          .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
        if (error) continue;
        moby[kind] = sb.storage.from('uploads').getPublicUrl(path).data.publicUrl;
      }
      const patch = { metadata: { ...(g.metadata ?? {}), moby } };
      if (!g.metadata?.boxart && moby.front) patch.metadata.boxart = moby.front;
      if (!g.cover_url && moby.front) { patch.cover_url = moby.front; patch.thumbnail = moby.front; }
      await sb.from('games').update(patch).eq('id', g.id);
      // fase 2: cada scan vira uma linha em game_media COM plataforma+região
      const region = regionOf(pick.countries);
      await upsertMedia(sb, [
        moby.front && { game_id: g.id, platform: platKey, kind: 'boxart', region, url: moby.front, source: 'mobygames' },
        moby.back && { game_id: g.id, platform: platKey, kind: 'back', region, url: moby.back, source: 'mobygames' },
        moby.media && { game_id: g.id, platform: platKey, kind: 'media', region, url: moby.media, source: 'mobygames' },
      ].filter(Boolean));
      stats.com_scans++;
      itemLog(stats.com_scans, `  ${c.green('~')} ${g.title}`);
    } catch (err) {
      stats.erros++;
      if (stats.erros <= 3) log(c.red(`  ✖ ${g.title}: ${err.message}`));
    }
  }
  return stats;
}
