// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: trilhas sonoras via MusicBrainz (curadoria).
//
// Por que passa por aqui e não direto do navegador: o MusicBrainz EXIGE um
// User-Agent identificando a aplicação (o browser não deixa definir UA) e pede
// no máximo 1 req/s. Aqui a gente controla os dois.
//
//   action 'search' -> { query } procura release-groups de trilha e devolve
//                      candidatos pro admin ESCOLHER (nada automático: casar
//                      por título erra feio — "Celeste" casa com "Mélodie
//                      céleste", "Doom" casa com "DooM 3").
//   action 'add'    -> { game_id, mbid, kind?, parent_id? } grava o álbum com
//                      compositor, faixas (com duração) e capa do Cover Art
//                      Archive.
//   action 'remove' -> { id } apaga o álbum (as faixas caem por cascade).
//
// Auth: manager ou admin (can_curate no banco; conferido aqui também).
// Deploy: supabase functions deploy soundtrack-import --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/* o MusicBrainz pede um UA que identifique a app e um contato */
const UA = 'ROMVault/1.0 ( https://romvault.app )';
const MB = 'https://musicbrainz.org/ws/2';
const CAA = 'https://coverartarchive.org';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// deno-lint-ignore no-explicit-any
async function mb(path: string): Promise<any> {
  const res = await fetch(`${MB}${path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`MusicBrainz: HTTP ${res.status}`);
  return await res.json();
}

/**
 * Edições (releases) de um álbum, com a MELHOR escolhida por padrão.
 * Antes eu pegava a mais ANTIGA — e no Deltarune isso trazia a edição japonesa
 * com as faixas em japonês. Agora prefere alfabeto latino e mercado ocidental,
 * mas o curador troca na mão.
 */
// deno-lint-ignore no-explicit-any
function rankReleases(releases: any[]): any[] {
  const score = (r: any) => {
    let s = 0;
    if (r?.['text-representation']?.script === 'Latn') s -= 4;
    if (['US', 'XW', 'GB', 'XE'].includes(String(r?.country ?? ''))) s -= 2;
    if (r?.date) s -= 1; // com data é mais confiável que sem
    return s;
  };
  return [...releases].filter((r) => r?.id).sort((a, b) => {
    const d = score(a) - score(b);
    return d !== 0 ? d : String(a.date ?? '9999').localeCompare(String(b.date ?? '9999'));
  });
}

/** Faixas de uma edição específica. */
async function tracksOf(releaseId: string) {
  const rel = await mb(`/release/${releaseId}?inc=recordings&fmt=json`);
  const out: { disc: number; position: number; title: string; duration_ms: number | null }[] = [];
  // deno-lint-ignore no-explicit-any
  ((rel.media ?? []) as any[]).forEach((m, di) => {
    // deno-lint-ignore no-explicit-any
    for (const t of (m.tracks ?? []) as any[]) {
      out.push({
        disc: Number(m.position ?? di + 1),
        position: Number(t.position ?? 0),
        title: String(t.title ?? ''),
        duration_ms: t.length ? Number(t.length) : null,
      });
    }
  });
  return { discs: (rel.media ?? []).length as number, tracks: out.filter((t) => t.title && t.position > 0) };
}

/* ─────────────────────────── DEEZER (streaming) ─────────────────────────────
 * API pública, sem chave. Só linkamos "quando existir" (pedido do Killer): a
 * gente já tem título + artista do álbum curado, então busca por "artista
 * título" e SÓ aceita se TODAS as palavras distintivas do nosso título estão no
 * álbum do Deezer E o artista bate. Sem isso, "Legend of Mana" casava com
 * "Heroes of Mana" (mesmo compositor). Spotify/Tidal exigem OAuth — ficam fora.
 * ─────────────────────────────────────────────────────────────────────────── */
const PKG = new Set([
  'original', 'soundtrack', 'soundtracks', 'ost', 'osts', 'sound', 'version',
  'game', 'music', 'score', 'the', 'a', 'of', 'and', 'vol', 'volume', 'cd',
  'edition', 'complete', 'deluxe', 'from', 'official', 'chapter',
]);
const albumCore = (t: string) => norm(t).split(' ').filter((w) => w && !PKG.has(w));

/** URL do álbum no Deezer, ou null quando não existe com confiança. */
async function deezerFor(title: string, artist: string | null): Promise<string | null> {
  try {
    const q = `${artist ?? ''} ${title}`.trim();
    const res = await fetch(`https://api.deezer.com/search/album?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'ROMVault/1.0 +https://romvault.app' },
    });
    if (!res.ok) return null;
    // deno-lint-ignore no-explicit-any
    const data = ((await res.json())?.data ?? []) as any[];
    const nosso = albumCore(title);
    if (nosso.length === 0) return null;
    const hit = data.find((a) => {
      const dt = norm(a?.title ?? '');
      const da = norm(a?.artist?.name ?? '');
      const tituloOk = nosso.every((w) => dt.includes(w));
      const artistaOk = !artist || da.includes(norm(artist).split(' ')[0]);
      return tituloOk && artistaOk;
    });
    return hit?.link ? String(hit.link) : null;
  } catch { return null; }
}

