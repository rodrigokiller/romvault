/**
 * ROMVault — importador de TRILHAS SONORAS (Discogs).
 *
 * A regra da casa aqui é: NÃO chutar. O modelo é o mesmo que já provou valer no
 * Metacritic — só aceita o que passa em critérios objetivos, e prefere não
 * cadastrar nada a cadastrar errado.
 *
 *   npm run import -- --source=soundtracks --sample --limit=20 --dry   # AFERIR
 *   npm run import -- --source=soundtracks --limit=200                 # valendo
 *   npm run import -- --source=soundtracks --platform=SNES
 *
 * O filtro que torna isso viável é o style="Video Game Music" do Discogs
 * (achado do Killer): "celeste" cai de 21.992 para 10 resultados. Sobre isso a
 * gente ainda exige que o título do jogo apareça no álbum e usa o ano + o
 * "have" da comunidade pra escolher o canônico.
 *
 * .env da raiz: DISCOGS_TOKEN (grátis; sobe o limite de 25 p/ 60 req/min).
 */

const DG = 'https://api.discogs.com';
const STYLE = 'Video Game Music';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* palavras que indicam álbum OFICIAL do jogo (e não tributo/arranjo de fã) */
const OFICIAL = /(original|soundtrack|ost|sound track|sound version|game music|score)/i;
/* e as que indicam que NÃO é a trilha canônica */
const DERIVADO = /(remix|arrange|tribute|cover|piano collection|inspired|karaoke|lo-?fi|recreat|re-?record|remake of|selection)/i;

/*
 * Palavras "de embalagem": aparecem no nome do álbum sem mudar de QUAL jogo ele
 * é. Tudo que sobrar depois de tirar o título do jogo e estas aqui é sinal de
 * que o álbum é de OUTRO jogo — foi assim que "Doom" (1993) puxava a trilha do
 * Doom de 2016, "Sonic the Hedgehog" puxava Sonic CD e "Tetris" puxava Tetris
 * Effect. Aferido em 20 jogos: sem esta regra o acerto era 70%; com ela mais a
 * guarda de ano, 13 de 13 escolhas certas (100% de precisão, 65% de cobertura).
 */
const EMBALAGEM = new Set([
  'original', 'originals', 'soundtrack', 'soundtracks', 'ost', 'osts', 'sound',
  'sounds', 'track', 'tracks', 'version', 'versions', 'game', 'games', 'music',
  'score', 'scores', 'the', 'a', 'of', 'and', 'vol', 'volume', 'disc', 'cd',
  'edition', 'complete', 'full', 'deluxe', 'expanded', 'remastered', 'remaster',
  'collection', 'anthology', 'plus', 'extra', 'bonus', 'limited', 'special',
  'from', 'video', 'motion', 'picture', 'official',
]);

/**
 * O que sobra do álbum depois de tirar o nome do jogo e a embalagem.
 * ATENÇÃO: número NÃO é embalagem. Descartar dígitos fazia "Sonic The Hedgehog
 * 2" passar como se fosse "Sonic The Hedgehog" — sequência é outro jogo.
 */
function sobra(album, gameTitle) {
  const alvo = norm(gameTitle);
  const resto = norm(album).replace(alvo, ' ');
  return resto.split(/\s+/).filter((w) => w && !EMBALAGEM.has(w));
}

async function dg(path, token, log, c) {
  const res = await fetch(`${DG}${path}`, {
    headers: {
      'User-Agent': 'ROMVault/1.0 +https://romvault.app',
      Accept: 'application/json',
      ...(token ? { Authorization: `Discogs token=${token}` } : {}),
    },
  });
  if (res.status === 429) { log(c.amber('  (limite do Discogs; pausando 60s)')); await sleep(60_000); return null; }
  if (!res.ok) return null;
  return res.json();
}

const durationToMs = (d) => {
  const p = String(d ?? '').trim().split(':').map(Number);
  if (p.length < 2 || p.some((n) => !Number.isFinite(n))) return null;
  const s = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  return s > 0 ? s * 1000 : null;
};

