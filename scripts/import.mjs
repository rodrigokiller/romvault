#!/usr/bin/env node
/**
 * ROMVault — importador de dados.
 * ─────────────────────────────────────────────────────────────────────────────
 * Popula o banco com MUITO mais do que o seed.sql. Roda LOCALMENTE, usando a
 * SERVICE KEY (server-only) que faz bypass do RLS. A service key NUNCA entra em
 * variavel VITE_ (aquilo vai pro bundle do navegador) — mora so no `.env` da raiz,
 * ja ignorado pelo .gitignore.
 *
 * Uso:
 *   npm run import                 # modo dataset (catalogo curado)
 *   npm run import -- --dry        # simula, nao escreve (implica --verbose)
 *   npm run import -- --verbose    # mostra CADA item (padrao: progresso a cada 250)
 *   npm run import -- --source=igdb --platform=snes --limit=500       # 500 num run
 *   npm run import -- --source=igdb --platform=ps1 --pages=4          # 4 paginas
 *   npm run import -- --source=igdb --platform=snes --all             # TUDO da plataforma
 *   (o cursor e por plataforma e incremental: rodar de novo continua de onde parou)
 *
 *   npm run import -- --source=smwc                    # hacks do SMW Central (1 pagina)
 *   npm run import -- --source=smwc --all              # todos os hacks do SMWC
 *   (romhacks entram LIGADOS ao jogo Super Mario World, com data_source/source_url)
 *
 *   npm run import -- --source=rhdn --file=C:\dl\romhacking.sql.zip --inspect
 *   npm run import -- --source=rhdn --file=... --section=hacks --limit=50 --dry
 *   npm run import -- --source=rhdn --file=...        # dump completo do romhacking.net
 *   (baixe o romhacking.sql.zip LOGADO no Internet Archive:
 *    https://archive.org/details/romhacking.net-20240801)
 *
 *   npm run import -- --source=pobre --section=traducoes --limit=5 --dry
 *   npm run import -- --source=pobre                   # PO.B.R.E (traducoes PT-BR + hacks
 *                                                        + utilitarios + tutoriais, scrape)
 *
 *   npm run import -- --source=covers --limit=200      # preenche capas via IGDB
 *   npm run import -- --source=covers-libretro --platform=snes --dry
 *   npm run import -- --source=covers-libretro         # BOX ART real (libretro CDN
 *                                                        -> copiada pro nosso Storage)
 *   npm run import -- --source=screenscraper --inspect # box 3D/verso/manual (requer
 *                                                        SS_DEVID/SS_USER no .env)
 *   npm run import -- --source=dedupe --dry            # FUNDE jogos duplicados
 *   npm run import -- --source=dedupe                  #   (sempre --dry primeiro!)
 *   npm run import -- --source=all                     # pipeline de manutencao:
 *                                                        dataset->dedupe->covers->libretro
 *
 * Variaveis (.env na raiz do repo — copie de .env.example):
 *   SUPABASE_URL              (= a mesma URL do projeto)
 *   SUPABASE_SERVICE_KEY      (sb_secret_... — server-only!)
 *   TWITCH_CLIENT_ID          (so para --source=igdb)
 *   TWITCH_CLIENT_SECRET      (so para --source=igdb)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/* ── args ─────────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
// Aceita --flag=valor E --flag valor (espaco). Sem valor = boolean true.
const flag = (name, def = undefined) => {
  const idx = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (idx === -1) return def;
  const hit = args[idx];
  const eq = hit.indexOf('=');
  if (eq !== -1) return hit.slice(eq + 1);
  const next = args[idx + 1];
  return next && !next.startsWith('--') ? next : true;
};
const KNOWN_FLAGS = ['source', 'platform', 'limit', 'pages', 'all', 'dry', 'file', 'inspect', 'section', 'verbose', 'backfill'];
const DRY = Boolean(flag('dry', false));
const SOURCE = String(flag('source', 'dataset'));
// --dry implica --verbose (dry-run existe pra inspecionar o que seria feito)
const VERBOSE = Boolean(flag('verbose', false)) || DRY;

/* ── env loader (sem dependencia): le .env da raiz e mescla com process.env ── */
function loadEnv() {
  const envPath = resolve(ROOT, '.env');
  const out = { ...process.env };
  if (existsSync(envPath)) {
    for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (out[key] === undefined) out[key] = val; // process.env vence
    }
  }
  return out;
}
const ENV = loadEnv();

/* ── logging util ─────────────────────────────────────────────────────────── */
const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  amber: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};
const log = (...a) => console.log(...a);
const step = (s) => log(`\n${c.cyan('▸')} ${s}`);

/**
 * Log de item PADRONIZADO em todas as fontes:
 *   padrao  -> silencioso, progresso `… N` a cada 250 (erros sempre aparecem)
 *   --verbose -> mostra cada item importado
 */
const itemLog = (count, msg) => {
  if (VERBOSE) log(msg);
  else if (count % 250 === 0) log(c.dim(`  … ${count}`));
};

/**
 * Busca TODAS as linhas paginando de 1000 em 1000 — o PostgREST/Supabase corta
 * qualquer resposta em 1000 (max-rows), mesmo com range() maior. Sem isso, os
 * indices de dedupe so viam os primeiros 1000 registros.
 */
