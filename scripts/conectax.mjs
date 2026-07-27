/**
 * ROMVault ⇄ ConectaX — sync de "o que eu tenho" (jogos), estilo Trakt.
 *
 * CONTRATO (formato neutro): array de objetos
 *   { chave, titulo, plataforma, regiao?, possui, romvault_status, hash?, atualizado_em }
 * chave = hash do ROM se existisse; como o RomVault vem do IGDB/dataset (não de
 * DATs), a chave é `plataforma|titulo` normalizado em minúsculas.
 *
 *   npm run conectax export -- --user=killer [--platform=SNES] [--out=jogos.json]
 *   npm run conectax import -- --user=killer --in=jogos.json          # DRY-RUN (padrão)
 *   npm run conectax import -- --user=killer --in=jogos.json --apply   # grava
 *
 * MERGE por `chave`, última-escrita-vence por `atualizado_em`. Nunca apaga:
 * divergências (o outro lado diz que NÃO tenho algo que eu tenho, e a data dele
 * é mais VELHA) viram conflito no relatório. Dry-run é o padrão no import.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`,
  amber: (s) => `\x1b[33m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};
const log = (...a) => console.log(...a);

/* env loader: o .env da RAIZ manda (mesma regra do import.mjs) */
function loadEnv() {
  const out = { ...process.env };
  const p = resolve(ROOT, '.env');
  if (existsSync(p)) {
    for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      out[line.slice(0, eq).trim()] = val;
    }
  }
  return out;
}
const ENV = loadEnv();
const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name, def = null) => {
  const pre = `--${name}`;
  for (const a of args) {
    if (a === pre) return true;
    if (a.startsWith(`${pre}=`)) return a.slice(pre.length + 1);
  }
  return def;
};