/* ─────────────────────────── DISCOGS ────────────────────────────────────────
 * API oficial. O token (DISCOGS_TOKEN, pessoal e grátis) sobe o limite de 25
 * pra 60 req/min E é o que faz a busca devolver CAPA — sem ele `thumb` volta
 * vazio. Modelo igual ao do MusicBrainz: master = álbum, version = edição.
 * O filtro que salva é style="Video Game Music" (achado do Killer): busca
 * "celeste" cai de 21.992 pra 10 resultados, 9 deles certos.
 * ─────────────────────────────────────────────────────────────────────────── */
const DG = 'https://api.discogs.com';
const DG_STYLE = 'Video Game Music';

// deno-lint-ignore no-explicit-any
async function dg(path: string): Promise<any> {
  const token = Deno.env.get('DISCOGS_TOKEN');
  const res = await fetch(`${DG}${path}`, {
    headers: {
      'User-Agent': 'ROMVault/1.0 +https://romvault.app',
      Accept: 'application/json',
      ...(token ? { Authorization: `Discogs token=${token}` } : {}),
    },
  });
  if (res.status === 429) throw new Error('Discogs: limite de requisições atingido, tente em 1 minuto.');
  if (!res.ok) throw new Error(`Discogs: HTTP ${res.status}`);
  return await res.json();
}

/** "3:45" -> 225000 ms (o Discogs manda duração como texto). */
function durationToMs(d: unknown): number | null {
  const parts = String(d ?? '').trim().split(':').map((x) => Number(x));
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return null;
  const secs = parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
  return secs > 0 ? secs * 1000 : null;
}

/**
 * Tracklist do Discogs -> nosso formato. Posição vira índice sequencial (a PK
 * exige inteiro) e o rótulo original ("A1", "2-14") vai em position_label.
 * Descarta cabeçalhos de seção (type_ = "heading"), que não são faixas.
 */
// deno-lint-ignore no-explicit-any
function dgTracks(tracklist: any[]): { disc: number; position: number; title: string; duration_ms: number | null; position_label: string | null }[] {
  const out: { disc: number; position: number; title: string; duration_ms: number | null; position_label: string | null }[] = [];
  let i = 0;
  for (const t of tracklist ?? []) {
    if (t?.type_ && t.type_ !== 'track') continue; // heading/index
    if (!t?.title) continue;
    i++;
    const label = String(t.position ?? '').trim();
    // "2-14" (box set) => disco 2; "A1" (vinil) => disco 1
    const discMatch = label.match(/^(\d+)-/);
    out.push({
      disc: discMatch ? Number(discMatch[1]) : 1,
      position: i,
      title: String(t.title),
      duration_ms: durationToMs(t.duration),
      position_label: label || null,
    });
  }
  return out;
}

