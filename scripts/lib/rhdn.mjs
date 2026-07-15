/**
 * ROMVault — importador do dump SQL do romhacking.net (RHDN).
 *
 * O RHDN fechou em 2024 e publicou o banco no Internet Archive:
 *   https://archive.org/details/romhacking.net-20240801
 * O item exige LOGIN no Archive; baixe o `romhacking.sql.zip` (~7 MB) manualmente
 * e aponte o importador para ele:
 *
 *   npm run import -- --source=rhdn --file=C:\downloads\romhacking.sql.zip --inspect
 *   npm run import -- --source=rhdn --file=... --section=hacks --limit=50 --dry
 *   npm run import -- --source=rhdn --file=...            # tudo (hacks/trans/utils/docs)
 *
 * Como o schema exato do dump só é conhecido com o arquivo em mãos, o mapeamento
 * usa CANDIDATOS de nomes de tabela/coluna e o modo --inspect lista o que existe
 * de verdade — ajuste fino é 1 linha nos mapas abaixo.
 */
import { readFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { parseMysqlDump } from './mysqldump.mjs';

/* Candidatos de nome de tabela no dump (o --inspect revela os reais). */
const TABLE_CANDIDATES = {
  hacks: ['hacks', 'hack'],
  translations: ['translations', 'translation', 'trans'],
  utilities: ['utilities', 'utility', 'utils'],
  documents: ['documents', 'document', 'docs'],
  games: ['games', 'game'],
  systems: ['systems', 'system', 'platforms', 'consoles'],
  languages: ['languages', 'language', 'langs'],
};

/* Nomes de sistema do RHDN -> nossos nomes curtos de plataforma. */
const PLATFORM_ALIAS = {
  'super nintendo': 'SNES', 'snes': 'SNES', 'super famicom': 'SNES',
  'nintendo entertainment system': 'NES', 'nes': 'NES', 'famicom': 'NES',
  'nintendo 64': 'N64', 'game boy': 'Game Boy', 'game boy color': 'GBC',
  'game boy advance': 'GBA', 'nintendo ds': 'NDS', 'nintendo 3ds': '3DS',
  'gamecube': 'GameCube', 'wii': 'Wii', 'virtual boy': 'Virtual Boy',
  'genesis': 'Genesis', 'mega drive': 'Genesis', 'sega genesis': 'Genesis',
  'master system': 'Master System', 'game gear': 'Game Gear',
  'sega cd': 'Sega CD', 'saturn': 'Saturn', 'sega saturn': 'Saturn', 'dreamcast': 'Dreamcast',
  'playstation': 'PS1', 'playstation 2': 'PS2', 'psp': 'PSP',
  'turbografx-16': 'TG-16', 'pc engine': 'TG-16', 'neo geo': 'Neo Geo',
  'arcade': 'Arcade', 'msx': 'MSX', 'wonderswan': 'WonderSwan',
};

const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Acha a primeira tabela existente entre os candidatos. */
function findTable(tables, candidates) {
  for (const name of candidates) {
    for (const key of tables.keys()) {
      if (key.toLowerCase() === name) return tables.get(key);
    }
  }
  return null;
}

/** Leitor de coluna resiliente: primeira coluna presente entre os candidatos. */
function makePick(row) {
  const lower = new Map(Object.keys(row).map((k) => [k.toLowerCase(), k]));
  return (...cands) => {
    for (const cnd of cands) {
      const key = lower.get(cnd);
      if (key !== undefined && row[key] !== null && row[key] !== '') return row[key];
    }
    return null;
  };
}

function toDate(v) {
  if (v == null) return null;
  if (typeof v === 'number') {
    const ms = v > 1e12 ? v : v * 1000; // unix s ou ms
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const stripHtml = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null;

/** Resolve o arquivo: .sql direto, ou .zip (extrai com tar, nativo no Win10+). */
function resolveSqlFile(file, log) {
  if (!existsSync(file)) throw new Error(`arquivo nao encontrado: ${file}`);
  if (file.toLowerCase().endsWith('.sql')) return file;
  if (file.toLowerCase().endsWith('.zip')) {
    const outDir = `${file}-extracted`;
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
      log(`  extraindo ${file} …`);
      execSync(`tar -xf "${file}" -C "${outDir}"`, { stdio: 'inherit' });
    }
    const found = findSqlRecursive(outDir);
    if (!found) throw new Error(`nenhum .sql dentro de ${file}`);
    return found;
  }
  throw new Error('use um caminho para .sql ou .zip');
}

function findSqlRecursive(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      const hit = findSqlRecursive(p);
      if (hit) return hit;
    } else if (name.toLowerCase().endsWith('.sql')) return p;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export async function importRhdn(ctx) {
  const { sb, flag, DRY, log, c, step, slugifyText } = ctx;
  const source = 'romhacking.net';

  const file = flag('file');
  if (!file || file === true) {
    log(c.red('✖ informe o dump: --file=C:\\caminho\\romhacking.sql.zip'));
    log('  Baixe (logado no Archive): https://archive.org/details/romhacking.net-20240801');
    process.exit(1);
  }

  step('RHDN — lendo o dump');
  const sqlPath = resolveSqlFile(String(file), log);
  const sizeMb = (statSync(sqlPath).size / 1024 / 1024).toFixed(1);
  log(`  ${sqlPath} ${c.dim(`(${sizeMb} MB)`)}`);
  const tables = parseMysqlDump(readFileSync(sqlPath, 'utf8'));
  log(`  ${tables.size} tabelas parseadas`);

  /* --inspect: só lista o que existe (passo 1 com o arquivo em mãos) */
  if (flag('inspect')) {
    step('Tabelas do dump');
    for (const [name, t] of [...tables.entries()].sort((a, b) => b[1].rows.length - a[1].rows.length)) {
      log(`  ${String(t.rows.length).padStart(7)}  ${name}  ${c.dim(t.columns.slice(0, 12).join(', '))}`);
    }
    log(c.amber('\nCom os nomes reais em maos, ajuste TABLE_CANDIDATES em scripts/lib/rhdn.mjs se preciso.'));
    return { tabelas: tables.size };
  }

  /* lookups internos do RHDN */
  const tSystems = findTable(tables, TABLE_CANDIDATES.systems);
  const tGames = findTable(tables, TABLE_CANDIDATES.games);
  const tLangs = findTable(tables, TABLE_CANDIDATES.languages);

  const systemName = new Map(); // id RHDN -> nome curto nosso
  for (const r of tSystems?.rows ?? []) {
    const pick = makePick(r);
    const id = pick('id', 'systemid');
    const raw = String(pick('name', 'title', 'system') ?? '');
    if (id != null) systemName.set(Number(id), PLATFORM_ALIAS[norm(raw)] ?? raw);
  }
  const rhdnGame = new Map(); // id RHDN -> { title, platform }
  for (const r of tGames?.rows ?? []) {
    const pick = makePick(r);
    const id = pick('id', 'gameid');
    if (id == null) continue;
    const sysId = pick('systemid', 'system_id', 'system', 'platformid');
    rhdnGame.set(Number(id), {
      title: String(pick('title', 'name') ?? '').trim(),
      platform: typeof sysId === 'number' ? (systemName.get(sysId) ?? null) : (sysId ? String(sysId) : null),
    });
  }
  const langName = new Map();
  for (const r of tLangs?.rows ?? []) {
    const pick = makePick(r);
    const id = pick('id', 'languageid');
    if (id != null) langName.set(Number(id), String(pick('name', 'language', 'title') ?? ''));
  }
  log(`  lookups: ${systemName.size} sistemas, ${rhdnGame.size} jogos RHDN, ${langName.size} idiomas`);

  /* indice dos NOSSOS jogos (matching por titulo+plataforma) */
  const ourByKey = new Map(); // norm(title)|norm(plat) -> id
  const ourByTitle = new Map(); // norm(title) -> id
  if (!DRY) {
    const { data } = await sb.from('games').select('id, title, platforms').range(0, 99999);
    for (const g of data ?? []) {
      ourByTitle.set(norm(g.title), g.id);
      for (const p of g.platforms ?? []) ourByKey.set(`${norm(g.title)}|${norm(p)}`, g.id);
    }
    log(`  catalogo nosso: ${ourByTitle.size} titulos indexados`);
  }

  /* ids ja importados (dedupe) */
  const seen = new Set();
  if (!DRY) {
    const { data } = await sb.from('id_map').select('entity, external_id').eq('source', source).range(0, 999999);
    for (const r of data ?? []) seen.add(`${r.entity}:${r.external_id}`);
  }

  /** Garante o jogo-base no nosso catalogo (cria minimo se nao existir). */
  const createdGames = new Map();
  async function ensureGame(gameRef) {
    if (!gameRef?.title) return null;
    const key = `${norm(gameRef.title)}|${norm(gameRef.platform ?? '')}`;
    if (ourByKey.has(key)) return ourByKey.get(key);
    if (ourByTitle.has(norm(gameRef.title))) return ourByTitle.get(norm(gameRef.title));
    if (createdGames.has(key)) return createdGames.get(key);
    if (DRY) { createdGames.set(key, `dry-${key}`); return `dry-${key}`; }
    const slug = slugifyText(`${gameRef.title} ${gameRef.platform ?? ''}`);
    const { data, error } = await sb.from('games').upsert(
      {
        slug, title: gameRef.title,
        platforms: gameRef.platform ? [gameRef.platform] : [],
        data_source: 'romhacking.net',
      },
      { onConflict: 'slug' },
    ).select('id').single();
    if (error) return null;
    createdGames.set(key, data.id);
    ourByKey.set(key, data.id);
    ourByTitle.set(norm(gameRef.title), data.id);
    return data.id;
  }

  /* seções -> nossas tabelas */
  const SECTIONS = [
    { key: 'hacks', table: 'romhacks', entity: 'hack', urlPart: 'hacks', needsGame: true },
    { key: 'translations', table: 'translations', entity: 'translation', urlPart: 'translations', needsGame: true },
    { key: 'utilities', table: 'tools', entity: 'utility', urlPart: 'utilities', needsGame: false },
    { key: 'documents', table: 'documents', entity: 'document', urlPart: 'documents', needsGame: false },
  ];
  const only = String(flag('section', 'all'));
  const limit = Number(flag('limit', 0)) || 0;

  const stats = { games_criados: 0, importados: 0, sem_jogo: 0, skipped: 0, erros: 0 };

  for (const sec of SECTIONS) {
    if (only !== 'all' && only !== sec.key) continue;
    const t = findTable(tables, TABLE_CANDIDATES[sec.key]);
    if (!t || t.rows.length === 0) {
      log(c.amber(`  (tabela de ${sec.key} nao encontrada no dump — rode --inspect e ajuste TABLE_CANDIDATES)`));
      continue;
    }
    step(`${sec.key} (${t.rows.length} no dump)`);
    let count = 0;

    for (const r of t.rows) {
      if (limit && count >= limit) break;
      const pick = makePick(r);
      const extId = pick('id');
      if (extId == null) continue;
      const dedupeKey = `${sec.entity}:${extId}`;
      if (seen.has(dedupeKey)) { stats.skipped++; continue; }

      const gameId = pick('gameid', 'game_id', 'game');
      const gameRef = typeof gameId === 'number' ? rhdnGame.get(gameId) : null;

      let ourGameId = null;
      if (gameRef) {
        const before = createdGames.size;
        ourGameId = await ensureGame(gameRef);
        if (createdGames.size > before) stats.games_criados++;
      }
      if (sec.needsGame && !ourGameId) { stats.sem_jogo++; continue; }

      const langId = pick('languageid', 'language_id', 'lang');
      const row = {
        title: String(pick('title', 'name') ?? `RHDN #${extId}`).trim(),
        description: stripHtml(pick('description', 'desc', 'summary')),
        version: pick('version', 'ver') != null ? String(pick('version', 'ver')) : null,
        credits: pick('author', 'authors', 'credit', 'credits') != null ? stripHtml(pick('author', 'authors', 'credit', 'credits')) : null,
        downloads: Number(pick('downloads', 'downloadcount', 'dls')) || 0,
        release_date: toDate(pick('date', 'added', 'releasedate', 'release_date', 'created')),
        data_source: source,
        source_url: `https://www.romhacking.net/${sec.urlPart}/${extId}/`,
      };
      if (sec.table !== 'tools') row.is_public = true;
      if (ourGameId && sec.table !== 'tools') row.game_id = ourGameId;
      if (sec.table === 'translations') {
        row.language = typeof langId === 'number' ? (langName.get(langId) ?? null) : (langId ? String(langId) : null);
      }
      if (sec.table === 'tools' || sec.table === 'documents') {
        const cat = pick('category', 'type', 'genre');
        if (typeof cat === 'string') row.category = stripHtml(cat);
      }

      if (DRY) {
        if (count < 8) log(`  ${c.dim('[dry]')} ${row.title}${gameRef ? c.dim(` -> ${gameRef.title} [${gameRef.platform ?? '?'}]`) : ''}`);
        stats.importados++; count++; seen.add(dedupeKey);
        continue;
      }

      const { data: ins, error } = await sb.from(sec.table).insert(row).select('id').single();
      if (error) { stats.erros++; if (stats.erros <= 5) log(c.red(`  ✖ ${row.title}: ${error.message}`)); continue; }
      await sb.from('id_map').upsert(
        { romvault_id: ins.id, source, entity: sec.entity, external_id: String(extId), confidence: 1, match_type: 'external_id' },
        { onConflict: 'source,entity,external_id' },
      );
      seen.add(dedupeKey);
      stats.importados++; count++;
      if (count % 250 === 0) log(c.dim(`  … ${count}`));
    }
    log(`  ${c.green('✓')} ${sec.key}: ${count} processados`);

    if (!DRY) {
      await sb.from('sync_state').upsert(
        { source, entity: sec.entity, cursor: null, status: 'idle', last_sync_at: new Date().toISOString(), items_processed: count },
        { onConflict: 'source,entity' },
      );
    }
  }

  return stats;
}