const url = ENV.SUPABASE_URL || ENV.VITE_SUPABASE_URL;
const key = ENV.SUPABASE_SERVICE_KEY || ENV.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { log(c.red('✖ Faltam SUPABASE_URL / SUPABASE_SERVICE_KEY no .env da raiz.')); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s) => strip(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const chaveDe = (plat, title) => `${norm(plat)}|${norm(title)}`;
/* região da cópia -> rótulo do contrato */
const REGIAO = { 'ntsc-u': 'USA', usa: 'USA', us: 'USA', pal: 'EUR', eur: 'EUR', europe: 'EUR', 'ntsc-j': 'JPN', jpn: 'JPN', japan: 'JPN' };
const regiaoDe = (r) => (r ? (REGIAO[norm(r)] ?? r) : undefined);

async function fetchAll(build) {
  const PAGE = 1000; const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function resolveUser(username) {
  if (!username) { log(c.red('✖ Informe --user=<username>.')); process.exit(1); }
  const { data } = await sb.from('profiles').select('id, username').eq('username', username).maybeSingle();
  if (!data) { log(c.red(`✖ Usuário "${username}" não encontrado.`)); process.exit(1); }
  return data.id;
}

/** Monta o array do contrato a partir do estado do usuário. */
async function construir(userId, onlyPlat) {
  const copies = await fetchAll(() => sb.from('game_copies')
    .select('game_id, platform, region, created_at').eq('user_id', userId));
  const tracks = await fetchAll(() => sb.from('game_tracks')
    .select('game_id, status, platform, updated_at').eq('user_id', userId));
  const gameIds = [...new Set([...copies.map((x) => x.game_id), ...tracks.map((x) => x.game_id)])];
  const games = new Map();
  for (let i = 0; i < gameIds.length; i += 300) {
    const { data } = await sb.from('games').select('id, title, platforms').in('id', gameIds.slice(i, i + 300));
    for (const g of data ?? []) games.set(g.id, g);
  }

  // uma entrada por (jogo, plataforma). Copy => possui; track backlog => quero.
  const map = new Map();
  const put = (gameId, plat, possui, quando, regiao) => {
    const g = games.get(gameId); if (!g || !plat) return;
    const k = `${gameId}|${plat}`;
    const prev = map.get(k);
    const entry = prev ?? {
      chave: chaveDe(plat, g.title), titulo: g.title, plataforma: plat,
      regiao: regiao ?? undefined, possui, romvault_status: possui ? 'have' : 'want',
      atualizado_em: quando,
    };
    entry.possui = entry.possui || possui;
    entry.romvault_status = entry.possui ? 'have' : 'want';
    if (quando && (!entry.atualizado_em || quando > entry.atualizado_em)) entry.atualizado_em = quando;
    if (regiao && !entry.regiao) entry.regiao = regiao;
    map.set(k, entry);
  };
  for (const cp of copies) put(cp.game_id, cp.platform, true, cp.created_at, regiaoDe(cp.region));
  for (const tr of tracks) {
    const g = games.get(tr.game_id);
    const plat = tr.platform ?? (g?.platforms ?? [])[0];
    put(tr.game_id, plat, tr.status !== 'backlog', tr.updated_at);
  }

  let list = [...map.values()];
  if (onlyPlat) list = list.filter((e) => norm(e.plataforma) === norm(onlyPlat));
  list.sort((a, b) => a.chave.localeCompare(b.chave));
  return list;
}

async function cmdExport() {
  const userId = await resolveUser(flag('user'));
  const onlyPlat = flag('platform') && flag('platform') !== true ? String(flag('platform')) : null;
  const list = await construir(userId, onlyPlat);
  const possui = list.filter((e) => e.possui).length;
  log(c.cyan(`\n▸ Export ConectaX — ${list.length} entradas (${possui} possui / ${list.length - possui} quero)${onlyPlat ? ` · ${onlyPlat}` : ''}`));

  const out = flag('out');
  const json = JSON.stringify(list, null, 2);
  if (out && out !== true) {
    writeFileSync(resolve(process.cwd(), String(out)), json);
    log(c.green(`  ✓ salvo em ${out}`));
  } else {
    log('\n' + json.slice(0, 1600) + (json.length > 1600 ? c.dim('\n  … (use --out=arquivo.json p/ salvar tudo)') : ''));
  }
}

async function cmdImport() {
  const userId = await resolveUser(flag('user'));
  const inPath = flag('in');
  if (!inPath || inPath === true) { log(c.red('✖ Informe --in=arquivo.json.')); process.exit(1); }
  const apply = Boolean(flag('apply', false)); // sem --apply = DRY-RUN
  let incoming;
  try { incoming = JSON.parse(readFileSync(resolve(process.cwd(), String(inPath)), 'utf8')); }
  catch (e) { log(c.red(`✖ Não consegui ler o JSON: ${e.message}`)); process.exit(1); }
  if (!Array.isArray(incoming)) { log(c.red('✖ O arquivo deve ser um ARRAY de jogos.')); process.exit(1); }

  // índice do catálogo por TÍTULO normalizado (com as plataformas). Casar por
  // título é mais robusto que exigir a string de plataforma idêntica dos dois
  // lados; a plataforma vira só o desempate quando há vários jogos homônimos.
  const catalog = await fetchAll(() => sb.from('games').select('id, title, platforms'));
  const byTitle = new Map();
  for (const g of catalog) {
    const k = norm(g.title);
    const arr = byTitle.get(k) ?? [];
    arr.push({ id: g.id, plats: new Set((g.platforms ?? []).map(norm)) });
    byTitle.set(k, arr);
  }
  const matchGame = (it) => {
    const parts = String(it.chave ?? '').split('|');
    const title = norm(it.titulo || parts[1] || '');
    const plat = norm(it.plataforma || parts[0] || '');
    const cands = byTitle.get(title);
    if (!cands || cands.length === 0) return null;
    if (cands.length === 1) return cands[0].id;
    return (cands.find((cc) => cc.plats.has(plat)) ?? cands[0]).id;
  };

  // tracks atuais do usuário (o track é por JOGO, não por plataforma)
  const tracks = await fetchAll(() => sb.from('game_tracks').select('game_id, status, updated_at').eq('user_id', userId));
  const trackByGame = new Map(tracks.map((t) => [t.game_id, t]));

  // agrupa incoming por game_id do catálogo (várias plataformas => 1 jogo)
  const wanted = new Map(); // game_id -> { possui, quando, exemplos:[] }
  const unmatched = [];
  for (const it of incoming) {
    const gid = matchGame(it);
    if (!gid) { unmatched.push(it.titulo ?? it.chave); continue; }
    const w = wanted.get(gid) ?? { possui: false, quando: null };
    w.possui = w.possui || Boolean(it.possui);
    if (it.atualizado_em && (!w.quando || it.atualizado_em > w.quando)) w.quando = it.atualizado_em;
    wanted.set(gid, w);
  }

  const rep = { added: [], updated: [], conflicts: [], unchanged: 0 };
  const ops = [];
  for (const [gid, w] of wanted) {
    const cur = trackByGame.get(gid);
    const desejado = w.possui ? 'owned' : 'backlog';       // possui -> tenho; !possui -> quero
    const nossoPossui = cur ? cur.status !== 'backlog' : null;
    if (!cur) { rep.added.push(gid); ops.push({ gid, status: desejado }); continue; }
    if (nossoPossui === w.possui) { rep.unchanged++; continue; }
    // divergência: última-escrita-vence por data
    const nosso = cur.updated_at ?? '';
    const deles = w.quando ?? '';
    if (deles > nosso) {
      // não rebaixa quem já zerou/está jogando; só troca entre owned<->backlog
      const novo = w.possui ? (['playing', 'finished', 'abandoned'].includes(cur.status) ? cur.status : 'owned') : 'backlog';
      if (novo !== cur.status) { rep.updated.push(gid); ops.push({ gid, status: novo }); }
      else rep.unchanged++;
    } else {
      rep.conflicts.push({ gid, nosso: cur.status, deles: w.possui ? 'have' : 'want' });
    }
  }

  log(c.cyan(`\n▸ Import ConectaX ${apply ? c.green('(APLICANDO)') : c.amber('(DRY-RUN — nada gravado)')}`));
  log(`  ${incoming.length} recebidos · ${c.green(rep.added.length + ' novos')} · ${c.cyan(rep.updated.length + ' atualizados')} · ${c.amber(rep.conflicts.length + ' conflitos')} · ${rep.unchanged} sem mudança · ${unmatched.length} sem match no catálogo`);
  if (rep.conflicts.length) log(c.amber(`  conflitos (mantido o nosso; a data deles é mais velha): ${rep.conflicts.length}`));
  if (unmatched.length) log(c.dim(`  sem match (amostra): ${unmatched.slice(0, 6).join(' · ')}`));

  if (apply && ops.length) {
    const now = new Date().toISOString();
    for (let i = 0; i < ops.length; i += 200) {
      const rows = ops.slice(i, i + 200).map((o) => ({ user_id: userId, game_id: o.gid, status: o.status, source: 'conectax', updated_at: now }));
      const { error } = await sb.from('game_tracks').upsert(rows, { onConflict: 'user_id,game_id' });
      if (error) { log(c.red(`  ✖ upsert: ${error.message}`)); process.exit(1); }
    }
    log(c.green(`  ✓ ${ops.length} tracks gravados.`));
  } else if (!apply && ops.length) {
    log(c.dim(`  (rode de novo com --apply pra gravar os ${ops.length} novos/atualizados)`));
  }
}

if (cmd === 'export') await cmdExport();
else if (cmd === 'import') await cmdImport();
else {
  log('Uso:');
  log('  npm run conectax export -- --user=<username> [--platform=SNES] [--out=jogos.json]');
  log('  npm run conectax import -- --user=<username> --in=jogos.json [--apply]');
  process.exit(cmd ? 1 : 0);
}