/** Resumo das edições pro seletor do painel. */
// deno-lint-ignore no-explicit-any
const releaseBrief = (r: any) => ({
  id: String(r.id),
  date: r.date ?? null,
  country: r.country ?? null,
  script: r?.['text-representation']?.script ?? null,
  language: r?.['text-representation']?.language ?? null,
  disambiguation: r.disambiguation || null,
  tracks: (r.media ?? []).reduce((n: number, m: { 'track-count'?: number }) => n + (m['track-count'] ?? 0), 0) || null,
});

/** Capa do Cover Art Archive (404 quando não tem — não é erro). */
async function coverOf(kind: 'release-group' | 'release', id: string): Promise<string | null> {
  try {
    const res = await fetch(`${CAA}/${kind}/${id}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    const img = (data.images ?? []).find((i: any) => i.front) ?? (data.images ?? [])[0];
    const url = img?.thumbnails?.['500'] ?? img?.thumbnails?.large ?? img?.image ?? null;
    return url ? String(url).replace(/^http:/, 'https:') : null;
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(url, serviceKey);

    const asUser = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);
    const { data: prof } = await admin.from('profiles').select('is_admin, role').eq('id', user.id).maybeSingle();
    const canCurate = Boolean(prof?.is_admin || prof?.role === 'manager' || prof?.role === 'admin');
    if (!canCurate) return json({ error: 'Só curadores (manager ou admin).' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'search');
    const provider = String(body.provider ?? 'musicbrainz');

    /* ── busca: devolve candidatos pro humano escolher ── */
    if (action === 'search') {
      const q = String(body.query ?? '').trim();
      if (!q) return json({ error: 'Informe o termo de busca.' }, 400);

      if (provider === 'discogs') {
        const data = await dg(
          `/database/search?q=${encodeURIComponent(q)}&type=master`
          + `&style=${encodeURIComponent(DG_STYLE)}&per_page=25`,
        );
        // deno-lint-ignore no-explicit-any
        const results = ((data.results ?? []) as any[]).map((r) => {
          // o Discogs junta tudo em "Artista - Álbum"
          const full = String(r.title ?? '');
          const cut = full.indexOf(' - ');
          return {
            id: String(r.master_id || r.id),
            title: cut > 0 ? full.slice(cut + 3) : full,
            artist: cut > 0 ? full.slice(0, cut) : null,
            year: r.year ? String(r.year) : null,
            cover_url: r.cover_image && !/spacer\.gif/.test(String(r.cover_image)) ? String(r.cover_image) : null,
            meta: [(r.format ?? []).join('/'), (r.label ?? [])[0], r.catno].filter(Boolean).join(' · ') || null,
          };
        });
        return json({ ok: true, action, provider, count: data.pagination?.items ?? results.length, results });
      }

      // aspas escapadas: título com aspas quebraria a query Lucene do MB
      const safe = q.replace(/["\\]/g, ' ').trim();
      const data = await mb(
        `/release-group/?query=${encodeURIComponent(`releasegroup:"${safe}" AND secondarytype:soundtrack`)}&fmt=json&limit=25`,
      );
      // deno-lint-ignore no-explicit-any
      const groups = (data['release-groups'] ?? []) as any[];
      const results = groups.map((rg) => ({
        id: String(rg.id),
        title: String(rg.title ?? ''),
        // deno-lint-ignore no-explicit-any
        artist: (rg['artist-credit'] ?? []).map((a: any) => a.name).join(', ') || null,
        year: rg['first-release-date'] ? String(rg['first-release-date']).slice(0, 4) : null,
        cover_url: null, // no MusicBrainz a capa vem por URL fixa do Cover Art Archive
        meta: (rg['secondary-types'] ?? []).join(' · ') || null,
      }));
      return json({ ok: true, action, provider, count: data.count ?? results.length, results });
    }

    /* ── prévia: faixas do candidato SEM gravar nada (o modal só chama isto
       quando o curador clica em "ver faixas" — a busca inicial segue leve) ── */
    if (action === 'preview') {
      const mbid = String(body.mbid ?? body.id ?? '');
      if (!mbid) return json({ error: 'Informe o id do álbum.' }, 400);

      if (provider === 'discogs') {
        // versões do master = edições (mesma ideia dos releases do MusicBrainz)
        const v = await dg(`/masters/${mbid}/versions?per_page=25`);
        // deno-lint-ignore no-explicit-any
        const releases = ((v.versions ?? []) as any[]).map((x) => ({
          id: String(x.id),
          date: x.released ? String(x.released) : null,
          country: x.country ?? null,
          script: null,
          language: null,
          // "Unofficial Release" = bootleg (SonMay/Miya): avisa em vez de esconder
          disambiguation: [x.format, x.label, x.catno].filter(Boolean).join(' · ') || null,
          tracks: null,
        }));
        const chosen = body.release_id ? String(body.release_id) : null;
        // sem edição escolhida, a tracklist do MASTER já é a canônica
        const src = chosen ? await dg(`/releases/${chosen}`) : await dg(`/masters/${mbid}`);
        const tracks = dgTracks(src.tracklist ?? []);
        return json({
          ok: true, action, provider, release_id: chosen ?? '', releases,
          discs: new Set(tracks.map((t) => t.disc)).size, tracks,
        });
      }
      const rg = await mb(`/release-group/${mbid}?inc=releases+media&fmt=json`);
      await sleep(1100);
      // deno-lint-ignore no-explicit-any
      const ranked = rankReleases((rg.releases ?? []) as any[]);
      if (ranked.length === 0) return json({ ok: true, action, releases: [], tracks: [] });
      const chosen = String(body.release_id ?? ranked[0].id);
      const { discs, tracks } = await tracksOf(chosen);
      return json({
        ok: true, action, release_id: chosen, discs, tracks,
        releases: ranked.map(releaseBrief),
      });
    }

    /* ── faixas de UMA edição (1 request só). O 'preview' busca o grupo antes;
       aqui a lista de edições já está na tela, então vai direto. ── */
    if (action === 'tracks') {
      const releaseId = String(body.release_id ?? '');
      if (!releaseId) return json({ error: 'Informe o release_id.' }, 400);
      if (provider === 'discogs') {
        const rel = await dg(`/releases/${releaseId}`);
        const tracks = dgTracks(rel.tracklist ?? []);
        return json({
          ok: true, action, provider, release_id: releaseId,
          discs: new Set(tracks.map((t) => t.disc)).size, tracks,
        });
      }
      const { discs, tracks } = await tracksOf(releaseId);
      return json({ ok: true, action, release_id: releaseId, discs, tracks });
    }

    /* ── troca a EDIÇÃO de um álbum já cadastrado (regrava as faixas) ── */
    if (action === 'set-release') {
      const id = String(body.id ?? '');
      const releaseId = String(body.release_id ?? '');
      if (!id || !releaseId) return json({ error: 'Informe id e release_id.' }, 400);
      const { data: album } = await admin.from('game_soundtracks')
        .select('external_ids').eq('id', id).maybeSingle();
      if (!album) return json({ error: 'Álbum não encontrado.' }, 404);
      const isDg = provider === 'discogs' || Boolean((album.external_ids as Record<string, string> | null)?.discogs);
      const { discs, tracks } = isDg
        ? await (async () => {
          const rel = await dg(`/releases/${releaseId}`);
          const tk = dgTracks(rel.tracklist ?? []);
          return { discs: new Set(tk.map((t) => t.disc)).size, tracks: tk };
        })()
        : await tracksOf(releaseId);
      await admin.from('soundtrack_tracks').delete().eq('soundtrack_id', id);
      if (tracks.length > 0) {
        const rows = tracks.map((t) => ({ soundtrack_id: id, ...t }));
        for (let i = 0; i < rows.length; i += 200) {
          await admin.from('soundtrack_tracks')
            .upsert(rows.slice(i, i + 200), { onConflict: 'soundtrack_id,disc,position', ignoreDuplicates: true });
        }
      }
      await admin.from('game_soundtracks').update({
        disc_count: discs || null,
        track_count: tracks.length || null,
        external_ids: {
          ...((album.external_ids as Record<string, string> | null) ?? {}),
          [isDg ? 'discogs_release' : 'mb_release']: releaseId,
        },
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      return json({ ok: true, action, tracks: tracks.length });
    }

    /* ── remove ── */
    if (action === 'remove') {
      const id = String(body.id ?? '');
      if (!id) return json({ error: 'Informe o id do álbum.' }, 400);
      const { error } = await admin.from('game_soundtracks').delete().eq('id', id);
      if (error) throw error;
      return json({ ok: true, action });
    }

    /* ── add: puxa detalhes + faixas + capa e grava ── */
    if (action === 'add') {
      const gameId = String(body.game_id ?? '');
      const mbid = String(body.mbid ?? body.id ?? '');
      if (!gameId || !mbid) return json({ error: 'Informe game_id e o id do álbum.' }, 400);

      if (provider === 'discogs') {
        const { data: dup } = await admin.from('game_soundtracks')
          .select('id').eq('external_ids->>discogs', mbid).maybeSingle();
        if (dup) return json({ error: 'Este álbum já está cadastrado.' }, 409);

        const relId = body.release_id ? String(body.release_id) : null;
        const master = await dg(`/masters/${mbid}`);
        // a edição escolhida tem gravadora/catálogo/formato; o master não
        const rel = relId ? await dg(`/releases/${relId}`) : null;
        const src = rel ?? master;
        const tracks = dgTracks(src.tracklist ?? []);
        // deno-lint-ignore no-explicit-any
        const artists = ((src.artists ?? []) as any[]).map((a) => String(a.name)).filter(Boolean);
        // deno-lint-ignore no-explicit-any
        const label = ((rel?.labels ?? []) as any[])[0];

        const { data: created, error: insErr } = await admin.from('game_soundtracks').insert({
          game_id: gameId,
          title: String(master.title ?? src.title ?? 'Sem título'),
          kind: String(body.kind ?? 'original'),
          parent_id: body.parent_id ? String(body.parent_id) : null,
          composer: artists[0] ?? null,
          artists,
          release_date: /^\d{4}$/.test(String(master.year ?? '')) ? `${master.year}-01-01` : null,
          label: label?.name ?? null,
          catalog: label?.catno && label.catno !== 'none' ? String(label.catno) : null,
          disc_count: new Set(tracks.map((t) => t.disc)).size || null,
          track_count: tracks.length || null,
          // deno-lint-ignore no-explicit-any
          cover_url: ((src.images ?? []) as any[])[0]?.uri ?? null,
          external_ids: relId ? { discogs: mbid, discogs_release: relId } : { discogs: mbid },
          added_by: user.id,
        }).select('id, title').single();
        if (insErr) throw insErr;

        if (tracks.length > 0) {
          const rows = tracks.map((t) => ({ soundtrack_id: created.id, ...t }));
          for (let i = 0; i < rows.length; i += 200) {
            await admin.from('soundtrack_tracks')
              .upsert(rows.slice(i, i + 200), { onConflict: 'soundtrack_id,disc,position', ignoreDuplicates: true });
          }
        }
        // streaming (best-effort): só linka se existir com confiança
        const dz = await deezerFor(String(master.title ?? ''), artists[0] ?? null);
        if (dz) {
          await admin.from('game_soundtracks')
            .update({ external_ids: { ...(relId ? { discogs: mbid, discogs_release: relId } : { discogs: mbid }), deezer: dz } })
            .eq('id', created.id);
        }
        return json({ ok: true, action, provider, id: created.id, title: created.title, tracks: tracks.length, deezer: Boolean(dz) });
      }

      const { data: dup } = await admin.from('game_soundtracks')
        .select('id').eq('external_ids->>musicbrainz', mbid).maybeSingle();
      if (dup) return json({ error: 'Este álbum já está cadastrado.' }, 409);

      const rg = await mb(`/release-group/${mbid}?inc=artists+releases&fmt=json`);
      await sleep(1100); // 1 req/s: regra do MusicBrainz

      // edição: a que o curador escolheu no modal; senão a melhor do ranking
      // (latim + mercado ocidental) — pegar a mais antiga trazia a japonesa.
      // deno-lint-ignore no-explicit-any
      const ranked = rankReleases((rg.releases ?? []) as any[]);
      const chosenId = body.release_id ? String(body.release_id) : (ranked[0]?.id ?? null);

      let tracks: { disc: number; position: number; title: string; duration_ms: number | null }[] = [];
      let discCount: number | null = null;
      if (chosenId) {
        try {
          const r = await tracksOf(chosenId);
          await sleep(1100);
          tracks = r.tracks;
          discCount = r.discs || null;
        } catch { /* álbum sem tracklist: grava mesmo assim */ }
      }

      const cover = (await coverOf('release-group', mbid))
        ?? (chosenId ? await coverOf('release', chosenId) : null);

      // deno-lint-ignore no-explicit-any
      const artists = ((rg['artist-credit'] ?? []) as any[]).map((a) => String(a.name)).filter(Boolean);
      const row = {
        game_id: gameId,
        title: String(rg.title ?? 'Sem título'),
        kind: String(body.kind ?? 'original'),
        parent_id: body.parent_id ? String(body.parent_id) : null,
        composer: artists[0] ?? null,
        artists,
        release_date: /^\d{4}-\d{2}-\d{2}$/.test(String(rg['first-release-date'] ?? ''))
          ? rg['first-release-date'] : null,
        disc_count: discCount,
        track_count: tracks.length || null,
        cover_url: cover,
        external_ids: chosenId ? { musicbrainz: mbid, mb_release: chosenId } : { musicbrainz: mbid },
        added_by: user.id,
      };
      const { data: created, error: insErr } = await admin
        .from('game_soundtracks').insert(row).select('id, title').single();
      if (insErr) throw insErr;

      if (tracks.length > 0) {
        const rows = tracks.map((t) => ({ soundtrack_id: created.id, ...t }));
        for (let i = 0; i < rows.length; i += 200) {
          await admin.from('soundtrack_tracks')
            .upsert(rows.slice(i, i + 200), { onConflict: 'soundtrack_id,disc,position', ignoreDuplicates: true });
        }
      }
      const dz = await deezerFor(String(rg.title ?? ''), artists[0] ?? null);
      if (dz) {
        await admin.from('game_soundtracks')
          .update({ external_ids: { ...row.external_ids, deezer: dz } }).eq('id', created.id);
      }
      return json({ ok: true, action, id: created.id, title: created.title, tracks: tracks.length, cover: Boolean(cover), deezer: Boolean(dz) });
    }

    /* ── streaming: (re)procura o álbum no Deezer p/ um já cadastrado ── */
    if (action === 'streaming') {
      const id = String(body.id ?? '');
      if (!id) return json({ error: 'Informe o id do álbum.' }, 400);
      const { data: alb } = await admin.from('game_soundtracks')
        .select('title, composer, external_ids').eq('id', id).maybeSingle();
      if (!alb) return json({ error: 'Álbum não encontrado.' }, 404);
      const dz = await deezerFor(String(alb.title), (alb.composer as string | null) ?? null);
      const ext = { ...((alb.external_ids as Record<string, string> | null) ?? {}) };
      if (dz) ext.deezer = dz; else delete ext.deezer;
      await admin.from('game_soundtracks').update({ external_ids: ext }).eq('id', id);
      return json({ ok: true, action, deezer: dz });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
