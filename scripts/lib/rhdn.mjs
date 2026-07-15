/**
 * ROMVault — importador do dump SQL do romhacking.net (RHDN).
 *
 * O RHDN fechou em 2024 e publicou o banco no Internet Archive:
 *   https://archive.org/details/romhacking.net-20240801
 * O item exige LOGIN no Archive; baixe o `romhacking.sql.zip` (~7 MB) e:
 *
 *   npm run import -- --source=rhdn --file=C:\downloads\romhacking.sql.zip --inspect
 *   npm run import -- --source=rhdn --file=... --section=hacks --limit=50 --dry
 *   npm run import -- --source=rhdn --file=...            # tudo (hacks/trans/utils/docs)
 *
 * Schema REAL do dump (validado em 2026-07-15 contra o arquivo oficial):
 *   gamedata(gamekey, gametitle, japtitle, description, publisher, Year, genreid, platformid)
 *   console(consolekey='nes', consoleid=1, description='Nintendo Entertainment System', abb='NES')
 *     -> as seções referenciam o CONSOLEID NUMÉRICO no campo `consolekey`
 *   Hacks(hackkey, consolekey, gamekey, hacktitle, version, patchrelunix, downloads, category, description)
 *   transdata(transkey, consolekey, gamekey, patchver, patchrel_unix, language, downloads, description)  [sem título!]
 *   Utilities(utilkey, title, categorykey, gamekey, version, reldate, downloads, description)
 *   Documents(dockey, title, categorykey, gamekey, version, reldate, downloads, description)
 *   language(id, name) · genres(genrekey, description) · Hackscat/utilcat/Category(categorykey, catname)
 */
import { readFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { parseMysqlDump } from './mysqldump.mjs';

const TABLE_CANDIDATES = {
  hacks: ['hacks'],
  translations: ['transdata', 'translations'],
  utilities: ['utilities'],
  documents: ['documents'],
  games: ['gamedata', 'games'],
  systems: ['console', 'systems', 'platforms'],
  languages: ['language', 'languages'],
  genres: ['genres'],
  hackscat: ['hackscat'],
  utilcat: ['utilcat'],
  doccat: ['category'],
};

/* Nomes/abreviações do RHDN -> nossos nomes curtos de plataforma. */
const PLATFORM_ALIAS = {
  'super nintendo': 'SNES', 'snes': 'SNES', 'super famicom': 'SNES',
  'nintendo entertainment system': 'NES', 'nes': 'NES', 'famicom': 'NES',
  'nintendo 64': 'N64', 'n64': 'N64',
  'game boy': 'Game Boy', 'gb': 'Game Boy', 'game boy color': 'GBC', 'gbc': 'GBC',
  'game boy advance': 'GBA', 'gba': 'GBA',
  'nintendo ds': 'NDS', 'nds': 'NDS', 'nintendo 3ds': '3DS', '3ds': '3DS',
  'gamecube': 'GameCube', 'gc': 'GameCube', 'wii': 'Wii', 'virtual boy': 'Virtual Boy', 'vb': 'Virtual Boy',
  'genesis': 'Genesis', 'gen': 'Genesis', 'mega drive': 'Genesis', 'sega genesis': 'Genesis',
  'master system': 'Master System', 'sms': 'Master System',
  'game gear': 'Game Gear', 'gg': 'Game Gear',
  'sega cd': 'Sega CD', 'scd': 'Sega CD', '32x': '32X',
  'saturn': 'Saturn', 'sega saturn': 'Saturn', 'sat': 'Saturn', 'dreamcast': 'Dreamcast', 'dc': 'Dreamcast',
  'playstation': 'PS1', 'psx': 'PS1', 'ps1': 'PS1', 'playstation 2': 'PS2', 'ps2': 'PS2', 'psp': 'PSP',
  'turbografx-16': 'TG-16', 'tg16': 'TG-16', 'pc engine': 'TG-16', 'pce': 'TG-16',
  'neo geo': 'Neo Geo', 'ngeo': 'Neo Geo', 'arcade': 'Arcade', 'arc': 'Arcade',
  'msx': 'MSX', 'wonderswan': 'WonderSwan', 'ws': 'WonderSwan',
};

const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Limpa descrições do RHDN: entidades HTML + BBCode + tags + espaços. */
function cleanText(s) {
  if (s == null) return null;
  const out = String(s)
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\[\/?[a-z*]+(?:=[^\]]*)?\]/gi, '') // BBCode [b] [url=...] [/url]
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return out || null;
}

function toDate(v) {
  if (v == null || v === 0 || v === '') return null;
  if (typeof v === 'number') {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) || d.getFullYear() < 1980 ? null : d.toISOString().slice(0, 10);
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) || d.getFullYear() < 1980 ? null : d.toISOString().slice(0, 10);
}

function findTable(tables, candidates) {
  for (const name of candidates) {
    for (const key of tables.keys()) {
      if (key.toLowerCase() === name) return tables.get(key);
    }
  }
  return null;
}

