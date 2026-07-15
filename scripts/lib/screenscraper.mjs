/**
 * ROMVault — mídia rica via ScreenScraper.fr (box 2D/3D, foto do cartucho).
 *
 * Requer credenciais no .env da raiz (ver docs/pesquisa-capas.md):
 *   SS_DEVID / SS_DEVPASSWORD   (registro de desenvolvedor — aprovação da equipe:
 *                                https://www.screenscraper.fr → Forum → API)
 *   SS_USER / SS_PASSWORD       (sua conta normal de usuário)
 *
 *   npm run import -- --source=screenscraper --inspect        # lista sistemas/ids
 *   npm run import -- --source=screenscraper --platform=snes --limit=50 --dry
 *   npm run import -- --source=screenscraper --platform=snes  # box3D+box2D
 *
 * Busca por TÍTULO (jeuRecherche). Preenche cover_url (box-2D) só quando falta,
 * e guarda box-3D/foto do suporte em games.metadata (pra vitrine física usar).
 * Mídia é COPIADA pro nosso Storage. Quota: ~20k req/dia, 1 thread — pausa 1.2s.
 */

const API = 'https://api.screenscraper.fr/api2';

const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* nomes dos nossos sistemas p/ casar com os nomes do systemesListe */
const SYSTEM_NAMES = {
  SNES: ['super nintendo'], NES: ['nintendo entertainment system', 'nes'],
  N64: ['nintendo 64'], GameCube: ['gamecube'], Wii: ['wii'],
  'Game Boy': ['game boy'], GBC: ['game boy color'], GBA: ['game boy advance'],
  NDS: ['nintendo ds'], FDS: ['family computer disk system', 'famicom disk'],
  Genesis: ['megadrive', 'mega drive', 'genesis'], 'Master System': ['master system'],
  'Game Gear': ['game gear'], 'Sega CD': ['mega cd', 'sega cd'], '32X': ['32x'],
  Saturn: ['saturn'], Dreamcast: ['dreamcast'],
  PS1: ['playstation'], PS2: ['playstation 2'], PSP: ['psp'],
  'TG-16': ['pc engine'], 'Neo Geo': ['neo geo'],
};

function creds(ENV) {
  const { SS_DEVID, SS_DEVPASSWORD, SS_USER, SS_PASSWORD } = ENV;
  if (!SS_DEVID || !SS_DEVPASSWORD || !SS_USER || !SS_PASSWORD) return null;
  return { devid: SS_DEVID, devpassword: SS_DEVPASSWORD, ssid: SS_USER, sspassword: SS_PASSWORD };
}

function qs(params) {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
}

async function ssJson(path, params, log, c) {
  const url = `${API}/${path}?${qs({ ...params, softname: 'romvault', output: 'json' })}`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok || text.startsWith('Erreur')) {
    log(c.red(`  ✖ ScreenScraper ${path}: ${res.status} ${text.slice(0, 120)}`));
    return null;
  }
  try { return JSON.parse(text); } catch { return null; }
}

/** Resolve o systemeid do ScreenScraper pela lista oficial (sem chutar ids). */
async function resolveSystemId(auth, ourPlatform, log, c) {
  const data = await ssJson('systemesListe.php', auth, log, c);
  const systems = data?.response?.systemes ?? [];
  const wanted = SYSTEM_NAMES[ourPlatform];
  if (!wanted) return null;
  for (const s of systems) {
    const names = [s?.noms?.nom_eu, s?.noms?.nom_us, s?.noms?.nom_recalbox, s?.noms?.nom_retropie]
      .filter(Boolean).map(norm);
    if (names.some((n) => wanted.some((w) => n.includes(norm(w))))) return Number(s.id);
  }
  return null;
}

function pickMedia(medias, type, region) {
  const list = (medias ?? []).filter((m) => m?.type === type);
  if (list.length === 0) return null;
  const ranked = ['us', 'wor', 'eu', 'br', 'jp', 'ss'];
  const start = region ? [region, ...ranked] : ranked;
  for (const r of start) {
    const hit = list.find((m) => m.region === r);
    if (hit?.url) return hit.url;
  }
  return list[0]?.url ?? null;
}

