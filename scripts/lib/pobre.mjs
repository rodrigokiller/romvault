/**
 * ROMVault — importador do PO.B.R.E (romhackers.org), o portal BR de
 * romhacking. Sem API: scrape educado do HTML (site estático em Bootstrap,
 * estrutura estável: h1 "Jogo (Grupo)" + tabelas th/td "Jogo:"/"Tradução:" +
 * download em cdn.romhackers.org + screenshots em img.romhackers.org).
 *
 *   npm run import -- --source=pobre --section=traducoes --limit=5 --dry
 *   npm run import -- --source=pobre --section=traducoes      # ~1400 traducoes PT-BR
 *   npm run import -- --source=pobre                          # tudo (trad+hacks+utils+docs)
 *
 * Crawl: BFS dentro da seção (listagens -> entradas). Uma página é "entrada"
 * quando tem download no CDN ou as tabelas de metadados; senão é listagem e
 * seus links são enfileirados. Pausa entre requests + retry em 429/5xx.
 */

const BASE = 'https://romhackers.org';

const PLATFORM_ALIAS = {
  'super nes': 'SNES', 'super nintendo': 'SNES', 'snes': 'SNES',
  'nes': 'NES', 'famicom disk system': 'FDS',
  'nintendo 64': 'N64', 'game cube': 'GameCube', 'gamecube': 'GameCube', 'wii': 'Wii', 'wii u': 'Wii U', 'switch': 'Switch',
  'game boy': 'Game Boy', 'game boy color': 'GBC', 'game boy advance': 'GBA',
  'nintendo ds': 'NDS', 'nintendo 3ds': '3DS', 'virtual boy': 'Virtual Boy',
  'mega drive': 'Genesis', 'genesis': 'Genesis', 'master system': 'Master System',
  'game gear': 'Game Gear', 'sega cd': 'Sega CD', '32x': '32X', 'saturn': 'Saturn', 'dreamcast': 'Dreamcast', 'sg-1000': 'SG-1000',
  'playstation': 'PS1', 'playstation 2': 'PS2', 'playstation 3': 'PS3', 'playstation portable': 'PSP', 'psp': 'PSP', 'ps vita': 'PS Vita',
  'xbox': 'Xbox', 'xbox 360': 'Xbox 360',
  'pc engine': 'TG-16', 'turbografx-16': 'TG-16', 'neo geo': 'Neo Geo', 'neo geo pocket': 'Neo Geo Pocket',
  'jamma pcb': 'Arcade', 'arcade': 'Arcade', 'msx': 'MSX', 'wonderswan': 'WonderSwan',
  'windows': 'PC', 'ms-dos': 'DOS', 'dos': 'DOS', 'colecovision': 'ColecoVision', '3do': '3DO',
};

const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const decode = (s) =>
  String(s ?? '')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&eacute;/g, 'é').replace(/&atilde;/g, 'ã').replace(/&ccedil;/g, 'ç');

const cleanText = (s) => {
  const out = decode(String(s ?? '')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return out || null;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url, log, c, tries = 4) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'ROMVault-importer/1.0 (+github romvault)' } });
      if (res.status === 429 || res.status >= 500) {
        const wait = 4000 * attempt;
        log(c.amber(`  (HTTP ${res.status} em ${url} — aguardando ${wait / 1000}s)`));
        await sleep(wait);
        continue;
      }
      if (!res.ok) return null;
      return await res.text();
    } catch {
      await sleep(2500 * attempt);
    }
  }
  return null;
}

/** Extrai pares th/td de todas as tabelas, agrupados por badge (Jogo:/Tradução:/...). */
function parseChunks(html) {
  const chunks = [];
  const parts = html.split(/<h5 class="badge[^>]*>/i);
  for (let i = 1; i < parts.length; i++) {
    const heading = cleanText(parts[i].slice(0, parts[i].indexOf('</h5>'))) ?? '';
    const fields = {};
    const re = /<th scope="row">([\s\S]*?)<\/th>\s*<td>([\s\S]*?)<\/td>/gi;
    let m;
    while ((m = re.exec(parts[i])) !== null) {
      const label = cleanText(m[1])?.replace(/:$/, '');
      const value = cleanText(m[2]);
      if (label && value) fields[norm(label)] = value;
    }
    chunks.push({ heading, fields });
  }
  return chunks;
}

/** Parseia uma página de entrada. Retorna null se não parecer uma entrada. */
function parseEntry(html, path) {
  const download = html.match(/href="(https?:\/\/cdn\.romhackers\.org[^"]+)"/i)?.[1] ?? null;
  const chunks = parseChunks(html);
  if (!download && chunks.length === 0) return null;

  const h1 = cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) ?? '';
  // "ActRaiser 2 (Trans-Center)" -> título + grupo (último parêntese)
  const tm = h1.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  const title = (tm ? tm[1] : h1).trim();
  const group = tm ? tm[2].trim() : null;

  const shots = [...html.matchAll(/src="(\/\/img\.romhackers\.org[^"]+)"/gi)]
    .map((m) => 'https:' + m[1]);

  const game = chunks.find((ch) => /^jogo/i.test(ch.heading))?.fields ?? null;
  const material = chunks.find((ch) => !/^jogo/i.test(ch.heading))?.fields ?? null;

  return { path, title, group, download, screenshots: [...new Set(shots)], game, material };
}

