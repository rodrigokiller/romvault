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
 *   npm run import -- --dry        # simula, nao escreve
 *   npm run import -- --source=igdb --platform=snes --limit=50
 *   npm run import -- --source=igdb --platform=ps1 --pages=4     # varias paginas
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
const flag = (name, def = undefined) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return def;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};
const DRY = Boolean(flag('dry', false));
const SOURCE = String(flag('source', 'dataset'));

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
    if (error) { log(c.red(`  ✖ game ${row.slug}: ${error.message}`)); continue; }
    slugToId.set(data.slug, data.id);
    log(`  ${c.green('✓')} ${data.slug}`);
    stats.games++;

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
    if (DRY) { log(`  ${c.dim('[dry]')} ${table}: ${item.title}`); stats[statKey]++; continue; }
    const { error } = await sb.from(table).insert(row);
    if (error) { log(c.red(`  ✖ ${table} "${item.title}": ${error.message}`)); continue; }
    log(`  ${c.green('+')} ${c.dim(table)} ${item.title}`);
    stats[statKey]++;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * MODO IGDB — sync ao vivo (Twitch OAuth + apicalypse), com dedupe + id_map
 * ═══════════════════════════════════════════════════════════════════════════ */
const IGDB_PLATFORMS = {
  snes: 19, nes: 18, n64: 4, gb: 33, gbc: 22, gba: 24, nds: 20,
  ps1: 7, psx: 7, ps2: 8, genesis: 29, megadrive: 29, saturn: 32, dreamcast: 23,
  master: 64, gamegear: 35, tg16: 128, arcade: 52,
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

/** Mapeia um jogo do IGDB para uma linha da tabela games do ROMVault. */
function igdbToGame(g) {
  const platforms = (g.platforms ?? []).map((p) => p.name).filter(Boolean);
  const slug = slugifyText(g.name) + (platforms[0] ? '-' + slugifyText(platforms[0]) : '');
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
    cover_url: igdbImage(g.cover?.url, 'cover_big'),
    thumbnail: igdbImage(g.cover?.url, 'cover_small'),
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
  const pages = Number(flag('pages', 1)) || 1;
  const entity = 'game';
  const source = 'igdb';

  step(`IGDB sync — plataforma=${platformKey} (id ${platformId}), limite ${limit} x ${pages} pagina(s)`);
  const auth = await igdbToken();

  // cursor incremental a partir do sync_state
  let cursor = 0;
  if (!DRY) {
    const { data: ss } = await sb.from('sync_state').select('cursor').eq('source', source).eq('entity', entity).maybeSingle();
    cursor = Number(ss?.cursor ?? 0) || 0;
  }
  log(`  cursor inicial: ${cursor}`);

  // jogos ja existentes (para dedupe por igdb_id / slug)
  let existing = [];
  if (!DRY) {
    const { data } = await sb.from('games').select('id, slug, igdb_id');
    existing = data ?? [];
  }
  const byIgdb = new Map(existing.filter((g) => g.igdb_id != null).map((g) => [Number(g.igdb_id), g.id]));
  const bySlug = new Map(existing.map((g) => [g.slug, g.id]));

  const stats = { games: 0, skipped: 0, mapped: 0 };
  const fields =
    'fields id,name,summary,first_release_date,slug,cover.url,screenshots.url,genres.name,' +
    'platforms.name,game_modes.name,themes.name,franchises.name,collection.name,' +
    'involved_companies.developer,involved_companies.publisher,involved_companies.company.name;';

  for (let page = 0; page < pages; page++) {
    const body = `${fields} where platforms = (${platformId}) & id > ${cursor}; sort id asc; limit ${limit};`;
    const games = await igdbQuery(auth, 'games', body);
    if (games.length === 0) { log(c.amber('  (sem mais resultados)')); break; }

    for (const g of games) {
      cursor = Math.max(cursor, g.id);
      const row = igdbToGame(g);

      // dedupe
      const dupId = byIgdb.get(g.id) ?? bySlug.get(row.slug) ?? null;
      if (dupId) {
        stats.skipped++;
        if (DRY) log(`  ${c.dim('[dry/dup]')} ${row.title}`);
        continue;
      }

      if (DRY) { log(`  ${c.dim('[dry]')} ${row.slug} ${c.dim('igdb:' + g.id)}`); stats.games++; continue; }

      const { data: ins, error } = await sb.from('games').upsert(row, { onConflict: 'slug' }).select('id').single();
      if (error) { log(c.red(`  ✖ ${row.slug}: ${error.message}`)); continue; }
      byIgdb.set(g.id, ins.id);
      bySlug.set(row.slug, ins.id);
      log(`  ${c.green('✓')} ${row.slug} ${c.dim('igdb:' + g.id)}`);
      stats.games++;

      // id_map: igdb_id -> romvault_id
      const { error: mErr } = await sb.from('id_map').upsert(
        { romvault_id: ins.id, source, entity, external_id: String(g.id), confidence: 1, match_type: 'igdb_id' },
        { onConflict: 'source,entity,external_id' },
      );
      if (!mErr) stats.mapped++;
    }
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

/* ═══════════════════════════════════════════════════════════════════════════ */
async function main() {
  log(c.cyan('ROMVault importer') + c.dim(`  source=${SOURCE}${DRY ? '  (dry-run)' : ''}`));
  const sb = makeClient();

  const stats = SOURCE === 'igdb' ? await importIgdb(sb) : await importDataset(sb);

  step('Resumo');
  for (const [k, v] of Object.entries(stats)) log(`  ${k.padEnd(14)} ${v}`);
  if (DRY) log(c.amber('\n(dry-run — nada foi escrito no banco)'));
  else log(c.green('\n✓ Import concluido.'));
}

main().catch((err) => { console.error(c.red('\n✖ Erro fatal:'), err); process.exit(1); });