export async function importScreenscraper(ctx) {
  const { sb, flag, DRY, log, c, step, itemLog, fetchAll, ENV } = ctx;
  const auth = creds(ENV);
  if (!auth) {
    log(c.red('✖ Credenciais do ScreenScraper ausentes no .env da raiz:'));
    log('    SS_DEVID=...        SS_DEVPASSWORD=...   (conta dev — pedir aprovação em screenscraper.fr)');
    log('    SS_USER=...         SS_PASSWORD=...      (sua conta normal)');
    log('  Enquanto isso, use --source=covers-libretro (sem chave).');
    process.exit(1);
  }

  if (flag('inspect')) {
    step('Sistemas do ScreenScraper');
    const data = await ssJson('systemesListe.php', auth, log, c);
    for (const s of data?.response?.systemes ?? []) {
      log(`  ${String(s.id).padStart(4)}  ${s?.noms?.nom_eu ?? s?.noms?.nom_us ?? '?'}`);
    }
    return { ok: 1 };
  }

  const rawPlat = flag('platform');
  const ourPlatform = rawPlat && rawPlat !== true ? String(rawPlat) : 'SNES';
  const platKey = Object.keys(SYSTEM_NAMES).find((k) => norm(k) === norm(ourPlatform)) ?? ourPlatform;
  const limit = Number(flag('limit', 100)) || 100;

  step(`ScreenScraper — ${platKey} (box 2D/3D + suporte)`);
  const systemId = await resolveSystemId(auth, platKey, log, c);
  if (!systemId) { log(c.red(`✖ sistema não mapeado: ${platKey}`)); process.exit(1); }
  log(`  systemeid: ${systemId}`);

  // jogos da plataforma sem box3d nos metadados (ou sem capa)
  const games = (await fetchAll(() =>
    sb.from('games').select('id, title, platforms, cover_url, metadata').contains('platforms', [platKey])))
    .filter((g) => !(g.metadata && g.metadata.box3d))
    .slice(0, limit);
  log(`  ${games.length} jogos nesta leva`);

  const stats = { box2d: 0, box3d: 0, sem_match: 0, erros: 0 };
  for (const g of games) {
    await sleep(1200); // 1 thread, quota diária — sem pressa
    const data = await ssJson('jeuRecherche.php', { ...auth, systemeid: systemId, recherche: g.title }, log, c);
    const jeux = data?.response?.jeux ?? [];
    const hit = jeux.find((j) => {
      const names = [j?.noms?.map?.((n) => n.text), j?.nom].flat().filter(Boolean);
      return names.some((n) => norm(n) === norm(g.title));
    }) ?? jeux[0];
    if (!hit) { stats.sem_match++; continue; }

    const box2d = pickMedia(hit.medias, 'box-2D');
    const box3d = pickMedia(hit.medias, 'box-3D');
    const support = pickMedia(hit.medias, 'support-2D');
    if (!box2d && !box3d) { stats.sem_match++; continue; }

    if (DRY) {
      itemLog(stats.box3d + 1, `  ${c.dim('[dry]')} ${g.title} ${c.dim(`box2d:${box2d ? 'sim' : '-'} box3d:${box3d ? 'sim' : '-'}`)}`);
      if (box3d) stats.box3d++;
      if (box2d) stats.box2d++;
      continue;
    }

    try {
      const patch = { metadata: { ...(g.metadata ?? {}) } };
      // copia cada mídia pro nosso storage
      for (const [kind, url] of [['box2d', box2d], ['box3d', box3d], ['support', support]]) {
        if (!url) continue;
        const imgRes = await fetch(`${url}&${qs(auth)}`);
        if (!imgRes.ok) continue;
        const bytes = new Uint8Array(await imgRes.arrayBuffer());
        const path = `covers/screenscraper/${norm(platKey).replace(/\s+/g, '-')}/${norm(g.title).replace(/\s+/g, '-')}-${kind}.png`;
        const { error: upErr } = await sb.storage.from('uploads')
          .upload(path, bytes, { contentType: 'image/png', upsert: true });
        if (upErr) continue;
        const publicUrl = sb.storage.from('uploads').getPublicUrl(path).data.publicUrl;
        if (kind === 'box2d') {
          if (!g.cover_url) await sb.from('games').update({ cover_url: publicUrl, thumbnail: publicUrl }).eq('id', g.id);
          stats.box2d++;
        } else {
          patch.metadata[kind] = publicUrl;
          if (kind === 'box3d') stats.box3d++;
        }
      }
      patch.metadata.media_source = 'screenscraper';
      await sb.from('games').update(patch).eq('id', g.id);
      itemLog(stats.box3d, `  ${c.green('~')} ${g.title}`);
    } catch (err) {
      stats.erros++;
      if (stats.erros <= 3) log(c.red(`  ✖ ${g.title}: ${err.message}`));
    }
  }
  return stats;
}