/** Tracklist do Discogs -> nosso formato (vinil numera "A1"; a PK quer inteiro). */
function dgTracks(tracklist) {
  const out = [];
  let i = 0;
  for (const t of tracklist ?? []) {
    if (t?.type_ && t.type_ !== 'track') continue;
    if (!t?.title) continue;
    i++;
    const label = String(t.position ?? '').trim();
    const m = label.match(/^(\d+)-/);
    out.push({
      disc: m ? Number(m[1]) : 1,
      position: i,
      title: String(t.title),
      duration_ms: durationToMs(t.duration),
      position_label: label || null,
    });
  }
  return out;
}

/**
 * Escolhe o álbum canônico entre os candidatos — ou NENHUM.
 * Devolve { hit, motivo } pra o modo de aferição explicar cada decisão.
 */
export function escolher(results, gameTitle, gameYear, maxGap = 12) {
  const alvo = norm(gameTitle);
  if (alvo.length < 3) return { hit: null, motivo: 'titulo curto demais p/ casar' };

  const cands = [];
  for (const r of results ?? []) {
    const full = String(r.title ?? '');
    const cut = full.indexOf(' - ');
    const album = cut > 0 ? full.slice(cut + 3) : full;
    const artista = cut > 0 ? full.slice(0, cut) : '';
    const nAlbum = norm(album);
    // EXIGE que o nome do jogo apareça no álbum (o filtro VGM já limpou o resto)
    if (!nAlbum.includes(alvo)) continue;
    const ano = Number(r.year) || null;
    // trilha sai junto ou depois do jogo; muito antes = outro jogo/coincidência
    if (gameYear && ano && ano < gameYear - 1) continue;
    // sobrou palavra além do nome do jogo? é a trilha de OUTRO jogo
    // ("Sonic the Hedgehog CD", "Tetris Effect", "Doom Eternal")
    const extra = sobra(album, gameTitle);
    if (extra.length > 0) continue;
    cands.push({
      id: String(r.master_id || r.id),
      album,
      artista,
      ano,
      have: Number(r?.community?.have ?? 0),
      oficial: OFICIAL.test(album),
      derivado: DERIVADO.test(album),
    });
  }
  if (cands.length === 0) return { hit: null, motivo: 'nenhum album com o nome do jogo' };

  /*
   * Preferência: oficial > não-derivado > MAIS PERTO DO ANO > mais gente tem.
   * O ano vem ANTES do "have" de propósito: com título idêntico, o álbum mais
   * popular era o do reboot (o "Doom" de 2016 tem 10 mil donos e ganhava do
   * jogo de 1993). Popularidade só desempata quando o ano não decide.
   */
  cands.sort((a, b) => {
    if (a.oficial !== b.oficial) return a.oficial ? -1 : 1;
    if (a.derivado !== b.derivado) return a.derivado ? 1 : -1;
    if (gameYear) {
      const da = a.ano ? Math.abs(a.ano - gameYear) : 99;
      const db = b.ano ? Math.abs(b.ano - gameYear) : 99;
      if (da !== db) return da - db;
    }
    return b.have - a.have;
  });
  const hit = cands[0];
  // se só sobrou derivado (piano/remix), não é a trilha do jogo: não cadastra
  if (!hit.oficial && hit.derivado) return { hit: null, motivo: `so derivados (ex.: ${hit.album.slice(0, 34)})` };
  /*
   * Guarda de ANO: com título idêntico, um álbum MUITO posterior costuma ser de
   * um reboot ("Doom" de 2016 x o jogo de 1993). Custo assumido: reedição em
   * vinil de clássico (Mondo/Data Discs, 20+ anos depois) também é recusada
   * quando o lançamento original não está no Discogs. Precisão vale mais que
   * cobertura aqui — o que escapa, o curador cadastra na mão.
   */
  if (gameYear && hit.ano && Math.abs(hit.ano - gameYear) > maxGap) {
    return { hit: null, motivo: `so achei de ${hit.ano} (jogo e ${gameYear}) — provavel reboot/reedicao` };
  }
  return { hit, motivo: hit.oficial ? 'titulo oficial' : `sem palavra-chave, mas ${hit.have} tem no acervo` };
}

