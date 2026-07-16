/**
 * ROMVault — capas de caixa (box art) via libretro-thumbnails.
 *
 * CDN estático GRÁTIS (sem chave): thumbnails.libretro.com, uma pasta por
 * sistema com Named_Boxarts/*.png nomeados no padrão No-Intro/Redump.
 *
 *   npm run import -- --source=covers-libretro --platform=snes --dry
 *   npm run import -- --source=covers-libretro                # todas mapeadas
 *   npm run import -- --source=covers-libretro --limit=300
 *
 * Estratégia (docs/pesquisa-capas.md): baixa a LISTAGEM da pasta do sistema,
 * monta índice `título normalizado -> arquivo exato` e casa por título
 * (preferindo região USA > World > Europe > Japan). O PNG é copiado pro NOSSO
 * Supabase Storage (uploads/covers/...) — sem hotlink no CDN deles.
 */

const BASE = 'https://thumbnails.libretro.com';

/* nossa plataforma -> pasta do libretro-thumbnails */
const SYSTEM_DIR = {
  'SNES': 'Nintendo - Super Nintendo Entertainment System',
  'NES': 'Nintendo - Nintendo Entertainment System',
  'N64': 'Nintendo - Nintendo 64',
  'GameCube': 'Nintendo - GameCube',
  'Wii': 'Nintendo - Wii',
  'Game Boy': 'Nintendo - Game Boy',
  'GBC': 'Nintendo - Game Boy Color',
  'GBA': 'Nintendo - Game Boy Advance',
  'NDS': 'Nintendo - Nintendo DS',
  '3DS': 'Nintendo - Nintendo 3DS',
  'Virtual Boy': 'Nintendo - Virtual Boy',
  'FDS': 'Nintendo - Family Computer Disk System',
  'Genesis': 'Sega - Mega Drive - Genesis',
  'Master System': 'Sega - Master System - Mark III',
  'Game Gear': 'Sega - Game Gear',
  'Sega CD': 'Sega - Mega-CD - Sega CD',
  '32X': 'Sega - 32X',
  'Saturn': 'Sega - Saturn',
  'Dreamcast': 'Sega - Dreamcast',
  'PS1': 'Sony - PlayStation',
  'PS2': 'Sony - PlayStation 2',
  'PSP': 'Sony - PlayStation Portable',
  'TG-16': 'NEC - PC Engine - TurboGrafx 16',
  'Neo Geo': 'SNK - Neo Geo',
  'WonderSwan': 'Bandai - WonderSwan',
  'MSX': 'Microsoft - MSX',
  'Atari 2600': 'Atari - 2600',
};

/* preferência de região quando há várias versões do mesmo título */
const REGION_RANK = ['(usa', '(world', '(europe', '(brazil', '(japan'];

const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Normaliza o nome de arquivo No-Intro p/ chave de match (sem região/tags). */
function keyFromFilename(name) {
  let t = name.replace(/\.png$/i, '');
  t = t.replace(/\s*\([^)]*\)/g, ''); // remove (USA), (Rev 1), ...
  // "Legend of Zelda, The" -> "The Legend of Zelda"
  const m = t.match(/^(.*), (The|A|An)(\s+-\s+.*)?$/i);
  if (m) t = `${m[2]} ${m[1]}${m[3] ?? ''}`;
  return norm(t);
}

function regionScore(filename) {
  const f = filename.toLowerCase();
  const i = REGION_RANK.findIndex((r) => f.includes(r));
  return i === -1 ? REGION_RANK.length : i;
}

/** Baixa e parseia a listagem HTML de Named_Boxarts de um sistema. */
async function fetchIndex(systemDir, log, c) {
  const url = `${BASE}/${encodeURIComponent(systemDir)}/Named_Boxarts/`;
  const res = await fetch(url);
  if (!res.ok) { log(c.amber(`  (listagem indisponivel p/ ${systemDir}: HTTP ${res.status})`)); return null; }
  const html = await res.text();
  const files = [...html.matchAll(/href="([^"]+\.png)"/gi)].map((m) => decodeURIComponent(m[1]));
  const index = new Map(); // key -> melhor arquivo
  for (const f of files) {
    const key = keyFromFilename(f);
    if (!key) continue;
    const prev = index.get(key);
    if (!prev || regionScore(f) < regionScore(prev)) index.set(key, f);
  }
  return index;
}