/** Mapa id->valor a partir de uma tabela de lookup simples. */
function lookupMap(table, idCol, valueCol) {
  const map = new Map();
  for (const r of table?.rows ?? []) {
    if (r[idCol] != null) map.set(r[idCol], r[valueCol]);
  }
  return map;
}

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
  const { sb, flag, DRY, log, c, step, slugifyText, itemLog } = ctx;
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

  if (flag('inspect')) {
    step('Tabelas do dump');
    for (const [name, t] of [...tables.entries()].sort((a, b) => b[1].rows.length - a[1].rows.length)) {
      log(`  ${String(t.rows.length).padStart(7)}  ${name}  ${c.dim(t.columns.slice(0, 12).join(', '))}`);
    }
    return { tabelas: tables.size };
  }

  /* ── lookups internos do RHDN ─────────────────────────────────────────── */
  const tSystems = findTable(tables, TABLE_CANDIDATES.systems);
  const tGames = findTable(tables, TABLE_CANDIDATES.games);

  // console: as seções referenciam o CONSOLEID numérico
  const systemName = new Map();
  for (const r of tSystems?.rows ?? []) {
    const full = String(r.description ?? '');
    const abb = String(r.abb ?? '');
    const short = PLATFORM_ALIAS[norm(full)] ?? PLATFORM_ALIAS[norm(abb)] ?? (abb || full);
    if (r.consoleid != null) systemName.set(Number(r.consoleid), short);
  }

  const langName = lookupMap(findTable(tables, TABLE_CANDIDATES.languages), 'id', 'name');
  const genreName = lookupMap(findTable(tables, TABLE_CANDIDATES.genres), 'genrekey', 'description');
  const hackCat = lookupMap(findTable(tables, TABLE_CANDIDATES.hackscat), 'categorykey', 'catname');
  const utilCat = lookupMap(findTable(tables, TABLE_CANDIDATES.utilcat), 'categorykey', 'catname');
  const docCat = lookupMap(findTable(tables, TABLE_CANDIDATES.doccat), 'categorykey', 'catname');

  // gamedata: id -> dados ricos (para matching E enriquecimento na criação)
  const rhdnGame = new Map();
  for (const r of tGames?.rows ?? []) {
    if (r.gamekey == null) continue;
    rhdnGame.set(Number(r.gamekey), {
      title: String(r.gametitle ?? '').trim(),
      platform: systemName.get(Number(r.platformid)) ?? null,
      japtitle: r.japtitle ? String(r.japtitle).trim() : null,
      publisher: r.publisher ? String(r.publisher).trim() : null,
      year: typeof r.Year === 'number' && r.Year > 1950 ? r.Year : null,
      genre: genreName.get(r.genreid) ?? null,
      description: cleanText(r.description),
    });
  }
  log(`  lookups: ${systemName.size} consoles, ${rhdnGame.size} jogos RHDN, ${langName.size} idiomas`);

  /* ── índice dos NOSSOS jogos (matching por título+plataforma) ─────────── */
  const ourByKey = new Map();
  const ourByTitle = new Map();
  if (!DRY) {
    const { data } = await sb.from('games').select('id, title, platforms').range(0, 99999);
    for (const g of data ?? []) {
      ourByTitle.set(norm(g.title), g.id);
      for (const p of g.platforms ?? []) ourByKey.set(`${norm(g.title)}|${norm(p)}`, g.id);
    }
    log(`  catalogo nosso: ${ourByTitle.size} titulos indexados`);
  }

  /* ── dedupe do que já foi importado ───────────────────────────────────── */
  const seen = new Set();
  if (!DRY) {
    const { data } = await sb.from('id_map').select('entity, external_id').eq('source', source).range(0, 999999);
    for (const r of data ?? []) seen.add(`${r.entity}:${r.external_id}`);
  }

  /** Garante o jogo-base (cria com os dados ricos do RHDN se não existir). */
  const createdGames = new Map();
  async function ensureGame(g) {
    if (!g?.title) return null;
    if (/^n\/?a$/i.test(g.title.trim())) return null; // "N/A" = doc generico do RHDN
    const key = `${norm(g.title)}|${norm(g.platform ?? '')}`;
    if (ourByKey.has(key)) return ourByKey.get(key);
    if (ourByTitle.has(norm(g.title))) return ourByTitle.get(norm(g.title));
    if (createdGames.has(key)) return createdGames.get(key);
    if (DRY) { createdGames.set(key, `dry-${key}`); return `dry-${key}`; }
    const slug = slugifyText(`${g.title} ${g.platform ?? ''}`);
    const { data, error } = await sb.from('games').upsert(
      {
        slug,
        title: g.title,
        alt_title: g.japtitle,
        platforms: g.platform ? [g.platform] : [],
        publishers: g.publisher ? [g.publisher] : [],
        release_date: g.year ? `${g.year}-01-01` : null,
        genres: g.genre ? [g.genre] : [],
        description: g.description,
        data_source: 'romhacking.net',
      },
      { onConflict: 'slug' },
    ).select('id').single();
    if (error) return null;
    createdGames.set(key, data.id);
    ourByKey.set(key, data.id);
    ourByTitle.set(norm(g.title), data.id);
    return data.id;
  }

  const only = String(flag('section', 'all'));
  const limit = Number(flag('limit', 0)) || 0;
  const stats = { games_criados: 0, importados: 0, sem_jogo: 0, skipped: 0, erros: 0 };

  /* mapeadores por seção: row do dump -> nossa linha */
  const SECTIONS = [
    {
      key: 'hacks', table: 'romhacks', entity: 'hack', urlPart: 'hacks', needsGame: true,
      map: (r, gameRef) => ({
        title: cleanText(r.hacktitle) ?? `RHDN hack #${r.hackkey}`,
        description: cleanText(r.description),
        version: r.version != null ? String(r.version) : null,
        categories: hackCat.get(r.category) ? [String(hackCat.get(r.category))] : [],
        downloads: Number(r.downloads) || 0,
        release_date: toDate(r.patchrelunix) ?? toDate(r.reldate) ?? toDate(r.created),
        is_public: true, _id: r.hackkey, _game: gameRef,
      }),
      gameOf: (r) => rhdnGame.get(Number(r.gamekey)),
    },
    {
      key: 'translations', table: 'translations', entity: 'translation', urlPart: 'translations', needsGame: true,
      map: (r, gameRef) => {
        const lang = langName.get(r.language) ? String(langName.get(r.language)) : null;
        return {
          // transdata não tem título: compomos jogo + idioma (padrão do site RHDN)
          title: `${gameRef?.title ?? 'Unknown'}${lang ? ` (${lang})` : ''}`,
          description: cleanText(r.description),
          version: r.patchver != null ? String(r.patchver) : null,
          language: lang,
          translation_type: 'Full',
          downloads: Number(r.downloads) || 0,
          release_date: toDate(r.patchrel_unix) ?? toDate(r.patchrel) ?? toDate(r.created),
          is_public: true, _id: r.transkey, _game: gameRef,
        };
      },
      gameOf: (r) => rhdnGame.get(Number(r.gamekey)),
    },
    {
      key: 'utilities', table: 'tools', entity: 'utility', urlPart: 'utilities', needsGame: false,
      map: (r) => ({
        title: cleanText(r.title) ?? `RHDN util #${r.utilkey}`,
        description: cleanText(r.description),
        version: r.version != null ? String(r.version) : null,
        category: utilCat.get(r.categorykey) ? String(utilCat.get(r.categorykey)) : null,
        downloads: Number(r.downloads) || 0,
        _id: r.utilkey,
      }),
      gameOf: () => null,
    },
    {
      key: 'documents', table: 'documents', entity: 'document', urlPart: 'documents', needsGame: false,
      map: (r, gameRef) => ({
        title: cleanText(r.title) ?? `RHDN doc #${r.dockey}`,
        description: cleanText(r.description),
        category: docCat.get(r.categorykey) ? String(docCat.get(r.categorykey)) : null,
        downloads: Number(r.downloads) || 0,
        is_public: true, _id: r.dockey, _game: gameRef,
      }),
      gameOf: (r) => (r.gamekey ? rhdnGame.get(Number(r.gamekey)) : null),
    },
  ];

  for (const sec of SECTIONS) {
    if (only !== 'all' && only !== sec.key) continue;
    const t = findTable(tables, TABLE_CANDIDATES[sec.key]);
    if (!t || t.rows.length === 0) {
      log(c.amber(`  (tabela de ${sec.key} nao encontrada/vazia — rode --inspect)`));
      continue;
    }
    step(`${sec.key} (${t.rows.length} no dump)`);
    let count = 0;

    for (const r of t.rows) {
      if (limit && count >= limit) break;
      const gameRef = sec.gameOf(r);
      const row = sec.map(r, gameRef);
      const extId = row._id;
      delete row._id; delete row._game;
      if (extId == null) continue;
      const dedupeKey = `${sec.entity}:${extId}`;
      if (seen.has(dedupeKey)) { stats.skipped++; continue; }

      let ourGameId = null;
      if (gameRef) {
        const before = createdGames.size;
        ourGameId = await ensureGame(gameRef);
        if (createdGames.size > before) stats.games_criados++;
      }
      if (sec.needsGame && !ourGameId) { stats.sem_jogo++; continue; }
      if (ourGameId && sec.table !== 'tools') row.game_id = ourGameId;

      row.data_source = source;
      row.source_url = `https://www.romhacking.net/${sec.urlPart}/${extId}/`;
      // endpoint de download do RHDN (site read-only segue servindo os arquivos)
      row.file_url = `https://www.romhacking.net/download/${sec.urlPart}/${extId}/`;

      if (DRY) {
        stats.importados++; count++; seen.add(dedupeKey);
        itemLog(count, `  ${c.dim('[dry]')} ${row.title}${gameRef ? c.dim(` -> ${gameRef.title} [${gameRef.platform ?? '?'}]`) : ''}`);
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
      itemLog(count, `  ${c.green('+')} ${row.title}${gameRef ? c.dim(` -> ${gameRef.title}`) : ''}`);
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
