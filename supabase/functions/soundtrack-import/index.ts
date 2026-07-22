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

    /* ── busca: devolve candidatos pro humano escolher ── */
    if (action === 'search') {
      const q = String(body.query ?? '').trim();
      if (!q) return json({ error: 'Informe o termo de busca.' }, 400);
      // aspas escapadas: título com aspas quebraria a query Lucene do MB
      const safe = q.replace(/["\\]/g, ' ').trim();
      const data = await mb(
        `/release-group/?query=${encodeURIComponent(`releasegroup:"${safe}" AND secondarytype:soundtrack`)}&fmt=json&limit=25`,
      );
      // deno-lint-ignore no-explicit-any
      const groups = (data['release-groups'] ?? []) as any[];
      const results = groups.map((rg) => ({
        mbid: String(rg.id),
        title: String(rg.title ?? ''),
        // deno-lint-ignore no-explicit-any
        artist: (rg['artist-credit'] ?? []).map((a: any) => a.name).join(', ') || null,
        first_release: rg['first-release-date'] ?? null,
        primary_type: rg['primary-type'] ?? null,
        secondary_types: rg['secondary-types'] ?? [],
        score: rg.score ?? null,
      }));
      return json({ ok: true, action, count: data.count ?? results.length, results });
    }

    /* ── prévia: faixas do candidato SEM gravar nada (o modal só chama isto
       quando o curador clica em "ver faixas" — a busca inicial segue leve) ── */
    if (action === 'preview') {
      const mbid = String(body.mbid ?? '');
      if (!mbid) return json({ error: 'Informe o mbid.' }, 400);
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
      const { discs, tracks } = await tracksOf(releaseId);
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
        external_ids: { ...((album.external_ids as Record<string, string> | null) ?? {}), mb_release: releaseId },
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
      const mbid = String(body.mbid ?? '');
      if (!gameId || !mbid) return json({ error: 'Informe game_id e mbid.' }, 400);

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
      return json({ ok: true, action, id: created.id, title: created.title, tracks: tracks.length, cover: Boolean(cover) });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