export async function importCoversLibretro(ctx) {
  const { sb, flag, DRY, log, c, step, itemLog, fetchAll } = ctx;
  const only = flag('platform') ? String(flag('platform')).toUpperCase() : null;
  const limit = Number(flag('limit', 0)) || 0;

  step('Capas via libretro-thumbnails');
  const games = await fetchAll(() =>
    sb.from('games').select('id, title, platforms, metadata').is('cover_url', null));
  log(`  ${games.length} jogos sem capa no catalogo`);

  // agrupa jogos sem capa por plataforma mapeada
  const byPlatform = new Map();
  for (const g of games) {
    for (const p of g.platforms ?? []) {
      const dir = SYSTEM_DIR[p];
      if (!dir) continue;
      if (only && p.toUpperCase() !== only && norm(p) !== norm(only)) continue;
      byPlatform.set(p, [...(byPlatform.get(p) ?? []), g]);
      break; // um sistema por jogo basta
    }
  }
  if (byPlatform.size === 0) {
    log(c.amber('  nada a fazer (nenhum jogo sem capa em plataformas mapeadas)'));
    return { preenchidos: 0 };
  }

  const stats = { preenchidos: 0, sem_match: 0, erros: 0 };
  let total = 0;

  for (const [platform, list] of byPlatform) {
    if (limit && total >= limit) break;
    const dir = SYSTEM_DIR[platform];
    step(`${platform} — ${list.length} jogos sem capa`);
    const index = await fetchIndex(dir, log, c);
    if (!index) continue;
    log(`  indice: ${index.size} boxarts disponiveis`);

    for (const g of list) {
      if (limit && total >= limit) break;
      const file = index.get(norm(g.title));
      if (!file) { stats.sem_match++; continue; }
      total++;

      if (DRY) { stats.preenchidos++; itemLog(stats.preenchidos, `  ${c.dim('[dry]')} ${g.title} -> ${file}`); continue; }

      try {
        // baixa o PNG e copia pro NOSSO storage (nada de hotlink)
        const imgRes = await fetch(`${BASE}/${encodeURIComponent(dir)}/Named_Boxarts/${encodeURIComponent(file)}`);
        if (!imgRes.ok) { stats.erros++; continue; }
        const bytes = new Uint8Array(await imgRes.arrayBuffer());
        // chave do Storage 100% segura: so [a-z0-9-] (parenteses/apostrofos
        // davam "Bad Request" no upload)
        const safeName = norm(file.replace(/\.png$/i, '')).replace(/\s+/g, '-') || 'cover';
        const path = `covers/libretro/${norm(platform).replace(/\s+/g, '-')}/${safeName}.png`;
        const { error: upErr } = await sb.storage.from('uploads')
          .upload(path, bytes, { contentType: 'image/png', upsert: true });
        if (upErr) { stats.erros++; if (stats.erros <= 3) log(c.red(`  ✖ upload ${file}: ${upErr.message}`)); continue; }
        const publicUrl = sb.storage.from('uploads').getPublicUrl(path).data.publicUrl;

        // box art física vai pra metadata.boxart (material da vitrine);
        // vira capa TAMBÉM porque este jogo não tinha nenhuma (fallback)
        await sb.from('games').update({
          cover_url: publicUrl,
          thumbnail: publicUrl,
          metadata: { ...(g.metadata ?? {}), boxart: publicUrl, cover_source: 'libretro-thumbnails' },
        }).eq('id', g.id);
        stats.preenchidos++;
        itemLog(stats.preenchidos, `  ${c.green('~')} ${g.title} ${c.dim(`<- ${file}`)}`);
        await new Promise((r) => setTimeout(r, 120)); // gentileza com o CDN
      } catch (err) {
        stats.erros++;
        if (stats.erros <= 3) log(c.red(`  ✖ ${g.title}: ${err.message}`));
      }
    }
  }

  if (DRY) log(c.amber('\n(dry-run — nada foi baixado/escrito)'));
  return stats;
}