export async function importSoundtracks(ctx) {
  const { sb, flag, DRY, log, c, step, itemLog, fetchAll, ENV } = ctx;
  const token = ENV.DISCOGS_TOKEN;
  const limit = Number(flag('limit', 20)) || 20;
  const amostra = Boolean(flag('sample', false));
  const only = flag('platform') && flag('platform') !== true ? String(flag('platform')) : null;
  // distância máxima de ano entre jogo e álbum. Menor = mais preciso, menos
  // cobertura (recusa reedição em vinil); maior = pega reedição, arrisca reboot.
  const maxGap = Number(flag('max-year-gap', 12)) || 12;

  step(`Trilhas sonoras via Discogs${amostra ? ' — AFERIÇÃO (amostra aleatória)' : ''}`);
  if (!token) log(c.amber('  (sem DISCOGS_TOKEN: 25 req/min em vez de 60 — vai mais devagar)'));

  // já cadastrados: não repete
  const jaTem = new Set((await fetchAll(() => sb.from('game_soundtracks').select('game_id'))).map((x) => x.game_id));

  let games = await fetchAll(() => sb.from('games')
    .select('id, title, release_date, platforms').not('igdb_id', 'is', null));
  games = games.filter((g) => !jaTem.has(g.id) && (!only || (g.platforms ?? []).includes(only)));
  if (amostra) games.sort(() => Math.random() - 0.5); // aleatório pra aferir de verdade
  games = games.slice(0, limit);
  log(`  ${games.length} jogo(s) nesta rodada\n`);

  const stats = { cadastrados: 0, sem_match: 0, erros: 0, faixas: 0 };
  for (const g of games) {
    const ano = g.release_date ? Number(String(g.release_date).slice(0, 4)) : null;
    const busca = await dg(
      `/database/search?q=${encodeURIComponent(g.title)}&type=master`
      + `&style=${encodeURIComponent(STYLE)}&per_page=25`,
      token, log, c,
    );
    await sleep(token ? 1100 : 2600);
    if (!busca) { stats.erros++; continue; }

    const { hit, motivo } = escolher(busca.results, g.title, ano, maxGap);
    if (!hit) {
      stats.sem_match++;
      log(`  ${c.dim('–')} ${g.title}${ano ? ` (${ano})` : ''} ${c.dim(`→ ${motivo}`)}`);
      continue;
    }

    // no modo aferição a gente NÃO grava: só mostra o que teria feito
    if (DRY) {
      stats.cadastrados++;
      itemLog(stats.cadastrados, `  ${c.green('✓')} ${g.title}${ano ? ` (${ano})` : ''}`);
      log(`      ${c.cyan(hit.album.slice(0, 56))} ${c.dim(`| ${hit.artista.slice(0, 28)} | ${hit.ano ?? '?'} | have ${hit.have} | ${motivo}`)}`);
      continue;
    }

    const master = await dg(`/masters/${hit.id}`, token, log, c);
    await sleep(token ? 1100 : 2600);
    if (!master) { stats.erros++; continue; }
    const tracks = dgTracks(master.tracklist ?? []);

    const { data: criado, error } = await sb.from('game_soundtracks').insert({
      game_id: g.id,
      title: String(master.title ?? hit.album),
      kind: 'original',
      composer: hit.artista || null,
      artists: hit.artista ? [hit.artista] : [],
      release_date: hit.ano ? `${hit.ano}-01-01` : null,
      disc_count: new Set(tracks.map((t) => t.disc)).size || null,
      track_count: tracks.length || null,
      cover_url: (master.images ?? [])[0]?.uri ?? null,
      external_ids: { discogs: hit.id },
    }).select('id').single();
    if (error) {
      if (!/duplicate|unique/i.test(error.message)) { stats.erros++; log(c.red(`  ✖ ${g.title}: ${error.message}`)); }
      continue;
    }
    if (tracks.length > 0) {
      await sb.from('soundtrack_tracks')
        .upsert(tracks.map((t) => ({ soundtrack_id: criado.id, ...t })), { onConflict: 'soundtrack_id,disc,position', ignoreDuplicates: true });
      stats.faixas += tracks.length;
    }
    stats.cadastrados++;
    itemLog(stats.cadastrados, `  ${c.green('+')} ${g.title} ${c.dim(`→ ${hit.album.slice(0, 40)} (${tracks.length} faixas)`)}`);
  }

  const total = stats.cadastrados + stats.sem_match;
  if (total > 0) {
    log(`\n  ${c.cyan('TAXA:')} ${stats.cadastrados}/${total} com álbum (${Math.round((stats.cadastrados / total) * 100)}%) · ${stats.sem_match} sem match`);
    if (DRY) log(c.amber('  (aferição — nada foi gravado. Confira a lista acima antes de rodar valendo.)'));
  }
  return stats;
}
