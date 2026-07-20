/**
 * ROMVault — carga inicial dos DADOS TÉCNICOS das plataformas (Wikipedia EN).
 *
 * Não é "copiar a Wikipedia": pega descrição curta + imagem do console + campos
 * TÉCNICOS do infobox (fabricante, geração, mídia, unidades, datas por região,
 * CPU/RAM), limpa o markup e grava em `platforms`. Depois o admin ajusta pela
 * página da plataforma (inclusive troca a imagem).
 *
 *   npm run import -- --source=platform-wiki --dry
 *   npm run import -- --source=platform-wiki --platform=snes
 *   npm run import -- --source=platform-wiki --force   # regrava quem já tem
 *
 * Sem chave (API pública da Wikipedia). Gentil: ~1 plataforma/seg.
 */

const UA = 'ROMVault/1.0 (https://romvault.app) plataforma-wiki';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* slug -> título exato do artigo (só onde o full_name não resolve sozinho) */
const WIKI_TITLE = {
  ps1: 'PlayStation (console)', ps2: 'PlayStation 2', ps3: 'PlayStation 3',
  ps4: 'PlayStation 4', ps5: 'PlayStation 5', psp: 'PlayStation Portable', 'ps-vita': 'PlayStation Vita',
  genesis: 'Sega Genesis', 'sega-cd': 'Sega CD', '32x': '32X', 'master-system': 'Master System',
  'game-gear': 'Game Gear', saturn: 'Sega Saturn', dreamcast: 'Dreamcast', 'sg-1000': 'SG-1000',
  'tg-16': 'TurboGrafx-16', 'tg-cd': 'TurboGrafx-CD', supergrafx: 'PC Engine SuperGrafx',
  'pc-fx': 'PC-FX', 'pc-98': 'PC-9800 series',
  'neo-geo': 'Neo Geo (system)', 'neo-geo-cd': 'Neo Geo CD', 'neo-geo-pocket': 'Neo Geo Pocket',
  fds: 'Family Computer Disk System', 'pokemon-mini': 'Pokémon Mini', 'virtual-boy': 'Virtual Boy',
  'xbox-series': 'Xbox Series X and Series S', 'xbox-one': 'Xbox One',
  pc: 'Personal computer', dos: 'MS-DOS', mac: 'Macintosh', linux: 'Linux', arcade: 'Arcade video game',
  amiga: 'Amiga', c64: 'Commodore 64', msx: 'MSX', '3do': '3DO Interactive Multiplayer',
  colecovision: 'ColecoVision', intellivision: 'Intellivision', wonderswan: 'WonderSwan',
  jaguar: 'Atari Jaguar', lynx: 'Atari Lynx',
};

/* região no template {{Video game release}} -> nossa chave curta */
const REGION_MAP = {
  JP: 'jp', JPN: 'jp', NA: 'na', US: 'na', USA: 'na', EU: 'eu', PAL: 'eu', UK: 'eu',
  AU: 'au', AUS: 'au', BR: 'br', BRA: 'br', WW: 'ww', KOR: 'kr', KR: 'kr',
};