async function fetchAll(query) {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/* ── slug (identico a packages/core/src/domain/slug.ts) ─────────────────────── */
function stripDiacritics(input) {
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function slugifyText(input) {
  return stripDiacritics(input)
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* ── supabase (service key) ─────────────────────────────────────────────────── */
function makeClient() {
  const url = ENV.SUPABASE_URL || ENV.VITE_SUPABASE_URL;
  const key = ENV.SUPABASE_SERVICE_KEY || ENV.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    log(c.red('\n✖ Faltam credenciais.'));
    log('  Crie um .env na raiz do repo (copie de .env.example) com:');
    log('    SUPABASE_URL=' + (url || 'https://<seu-projeto>.supabase.co'));
    log('    SUPABASE_SERVICE_KEY=sb_secret_...   ' + c.dim('(server-only, NUNCA no VITE_)'));
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * MODO DATASET — catalogo curado (scripts/data/catalog.json)
 * ═══════════════════════════════════════════════════════════════════════════ */
async function importDataset(sb) {
  const catalog = JSON.parse(readFileSync(resolve(__dirname, 'data', 'catalog.json'), 'utf8'));
  const stats = { games: 0, romhacks: 0, translations: 0, documents: 0, tools: 0, articles: 0, skipped: 0 };

  // 1) Jogos — upsert por slug. Guardamos slug->id para pendurar os filhos.
  step(`Jogos (${catalog.games.length})`);
  const slugToId = new Map();
  for (const g of catalog.games) {
    const { romhacks, translations, documents, ...gameFields } = g;
    delete gameFields.$comment;
    const row = { ...gameFields, slug: gameFields.slug || slugifyText(gameFields.title), data_source: 'manual' };
    if (DRY) {
      log(`  ${c.dim('[dry]')} game ${row.slug}`);
      slugToId.set(row.slug, `dry-${row.slug}`);
      stats.games++;
      continue;
    }
    const { data, error } = await sb
      .from('games')
      .upsert(row, { onConflict: 'slug' })
      .select('id, slug')
      .single();
    if (error) {
      log(c.red(`  ✖ game ${row.slug}: ${error.message}`));
      if (/games_igdb_id_idx/.test(error.message)) {
        log(c.dim("     (igdb_id ja usado — provavelmente o seed.sql antigo. Rode no SQL Editor: delete from public.games where slug = 'zelda-alttp';)"));
      }
      continue;
    }
    slugToId.set(data.slug, data.id);
    stats.games++;
    itemLog(stats.games, `  ${c.green('✓')} ${data.slug}`);

    // filhos ligados a este jogo
    await insertChildren(sb, 'romhacks', romhacks, data.id, stats, 'romhacks');
    await insertChildren(sb, 'translations', translations, data.id, stats, 'translations');
    await insertChildren(sb, 'documents', documents, data.id, stats, 'documents');
  }

  // 2) Ferramentas (sem jogo) — dedupe por titulo
  step(`Ferramentas (${(catalog.tools ?? []).length})`);
  await insertUniqueByTitle(sb, 'tools', catalog.tools ?? [], null, stats, 'tools');

  // 3) Documentos avulsos (sem jogo)
  step(`Documentos avulsos (${(catalog.documents ?? []).length})`);
  await insertUniqueByTitle(sb, 'documents', catalog.documents ?? [], null, stats, 'documents');

  // 4) Artigos — upsert por slug
  step(`Artigos (${(catalog.articles ?? []).length})`);
  for (const a of catalog.articles ?? []) {
    const row = { ...a, published_at: a.published_at ?? new Date().toISOString() };
    if (DRY) { log(`  ${c.dim('[dry]')} article ${row.slug}`); stats.articles++; continue; }
    const { error } = await sb.from('articles').upsert(row, { onConflict: 'slug' });
    if (error) { log(c.red(`  ✖ article ${row.slug}: ${error.message}`)); continue; }
    log(`  ${c.green('✓')} ${row.slug}`);
    stats.articles++;
  }

  return stats;
}

/** Insere filhos de um jogo pulando os que ja existem (game_id + title). */
async function insertChildren(sb, table, items, gameId, stats, statKey) {
  if (!items || items.length === 0) return;
  await insertUniqueByTitle(sb, table, items, gameId, stats, statKey);
}

/**
 * Insere linhas pulando duplicatas por titulo (escopo: game_id quando dado,
 * senao global). Sem constraint unica no banco — a dedupe e feita aqui.
 */
async function insertUniqueByTitle(sb, table, items, gameId, stats, statKey) {
  if (!items || items.length === 0) return;
  let existing = new Set();
  if (!DRY) {
    let q = sb.from(table).select('title');
    if (gameId) q = q.eq('game_id', gameId);
    const { data } = await q;
    existing = new Set((data ?? []).map((r) => r.title));
  }
  for (const item of items) {
    if (existing.has(item.title)) { stats.skipped++; continue; }
    const row = gameId ? { ...item, game_id: gameId } : { ...item };
    if (DRY) { itemLog(stats[statKey] + 1, `  ${c.dim('[dry]')} ${table}: ${item.title}`); stats[statKey]++; continue; }
    const { error } = await sb.from(table).insert(row);
    if (error) { log(c.red(`  ✖ ${table} "${item.title}": ${error.message}`)); continue; }
    stats[statKey]++;
    itemLog(stats[statKey], `  ${c.green('+')} ${c.dim(table)} ${item.title}`);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * MODO IGDB — sync ao vivo (Twitch OAuth + apicalypse), com dedupe + id_map
 * ═══════════════════════════════════════════════════════════════════════════ */
const IGDB_PLATFORMS = {
  // Nintendo
  nes: 18, snes: 19, n64: 4, gamecube: 21, gc: 21, wii: 5, wiiu: 41, switch: 130, nsw: 130, switch2: 508, 'nintendo-switch-2': 508,
  gb: 33, gbc: 22, gba: 24, nds: 20, ds: 20, '3ds': 37, virtualboy: 87, vb: 87,
  // Sega
  genesis: 29, megadrive: 29, md: 29, master: 64, mastersystem: 64, gamegear: 35, gg: 35,
  saturn: 32, dreamcast: 23, dc: 23, segacd: 78, sega32x: 30,
  // Sony
  ps1: 7, psx: 7, ps2: 8, ps3: 9, ps4: 48, ps5: 167, psp: 38, vita: 46, psvita: 46,
  // Microsoft
  xbox: 11, x360: 12, xbox360: 12, xboxone: 49, xone: 49, xseries: 169,
  // PC
  pc: 6, windows: 6, dos: 13, mac: 14, linux: 3,
  // Outros
  arcade: 52, tg16: 128, pcengine: 128, neogeo: 80, atari2600: 59, jaguar: 62,
  amiga: 16, c64: 15, '3do': 50, colecovision: 68, intellivision: 67, android: 34, ios: 39,
};

// id do IGDB -> nome curto pra badge/slug (nomes oficiais do IGDB sao verbosos).
const PLATFORM_SHORT = {
  18: 'NES', 19: 'SNES', 4: 'N64', 21: 'GameCube', 5: 'Wii', 41: 'Wii U', 130: 'Switch', 508: 'Switch 2',
  33: 'Game Boy', 22: 'GBC', 24: 'GBA', 20: 'NDS', 37: '3DS', 87: 'Virtual Boy',
  29: 'Genesis', 64: 'Master System', 35: 'Game Gear', 32: 'Saturn', 23: 'Dreamcast', 78: 'Sega CD', 30: '32X',
  7: 'PS1', 8: 'PS2', 9: 'PS3', 48: 'PS4', 167: 'PS5', 38: 'PSP', 46: 'PS Vita',
  11: 'Xbox', 12: 'Xbox 360', 49: 'Xbox One', 169: 'Xbox Series',
  6: 'PC', 13: 'DOS', 14: 'Mac', 3: 'Linux',
  52: 'Arcade', 128: 'TG-16', 80: 'Neo Geo', 59: 'Atari 2600', 62: 'Jaguar',
  16: 'Amiga', 15: 'C64', 50: '3DO', 68: 'ColecoVision', 67: 'Intellivision', 34: 'Android', 39: 'iOS',
};

async function igdbToken() {
  const id = ENV.TWITCH_CLIENT_ID, secret = ENV.TWITCH_CLIENT_SECRET;
  if (!id || !secret) {
    log(c.red('\n✖ IGDB precisa de TWITCH_CLIENT_ID e TWITCH_CLIENT_SECRET no .env.'));
    log('  Crie um app em https://dev.twitch.tv/console/apps e habilite a IGDB API.');
    process.exit(1);
  }
  const url = `https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) { log(c.red(`✖ OAuth Twitch falhou: ${res.status}`)); process.exit(1); }
  const json = await res.json();
  return { token: json.access_token, clientId: id };
}

function igdbImage(url, size) {
  if (!url) return null;
  return 'https:' + url.replace('/t_thumb/', `/t_${size}/`);
}

async function igdbQuery(auth, endpoint, body) {
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: { 'Client-ID': auth.clientId, Authorization: `Bearer ${auth.token}`, Accept: 'application/json' },
    body,
  });
  if (!res.ok) { log(c.red(`✖ IGDB ${endpoint}: ${res.status} ${await res.text()}`)); process.exit(1); }
  return res.json();
}

/**
 * Mapeia um jogo do IGDB para uma linha da tabela games do ROMVault.
 * `primaryShort` = nome curto da plataforma CONSULTADA (ex.: 'SNES'); vira o
 * sufixo do slug e a primeira plataforma da lista (o jogo pode ser multiplataforma).
 */
function igdbToGame(g, primaryShort) {
  // nomes curtos quando conhecemos o id; senao o nome do IGDB
  const mapped = (g.platforms ?? []).map((p) => PLATFORM_SHORT[p.id] ?? p.name).filter(Boolean);
  const platforms = [primaryShort, ...mapped.filter((p) => p !== primaryShort)];
  const slug = slugifyText(g.name) + '-' + slugifyText(primaryShort);
  return {
    slug,
    igdb_id: g.id,
    title: g.name,
    developer: (g.involved_companies ?? []).find((ic) => ic.developer)?.company?.name ?? null,
    publishers: (g.involved_companies ?? []).filter((ic) => ic.publisher).map((ic) => ic.company?.name).filter(Boolean),
    release_date: g.first_release_date ? new Date(g.first_release_date * 1000).toISOString().slice(0, 10) : null,
    genres: (g.genres ?? []).map((x) => x.name).filter(Boolean),
    platforms,
    franchise: g.franchises?.[0]?.name ?? g.collection?.name ?? null,
    description: g.summary ?? null,
    // _2x = retina; thumbnail em cover_big (o cover_small de 90px fica borrado na estante)
    cover_url: igdbImage(g.cover?.url, 'cover_big_2x'),
    thumbnail: igdbImage(g.cover?.url, 'cover_big'),
    screenshots: (g.screenshots ?? []).map((s) => igdbImage(s.url, 'screenshot_med')).filter(Boolean),
    game_modes: (g.game_modes ?? []).map((x) => x.name).filter(Boolean),
    themes: (g.themes ?? []).map((x) => x.name).filter(Boolean),
    external_ids: { igdb: g.id },
    data_source: 'igdb',
  };
}

async function importIgdb(sb) {
  const platformKey = String(flag('platform', 'snes')).toLowerCase();
  const platformId = IGDB_PLATFORMS[platformKey];
  if (!platformId) {
    log(c.red(`✖ plataforma desconhecida: ${platformKey}`));
    log('  Conhecidas: ' + Object.keys(IGDB_PLATFORMS).join(', '));
    process.exit(1);
  }
  const limit = Math.min(Number(flag('limit', 50)) || 50, 500);
  const all = Boolean(flag('all', false));
  const pages = all ? 1000 : (Number(flag('pages', 1)) || 1);
  const primaryShort = PLATFORM_SHORT[platformId] ?? platformKey.toUpperCase();
  // cursor SEPARADO por plataforma (senao trocar de plataforma pularia ids)
  const entity = `game:${platformKey}`;
  const source = 'igdb';

  step(
    `IGDB sync — plataforma=${platformKey} (id ${platformId}), ` +
    (all ? `TUDO em paginas de ${limit}` : `limite ${limit} x ${pages} pagina(s)`),
  );
  const auth = await igdbToken();

  // cursor incremental a partir do sync_state
  let cursor = 0;
  if (!DRY) {
    const { data: ss } = await sb.from('sync_state').select('cursor').eq('source', source).eq('entity', entity).maybeSingle();
    cursor = Number(ss?.cursor ?? 0) || 0;
  }
  log(`  cursor inicial: ${cursor}`);

  // jogos ja existentes (para dedupe por igdb_id / slug). range alto: sem o teto
  // de 1000 do PostgREST, senao games alem de 1000 nao seriam deduplicados.
  let existing = [];
  if (!DRY) {
    existing = await fetchAll(() => sb.from('games').select('id, slug, igdb_id, cover_url'));
  }
  const byIgdb = new Map(existing.filter((g) => g.igdb_id != null).map((g) => [Number(g.igdb_id), g]));
  const bySlug = new Map(existing.map((g) => [g.slug, g.id]));

  const stats = { games: 0, enriched: 0, skipped: 0, mapped: 0 };
  const fields =
    'fields id,name,summary,first_release_date,slug,cover.url,screenshots.url,genres.name,' +
    'platforms.id,platforms.name,game_modes.name,themes.name,franchises.name,collection.name,' +
    'involved_companies.developer,involved_companies.publisher,involved_companies.company.name;';

  for (let page = 0; page < pages; page++) {
    // SO JOGOS PUROS (decisao do Killer): 0=main, 8=remake, 9=remaster,
    // 10=expanded, 11=port. Mods/romhacks (5) e afins vem de fontes proprias
    // (RHDN, SMW Central...) como romhacks ligados ao jogo-base, nao como games.
    const body = `${fields} where platforms = (${platformId}) & game_type = (0,8,9,10,11) & id > ${cursor}; sort id asc; limit ${limit};`;
    const games = await igdbQuery(auth, 'games', body);
    if (games.length === 0) { log(c.amber('  (sem mais resultados)')); break; }

    for (const g of games) {
      cursor = Math.max(cursor, g.id);
      const row = igdbToGame(g, primaryShort);

      // ja existe por igdb_id? enriquece a capa se estiver faltando (ex.: jogos
      // do dataset curado entram sem capa; o IGDB tem a arte).
      const existingByIgdb = byIgdb.get(g.id);
      if (existingByIgdb) {
        if (!existingByIgdb.cover_url && row.cover_url && !DRY) {
          await sb.from('games').update({
            cover_url: row.cover_url, thumbnail: row.thumbnail, screenshots: row.screenshots,
          }).eq('id', existingByIgdb.id);
          existingByIgdb.cover_url = row.cover_url;
          stats.enriched++;
          itemLog(stats.enriched, `  ${c.cyan('~')} ${row.slug} ${c.dim('(capa preenchida)')}`);
        } else {
          stats.skipped++;
        }
        continue;
      }
      if (bySlug.has(row.slug)) { stats.skipped++; continue; }

      if (DRY) { stats.games++; itemLog(stats.games, `  ${c.dim('[dry]')} ${row.slug} ${c.dim('igdb:' + g.id)}`); continue; }

      const { data: ins, error } = await sb.from('games').upsert(row, { onConflict: 'slug' }).select('id').single();
      if (error) {
        // igdb_id ja usado por outro slug: nao e' erro, so pula
        if (/games_igdb_id_idx|duplicate key/.test(error.message)) { stats.skipped++; continue; }
        log(c.red(`  ✖ ${row.slug}: ${error.message}`));
        continue;
      }
      byIgdb.set(g.id, { id: ins.id, cover_url: row.cover_url });
      bySlug.set(row.slug, ins.id);
      stats.games++;
      itemLog(stats.games, `  ${c.green('✓')} ${row.slug} ${c.dim('igdb:' + g.id)}`);

      // id_map: igdb_id -> romvault_id
      const { error: mErr } = await sb.from('id_map').upsert(
        { romvault_id: ins.id, source, entity, external_id: String(g.id), confidence: 1, match_type: 'igdb_id' },
        { onConflict: 'source,entity,external_id' },
      );
      if (!mErr) stats.mapped++;
    }
    if (games.length < limit) break; // ultima pagina alcancada
    if (all) log(c.dim(`  … pagina ${page + 1} (cursor ${cursor})`));
  }

  // grava cursor
  if (!DRY) {
    await sb.from('sync_state').upsert(
      { source, entity, cursor: String(cursor), status: 'idle', last_sync_at: new Date().toISOString(), items_processed: stats.games },
      { onConflict: 'source,entity' },
    );
    log(`\n  cursor final: ${cursor} ${c.dim('(salvo em sync_state)')}`);
  }
  return stats;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * MODO LANGS-IGDB — idiomas OFICIAIS de cada jogo (language_supports do IGDB)
 * -> games.metadata.official_langs = ['EN','JA','BR',...]. Diferencia
 * "traducao oficial" de "patch de fa" na pagina do jogo.
 *   npm run import -- --source=langs-igdb [--dry]
 * ═══════════════════════════════════════════════════════════════════════════ */
function localeToCode(locale) {
  const l = String(locale ?? '').toLowerCase();
  if (l === 'pt-br') return 'BR';
  if (l.startsWith('pt')) return 'PT';
  if (l.startsWith('zh')) return 'ZH';
  if (l.startsWith('sv')) return 'SE';
  return l.slice(0, 2).toUpperCase() || null;
}

async function importLangsIgdb(sb) {
  step('Idiomas oficiais via IGDB (language_supports)');
  const auth = await igdbToken();
  const games = (await fetchAll(() =>
    sb.from('games').select('id, igdb_id, metadata').not('igdb_id', 'is', null)))
    .filter((g) => !(g.metadata && g.metadata.official_langs));
  log(`  ${games.length} jogos com igdb_id sem official_langs`);

  const byIgdb = new Map(games.map((g) => [Number(g.igdb_id), g]));
  const langsOf = new Map(); // igdb_id -> Set(codes)
  const ids = [...byIgdb.keys()];
  for (let i = 0; i < ids.length; i += 350) {
    const chunk = ids.slice(i, i + 350);
    const res = await igdbQuery(
      auth, 'language_supports',
      `fields game, language.locale; where game = (${chunk.join(',')}); limit 500;`,
    );
    for (const r of res ?? []) {
      const code = localeToCode(r.language?.locale);
      if (!code) continue;
      langsOf.set(r.game, (langsOf.get(r.game) ?? new Set()).add(code));
    }
    itemLog(i + 350, c.dim(`  … consultados ${Math.min(i + 350, ids.length)}`));
    await sleep(300);
  }

  const stats = { preenchidos: 0, sem_dados: 0 };
  for (const [igdbId, set] of langsOf) {
    const g = byIgdb.get(igdbId);
    if (!g) continue;
    const codes = [...set].sort();
    if (DRY) { stats.preenchidos++; itemLog(stats.preenchidos, `  ${c.dim('[dry]')} igdb:${igdbId} -> ${codes.join(' ')}`); continue; }
    await sb.from('games').update({
      metadata: { ...(g.metadata ?? {}), official_langs: codes },
    }).eq('id', g.id);
    stats.preenchidos++;
    itemLog(stats.preenchidos, `  ${c.green('~')} igdb:${igdbId} ${c.dim(codes.join(' '))}`);
  }
  stats.sem_dados = games.length - stats.preenchidos;
  return stats;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * MODO PURGE-MODS — remove do catalogo os jogos importados ANTES do filtro de
 * game_type que na verdade sao mods/DLCs/bundles no IGDB (hacks como jogos).
 * So apaga quem NAO tem nada pendurado (hacks/trads/tracks/copias); os demais
 * ficam e sao listados. SEMPRE rode --dry primeiro.
 *   npm run import -- --source=purge-mods --dry
 * ═══════════════════════════════════════════════════════════════════════════ */
const BAD_GAME_TYPES = new Set([1, 3, 5, 6, 7, 13, 14]); // dlc/bundle/MOD/episode/season/pack/update

async function importPurgeMods(sb) {
  step('Purge de mods/DLCs (jogos que nao sao jogos)');
  const auth = await igdbToken();
  const games = await fetchAll(() =>
    sb.from('games').select('id, title, slug, igdb_id').not('igdb_id', 'is', null));
  log(`  ${games.length} jogos com igdb_id para checar`);

  // pergunta o game_type ao IGDB em lotes de 400 ids
  const badIgdb = new Set();
  for (let i = 0; i < games.length; i += 400) {
    const ids = games.slice(i, i + 400).map((g) => g.igdb_id);
    const res = await igdbQuery(auth, 'games', `fields id,game_type; where id = (${ids.join(',')}); limit 500;`);
    for (const r of res ?? []) {
      const gt = typeof r.game_type === 'object' ? r.game_type?.id : r.game_type;
      if (BAD_GAME_TYPES.has(Number(gt))) badIgdb.add(r.id);
    }
    itemLog(i + 400, c.dim(`  … checados ${Math.min(i + 400, games.length)}`));
    await sleep(300);
  }
  const bad = games.filter((g) => badIgdb.has(Number(g.igdb_id)));
  log(`  ${bad.length} identificados como mod/DLC/bundle no IGDB`);

  const stats = { apagados: 0, mantidos_com_filhos: 0, erros: 0 };
  for (const g of bad) {
    // tem filhos? entao alguem referenciou — nao apaga, so avisa
    const [h, tr, gt, gc] = await Promise.all([
      sb.from('romhacks').select('*', { count: 'exact', head: true }).eq('game_id', g.id),
      sb.from('translations').select('*', { count: 'exact', head: true }).eq('game_id', g.id),
      sb.from('game_tracks').select('*', { count: 'exact', head: true }).eq('game_id', g.id),
      sb.from('game_copies').select('*', { count: 'exact', head: true }).eq('game_id', g.id),
    ]);
    const children = (h.count ?? 0) + (tr.count ?? 0) + (gt.count ?? 0) + (gc.count ?? 0);
    if (children > 0) {
      stats.mantidos_com_filhos++;
      log(c.amber(`  ≠ mantido (tem ${children} vinculos): ${g.title}`));
      continue;
    }
    if (DRY) { stats.apagados++; itemLog(stats.apagados, `  ${c.dim('[dry]')} apagar: ${g.title} (${g.slug})`); continue; }
    await sb.from('id_map').delete().eq('romvault_id', g.id);
    const { error } = await sb.from('games').delete().eq('id', g.id);
    if (error) { stats.erros++; continue; }
    stats.apagados++;
    itemLog(stats.apagados, `  ${c.red('-')} ${g.title}`);
  }
  if (DRY) log(c.amber('\n(dry-run — rode sem --dry para apagar de verdade)'));
  return stats;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * MODO COVERS — preenche capa/screenshots de jogos SEM imagem buscando no IGDB
 * por título (+ checagem de plataforma). Útil pros jogos criados pelo RHDN/
 * PO.B.R.E, que entram sem arte.
 *   npm run import -- --source=covers --limit=200 [--dry]
 * ═══════════════════════════════════════════════════════════════════════════ */
const normTitle = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function importCovers(sb) {
  const limit = Number(flag('limit', 200)) || 200;
  step(`Capas via IGDB — ate ${limit} jogos sem imagem`);
  const auth = await igdbToken();

  const { data: games, error } = await sb
    .from('games')
    .select('id, title, platforms, igdb_id, external_ids')
    .is('cover_url', null)
    .order('title')
    .limit(limit);
  if (error) throw error;
  log(`  ${games.length} jogos sem capa nesta leva`);

  const stats = { preenchidos: 0, sem_match: 0, erros: 0 };
  for (const g of games) {
    await sleep(280); // rate-limit IGDB (4 req/s)
    let results;
    try {
      const safe = g.title.replace(/"/g, '');
      results = await igdbQuery(
        auth,
        'games',
        `search "${safe}"; fields id,name,cover.url,screenshots.url,platforms.id,platforms.name; limit 5;`,
      );
    } catch {
      stats.erros++;
      continue;
    }
    // melhor match: título normalizado idêntico (e plataforma compatível, se der)
    const ours = (g.platforms ?? []).map(normTitle);
    const hit = (results ?? []).find((r) => {
      if (normTitle(r.name) !== normTitle(g.title)) return false;
      if (ours.length === 0) return true;
      const theirs = (r.platforms ?? []).map((p) => normTitle(PLATFORM_SHORT[p.id] ?? p.name));
      return theirs.length === 0 || ours.some((p) => theirs.includes(p));
    });
    if (!hit?.cover?.url) { stats.sem_match++; itemLog(stats.sem_match, c.dim(`  – sem match: ${g.title}`)); continue; }

    if (DRY) { stats.preenchidos++; itemLog(stats.preenchidos, `  ${c.dim('[dry]')} ${g.title}`); continue; }
    const patch = {
      cover_url: igdbImage(hit.cover.url, 'cover_big_2x'),
      thumbnail: igdbImage(hit.cover.url, 'cover_big'),
      screenshots: (hit.screenshots ?? []).map((s) => igdbImage(s.url, 'screenshot_med')).filter(Boolean),
    };
    if (g.igdb_id == null) {
      patch.igdb_id = hit.id;
      patch.external_ids = { ...(g.external_ids ?? {}), igdb: hit.id };
    }
    const { error: upErr } = await sb.from('games').update(patch).eq('id', g.id);
    if (upErr) { stats.erros++; continue; }
    stats.preenchidos++;
    itemLog(stats.preenchidos, `  ${c.green('~')} ${g.title}`);
  }
  return stats;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * MODO SMWC — hacks do SMW Central (API JSON publica), ligados ao jogo-base.
 * Prova o pipeline de "materiais importados de fontes externas":
 * data_source='smwcentral' + source_url + dedupe via id_map.
 * ═══════════════════════════════════════════════════════════════════════════ */
const stripHtml = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET JSON com respeito a rate-limit: espera e re-tenta em HTTP 429. */
async function fetchJsonPolite(url, tries = 5) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      const waitMs = Math.max(retryAfter * 1000, 5000 * attempt); // backoff crescente
      log(c.amber(`  (429 rate-limit — aguardando ${Math.round(waitMs / 1000)}s, tentativa ${attempt}/${tries})`));
      await sleep(waitMs);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  throw new Error('HTTP 429 persistente (rate-limit)');
}

async function importSmwc(sb) {
  const source = 'smwcentral';
  const entity = 'romhack:smw';
  const all = Boolean(flag('all', false));
  const maxPages = all ? 1000 : (Number(flag('pages', 1)) || 1);

  step(`SMW Central — hacks de Super Mario World${all ? ' (TODAS as paginas)' : ` (${maxPages} pagina(s))`}`);

  // 1) jogo-base: Super Mario World (importe os games antes)
  let game = null;
  if (!DRY) {
    const bySlug = await sb.from('games').select('id, title').eq('slug', 'super-mario-world').maybeSingle();
    game = bySlug.data;
    if (!game) {
      const byTitle = await sb.from('games').select('id, title')
        .ilike('title', 'Super Mario World').contains('platforms', ['SNES']).limit(1);
      game = byTitle.data?.[0] ?? null;
    }
    if (!game) {
      log(c.red('✖ Jogo-base "Super Mario World" nao encontrado no catalogo.'));
      log('  Rode antes: npm run import   (dataset)  ou o sync IGDB de snes.');
      process.exit(1);
    }
    log(`  jogo-base: ${game.title} ${c.dim(game.id)}`);
  }

  // 2) ids ja importados (dedupe via id_map)
  let seen = new Set();
  if (!DRY) {
    const rows = await fetchAll(() =>
      sb.from('id_map').select('external_id').eq('source', source).eq('entity', entity));
    seen = new Set(rows.map((r) => r.external_id));
  }

  const stats = { romhacks: 0, skipped: 0, mapped: 0 };
  let page = 1;
  for (let i = 0; i < maxPages; i++, page++) {
    if (i > 0) await sleep(3000); // gentileza com o rate-limit do SMWC
    const url = `https://www.smwcentral.net/ajax.php?a=getsectionlist&s=smwhacks&u=0&n=${page}`;
    let body;
    try {
      body = await fetchJsonPolite(url);
    } catch (err) {
      log(c.red(`✖ SMWC pagina ${page}: ${err.message} — rode de novo depois (dedupe continua de onde parou)`));
      break;
    }
    const hacks = body?.data ?? [];
    if (hacks.length === 0) { log(c.amber('  (sem mais resultados)')); break; }

    for (const h of hacks) {
      const extId = String(h.id);
      if (seen.has(extId)) { stats.skipped++; continue; }

      const f = h.fields ?? {};
      const authors = Array.isArray(h.authors) ? h.authors.map((a) => a?.name).filter(Boolean).join(', ') : null;
      const row = {
        game_id: game?.id,
        title: stripHtml(h.name) || `SMWC #${extId}`,
        description: stripHtml(f.description) || null,
        categories: ['Levels'],
        difficulty: typeof f.difficulty === 'string' ? stripHtml(f.difficulty) : null,
        hack_type: typeof f.length === 'string' || typeof f.length === 'number' ? `${f.length} exits` : null,
        tags: Array.isArray(h.tags) ? h.tags.map((t) => stripHtml(t)).filter(Boolean).slice(0, 12) : [],
        credits: authors,
        downloads: Number(h.downloads) || 0,
        rating: Number(h.rating) || 0,
        release_date: h.time ? new Date(h.time * 1000).toISOString().slice(0, 10) : null,
        file_url: h.download_url ? (String(h.download_url).startsWith('//') ? 'https:' + h.download_url : String(h.download_url)) : null,
        data_source: 'smwcentral',
        source_url: `https://www.smwcentral.net/?p=section&a=details&id=${extId}`,
        is_public: true,
      };

      if (DRY) { stats.romhacks++; itemLog(stats.romhacks, `  ${c.dim('[dry]')} ${row.title}`); seen.add(extId); continue; }

      const { data: ins, error } = await sb.from('romhacks').insert(row).select('id').single();
      if (error) { log(c.red(`  ✖ ${row.title}: ${error.message}`)); continue; }
      seen.add(extId);
      stats.romhacks++;
      itemLog(stats.romhacks, `  ${c.green('+')} ${row.title} ${c.dim('smwc:' + extId)}`);

      const { error: mErr } = await sb.from('id_map').upsert(
        { romvault_id: ins.id, source, entity, external_id: extId, confidence: 1, match_type: 'external_id' },
        { onConflict: 'source,entity,external_id' },
      );
      if (!mErr) stats.mapped++;
    }

    const last = Number(body?.last_page) || page;
    if (page >= last) { log(c.dim(`  (ultima pagina: ${last})`)); break; }
    if (all) log(c.dim(`  … pagina ${page}/${last}`));
  }

  // marca o estado da ingestao
  if (!DRY) {
    await sb.from('sync_state').upsert(
      { source, entity, cursor: String(page), status: 'idle', last_sync_at: new Date().toISOString(), items_processed: stats.romhacks },
      { onConflict: 'source,entity' },
    );
  }
  return stats;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
async function main() {
  // Avisa sobre flags malformadas (ex.: --source-igdb em vez de --source=igdb)
  for (const a of args) {
    if (!a.startsWith('--')) continue;
    const nm = a.slice(2).split('=')[0];
    if (!KNOWN_FLAGS.includes(nm)) {
      log(c.amber(`⚠ flag desconhecida: ${a}  — use "=", ex.: --source=igdb --platform=snes`));
    }
  }
  log(c.cyan('ROMVault importer') + c.dim(`  source=${SOURCE}${DRY ? '  (dry-run)' : ''}`));
  const sb = makeClient();

  let stats;
  if (SOURCE === 'igdb') stats = await importIgdb(sb);
  else if (SOURCE === 'smwc' || SOURCE === 'smwcentral') stats = await importSmwc(sb);
  else if (SOURCE === 'rhdn' || SOURCE === 'romhacking') {
    const { importRhdn } = await import('./lib/rhdn.mjs');
    stats = await importRhdn({ sb, flag, DRY, log, c, step, slugifyText, itemLog, fetchAll });
  } else if (SOURCE === 'pobre' || SOURCE === 'romhackers') {
    const { importPobre } = await import('./lib/pobre.mjs');
    stats = await importPobre({ sb, flag, DRY, log, c, step, slugifyText, itemLog, fetchAll });
  } else if (SOURCE === 'covers') {
    stats = await importCovers(sb);
  } else if (SOURCE === 'purge-mods') {
    stats = await importPurgeMods(sb);
  } else if (SOURCE === 'langs-igdb') {
    stats = await importLangsIgdb(sb);
  } else if (SOURCE === 'covers-libretro' || SOURCE === 'libretro') {
    const { importCoversLibretro } = await import('./lib/libretro.mjs');
    stats = await importCoversLibretro({ sb, flag, DRY, log, c, step, itemLog, fetchAll });
  } else if (SOURCE === 'mobygames' || SOURCE === 'moby') {
    const { importMobygames } = await import('./lib/mobygames.mjs');
    stats = await importMobygames({ sb, flag, DRY, log, c, step, itemLog, fetchAll, ENV });
  } else if (SOURCE === 'screenscraper' || SOURCE === 'ss') {
    const { importScreenscraper } = await import('./lib/screenscraper.mjs');
    stats = await importScreenscraper({ sb, flag, DRY, log, c, step, itemLog, fetchAll, ENV });
  } else if (SOURCE === 'dedupe') {
    const { dedupeGames } = await import('./lib/dedupe-games.mjs');
    stats = await dedupeGames({ sb, flag, DRY, log, c, step, itemLog, fetchAll });
  } else if (SOURCE === 'all') {
    // pipeline de manutencao: dataset -> dedupe -> capas IGDB -> box art libretro
    const ctx = { sb, flag, DRY, log, c, step, itemLog, fetchAll, slugifyText };
    const { dedupeGames } = await import('./lib/dedupe-games.mjs');
    const { importCoversLibretro } = await import('./lib/libretro.mjs');
    log(c.cyan('\n══ PIPELINE COMPLETO: dataset → dedupe → covers → libretro ══'));
    const s1 = await importDataset(sb);
    const s2 = await dedupeGames(ctx);
    const s3 = await importCovers(sb);
    const s4 = await importCoversLibretro(ctx);
    stats = {
      'dataset.games': s1.games, 'dedupe.fundidos': s2.fundidos,
      'covers.igdb': s3.preenchidos, 'covers.libretro': s4.preenchidos ?? 0,
    };
  } else stats = await importDataset(sb);

  step('Resumo');
  for (const [k, v] of Object.entries(stats)) log(`  ${k.padEnd(14)} ${v}`);
  if (DRY) log(c.amber('\n(dry-run — nada foi escrito no banco)'));
  else {
    log(c.green('\n✓ Import concluido.'));
    // registro do job (painel de jobs no /admin); falha aqui nunca derruba o run
    try {
      await sb.from('job_runs').insert({ job: SOURCE, mode: 'cli', ok: true, stats });
    } catch { /* tabela ainda não migrada: segue o baile */ }
  }
}

main().catch((err) => { console.error(c.red('\n✖ Erro fatal:'), err); process.exit(1); });