/* seções do site -> nossas tabelas */
const SECTIONS = {
  traducoes: { table: 'translations', entity: 'translation', needsGame: true },
  romhacks: { table: 'romhacks', entity: 'romhack', needsGame: true },
  utilitarios: { table: 'tools', entity: 'utility', needsGame: false },
  tutoriais: { table: 'documents', entity: 'document', needsGame: false },
};

/* ═══════════════════════════════════════════════════════════════════════════ */
export async function importPobre(ctx) {
  const { sb, flag, DRY, log, c, step, slugifyText, itemLog } = ctx;
  const source = 'romhackers.org';
  const only = String(flag('section', 'all'));
  const limit = Number(flag('limit', 0)) || 0;
  const delayMs = 450;

  /* índice dos nossos jogos + dedupe (uma vez) */
  const ourByKey = new Map();
  const ourByTitle = new Map();
  const seen = new Set();
  if (!DRY) {
    const { data: games } = await sb.from('games').select('id, title, platforms').range(0, 99999);
    for (const g of games ?? []) {
      ourByTitle.set(norm(g.title), g.id);
      for (const p of g.platforms ?? []) ourByKey.set(`${norm(g.title)}|${norm(p)}`, g.id);
    }
    const { data: mapped } = await sb.from('id_map').select('entity, external_id').eq('source', source).range(0, 999999);
    for (const r of mapped ?? []) seen.add(`${r.entity}:${r.external_id}`);
    log(`  catalogo nosso: ${ourByTitle.size} titulos · ja importados: ${seen.size}`);
  }

  const createdGames = new Map();
  async function ensureGame(g) {
    if (!g?.title) return null;
    const key = `${norm(g.title)}|${norm(g.platform ?? '')}`;
    if (ourByKey.has(key)) return ourByKey.get(key);
    if (ourByTitle.has(norm(g.title))) return ourByTitle.get(norm(g.title));
    if (createdGames.has(key)) return createdGames.get(key);
    if (DRY) { createdGames.set(key, `dry-${key}`); return `dry-${key}`; }
    const { data, error } = await sb.from('games').upsert(
      {
        slug: slugifyText(`${g.title} ${g.platform ?? ''}`),
        title: g.title,
        platforms: g.platform ? [g.platform] : [],
        developer: g.developer ?? null,
        publishers: g.publisher ? [g.publisher] : [],
        release_date: g.year ? `${g.year}-01-01` : null,
        genres: g.genres ?? [],
        data_source: source,
      },
      { onConflict: 'slug' },
    ).select('id').single();
    if (error) return null;
    createdGames.set(key, data.id);
    ourByKey.set(key, data.id);
    ourByTitle.set(norm(g.title), data.id);
    return data.id;
  }

  const stats = { games_criados: 0, importados: 0, sem_dados: 0, skipped: 0, erros: 0 };

  for (const [secName, sec] of Object.entries(SECTIONS)) {
    if (only !== 'all' && only !== secName) continue;
    step(`PO.B.R.E — /${secName}`);

    /* BFS: listagens -> entradas (classifica DEPOIS de baixar) */
    const queue = [`/${secName}`];
    const visited = new Set(queue);
    let count = 0;

    while (queue.length > 0) {
      if (limit && count >= limit) break;
      const path = queue.shift();
      await sleep(delayMs);
      const html = await fetchHtml(`${BASE}${path}`, log, c);
      if (!html) continue;

      // links internos da mesma seção
      const links = [...html.matchAll(new RegExp(`href="(?:${BASE})?(/${secName}/[^"#?]+)"`, 'gi'))]
        .map((m) => m[1].replace(/\/+$/, ''))
        .filter((p) => p.length > secName.length + 2);

      const entry = parseEntry(html, path);
      const isEntry = entry && (entry.download || entry.material);

      if (!isEntry) {
        for (const l of links) {
          if (!visited.has(l)) { visited.add(l); queue.push(l); }
        }
        continue;
      }

      /* é uma entrada: mapeia e grava */
      const extId = path.replace(/^\//, '');
      const dedupeKey = `${sec.entity}:${extId}`;
      if (seen.has(dedupeKey)) { stats.skipped++; continue; }
      if (!entry.title) { stats.sem_dados++; continue; }

      const gf = entry.game ?? {};
      const mf = entry.material ?? {};
      const platform = PLATFORM_ALIAS[norm(gf['sistema'] ?? '')] ?? (gf['sistema'] ?? null);
      const year = Number(String(gf['data de lancamento'] ?? '').match(/\d{4}/)?.[0]) || null;
      const gameRef = sec.needsGame
        ? {
            title: entry.title,
            platform,
            developer: gf['desenvolvedora'] ?? null,
            publisher: gf['distribuidora'] ?? null,
            year,
            genres: gf['tipo'] ? gf['tipo'].split(/\s*-\s*/).map((x) => x.trim()).filter(Boolean) : [],
          }
        : null;

      let ourGameId = null;
      if (gameRef) {
        const before = createdGames.size;
        ourGameId = await ensureGame(gameRef);
        if (createdGames.size > before) stats.games_criados++;
        if (!ourGameId) { stats.sem_dados++; continue; }
      }

      const credits = [mf['autor(es)'] ?? mf['autores'] ?? mf['autor'], entry.group ?? mf['grupo(s)'] ?? mf['grupos']]
        .filter(Boolean).join(' · ') || null;
      const relYear = String(mf['data de lancamento'] ?? '').match(/\d{4}(-\d{2}(-\d{2})?)?/)?.[0] ?? null;
      const progress = Number(String(mf['progresso'] ?? '').match(/\d+/)?.[0]) || null;

      const row = {
        title: sec.table === 'translations' ? `${entry.title} — Tradução PT-BR${entry.group ? ` (${entry.group})` : ''}` : entry.title,
        description: null,
        version: mf['versao'] ?? null,
        credits,
        downloads: 0,
        release_date: relYear ? (relYear.length === 4 ? `${relYear}-01-01` : relYear) : null,
        file_url: entry.download,
        thumbnail: entry.screenshots[0] ?? null,
        screenshots: entry.screenshots,
        data_source: source,
        source_url: `${BASE}${path}/`,
      };
      if (sec.table !== 'tools') { row.is_public = true; if (ourGameId) row.game_id = ourGameId; }
      if (sec.table === 'translations') {
        row.language = 'Português (BR)';
        row.source_language = 'Inglês';
        row.translation_type = 'Full';
        row.completion_percentage = progress;
        row.patch_type = mf['formato'] ?? null;
      }
      if (sec.table === 'tools' || sec.table === 'documents') {
        row.category = sec.table === 'documents' ? 'Tutorial' : (path.split('/')[2] ?? null);
        if (sec.table === 'documents') row.language = 'Português (BR)';
      }

      if (DRY) {
        stats.importados++; count++; seen.add(dedupeKey);
        itemLog(count, `  ${c.dim('[dry]')} ${row.title}${gameRef ? c.dim(` -> ${gameRef.title} [${platform ?? '?'}]`) : ''}`);
        continue;
      }

      const { data: ins, error } = await sb.from(sec.table).insert(row).select('id').single();
      if (error) { stats.erros++; if (stats.erros <= 5) log(c.red(`  ✖ ${row.title}: ${error.message}`)); continue; }
      await sb.from('id_map').upsert(
        { romvault_id: ins.id, source, entity: sec.entity, external_id: extId, confidence: 1, match_type: 'external_id' },
        { onConflict: 'source,entity,external_id' },
      );
      seen.add(dedupeKey);
      stats.importados++; count++;
      itemLog(count, `  ${c.green('+')} ${row.title}${gameRef ? c.dim(` -> ${gameRef.title}`) : ''}`);
    }
    log(`  ${c.green('✓')} ${secName}: ${count} importados`);

    if (!DRY) {
      await sb.from('sync_state').upsert(
        { source, entity: sec.entity, cursor: null, status: 'idle', last_sync_at: new Date().toISOString(), items_processed: count },
        { onConflict: 'source,entity' },
      );
    }
  }

  return stats;
}