/** Limpa markup de wikitext: refs, links, templates simples, tags. */
export function clean(v) {
  if (!v) return null;
  let s = String(v);
  s = s.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ''); // refs
  s = s.replace(/\{\{(?:nowrap|nobr)\|([^{}]*)\}\}/gi, '$1');
  s = s.replace(/\{\{(?:cvt|convert)\|([^{}|]*)\|([^{}|]*)[^{}]*\}\}/gi, '$1 $2');
  s = s.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[([^\]]*)\]\]/g, '$1'); // [[a|b]]->b, [[a]]->a
  s = s.replace(/<br\s*\/?>/gi, '; ').replace(/<[^>]+>/g, ''); // tags
  s = s.replace(/'''?/g, '').replace(/&nbsp;/g, ' ');
  s = s.replace(/\{\{[^{}]*\}\}/g, ''); // templates residuais
  s = s.replace(/[{}]+/g, ' '); // chaves órfãs (wrapper que sobrou)
  s = s.replace(/\s+/g, ' ').replace(/^[;,\s]+|[;,\s]+$/g, '').trim();
  return s || null;
}

/** Pega o valor cru de um campo do infobox (respeita templates aninhados). */
export function rawField(ib, name) {
  const re = new RegExp(`\\n\\s*\\|\\s*${name.replace(/ /g, '[ _]?')}\\s*=\\s*`, 'i');
  const m = ib.match(re);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 0;
  let out = '';
  for (; i < ib.length; i++) {
    const ch = ib[i];
    const two = ib.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; out += two; i++; continue; }
    if (two === '}}' || two === ']]') { depth--; out += two; i++; continue; }
    if (ch === '\n' && depth <= 0 && /\n\s*\|/.test(ib.slice(i, i + 4))) break;
    if (ch === '\n' && depth <= 0) break;
    out += ch;
  }
  return out.trim();
}

/** Extrai {região: data} do valor de "released" (template Video game release).
 *  `raw` já vem com chaves balanceadas (rawField), então dá pra processar direto:
 *  converte {{start date|Y|M|D}} em texto, tira refs/cite e o wrapper, e casa
 *  os pares REGIÃO|valor. */
export function parseReleases(raw) {
  if (!raw) return {};
  let body = String(raw);
  // {{start date|1990|11|21|df=y}} / {{Start date and age|...}} -> 1990-11-21
  body = body.replace(
    /\{\{\s*(?:start date(?: and age)?|dts)\s*\|\s*(\d{4})(?:\s*\|\s*(\d{1,2}))?(?:\s*\|\s*(\d{1,2}))?[^{}]*\}\}/gi,
    (_, y, m, d) => [y, m && String(m).padStart(2, '0'), d && String(d).padStart(2, '0')].filter(Boolean).join('-'),
  );
  body = body.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  body = body.replace(/\{\{\s*(?:Video game release|vgrelease|vgr)\b/i, '').replace(/\}\}\s*$/, '');
  body = body.replace(/\{\{[^{}]*\}\}/g, ''); // cite/efn residuais (já sem aninhamento)
  const parts = body.split('|').map((x) => x.trim()).filter(Boolean);
  const out = {};
  for (let i = 0; i < parts.length - 1; i++) {
    const reg = REGION_MAP[parts[i].toUpperCase().replace(/[^A-Z]/g, '')];
    if (reg && !out[reg]) {
      const val = clean(parts[i + 1]);
      if (val && !/^[\d\s]{0,2}$/.test(val)) out[reg] = val; // ignora lixo curtinho
    }
  }
  return out;
}

async function wiki(title) {
  // 1) resumo (descrição + imagem + url canônica)
  const sres = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
    headers: { 'User-Agent': UA },
  });
  if (!sres.ok) return null;
  const s = await sres.json();
  if (s.type === 'disambiguation') return null;
  // 2) infobox (wikitext) pros campos técnicos
  const wres = await fetch(
    `https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&formatversion=2&redirects=1&page=${encodeURIComponent(title)}`,
    { headers: { 'User-Agent': UA } },
  );
  const wj = wres.ok ? await wres.json() : null;
  const wt = String(wj?.parse?.wikitext ?? '');
  const start = wt.indexOf('{{Infobox');
  const ib = start >= 0 ? wt.slice(start, start + 6500) : '';
  return { summary: s, ib };
}

export async function importPlatformWiki(ctx) {
  const { sb, flag, DRY, log, c, step, itemLog, fetchAll } = ctx;
  const only = flag('platform') && flag('platform') !== true ? String(flag('platform')).toLowerCase() : null;
  const force = Boolean(flag('force', false));

  step('Detalhes das plataformas via Wikipedia');
  let plats = await fetchAll(() => sb.from('platforms').select('slug, name, full_name, description'));
  if (only) plats = plats.filter((p) => p.slug === only || p.name.toLowerCase() === only);
  if (!force) plats = plats.filter((p) => !p.description); // só quem falta
  log(`  ${plats.length} plataforma(s) pra buscar`);

  const stats = { preenchidas: 0, sem_artigo: 0 };
  for (const p of plats) {
    const title = WIKI_TITLE[p.slug] ?? p.full_name ?? p.name;
    let data = await wiki(title);
    // fallback: tenta o nome curto se o full_name não achou
    if (!data && title !== p.name) data = await wiki(p.name);
    await sleep(900);
    if (!data) { stats.sem_artigo++; itemLog(stats.sem_artigo, c.amber(`  – sem artigo: ${p.name} (${title})`)); continue; }

    const { summary, ib } = data;
    const desc = clean(summary.extract)?.slice(0, 700) ?? null;
    const releases = parseReleases(rawField(ib, 'released') ?? rawField(ib, 'releasedate') ?? rawField(ib, 'release date'));
    const specs = {};
    for (const [k, f] of [['cpu', 'cpu'], ['memory', 'memory'], ['storage', 'storage'], ['display', 'display'], ['sound', 'sound'], ['controllers', 'input']]) {
      const v = clean(rawField(ib, f));
      if (v) specs[k] = v.slice(0, 160);
    }
    const patch = {
      description: desc,
      image_url: summary.originalimage?.source ?? summary.thumbnail?.source ?? null,
      wikipedia_url: summary.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      manufacturer: clean(rawField(ib, 'manufacturer'))?.slice(0, 120) ?? null,
      generation: clean(rawField(ib, 'generation'))?.slice(0, 80) ?? null,
      media: clean(rawField(ib, 'media'))?.slice(0, 160) ?? null,
      units_sold: clean(rawField(ib, 'units sold'))?.slice(0, 160) ?? null,
      discontinued: Object.keys(parseReleases(rawField(ib, 'discontinued'))).length
        ? JSON.stringify(parseReleases(rawField(ib, 'discontinued')))
        : clean(rawField(ib, 'discontinued'))?.slice(0, 160) ?? null,
      releases,
      specs,
    };
    // discontinued: se virou json de regiões, guarda texto legível
    if (patch.discontinued && patch.discontinued.startsWith('{')) {
      try { patch.discontinued = Object.entries(JSON.parse(patch.discontinued)).map(([r, d]) => `${r.toUpperCase()}: ${d}`).join(' · '); } catch { /* mantém */ }
    }

    if (DRY) {
      stats.preenchidas++;
      itemLog(stats.preenchidas, `  ${c.dim('[dry]')} ${p.name} — ${patch.manufacturer ?? '?'} · ${patch.generation ?? '?'} · rel ${Object.keys(releases).join('/') || '-'}`);
      continue;
    }
    const { error } = await sb.from('platforms').update(patch).eq('slug', p.slug);
    if (error) { log(c.red(`  ✖ ${p.name}: ${error.message}`)); continue; }
    stats.preenchidas++;
    itemLog(stats.preenchidas, `  ${c.green('~')} ${p.name} ${c.dim(`(${patch.manufacturer ?? '?'} · ${patch.generation ?? '?'})`)}`);
  }
  return stats;
}
