// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: API da BIBLIOTECA/TRACKING do usuário (ler + gravar).
// É a "fonte de verdade" de jogos que qualquer app externo (ex.: ConectaX)
// consome. Estilo Trakt: o RomVault expõe, o outro app puxa/empurra.
//
// AUTENTICAÇÃO: token pessoal que o usuário gera na tela de API (rv_...).
//   Aceita  `Authorization: Bearer rv_...`  OU  `x-api-key: rv_...`.
//   Guardamos só o hash SHA-256; aqui hasheamos o recebido e procuramos em
//   api_keys. A chave precisa da permissão 'library:read' (GET) / 'library:write'
//   (POST) — assim uma chave só-catálogo do public-api NÃO mexe na biblioteca.
//
// Deploy (SEM verificacao de JWT — a auth e' a nossa por token):
//   supabase functions deploy library-api --no-verify-jwt
//
// BASE: https://<project>.supabase.co/functions/v1/library-api
//
// Rotas:
//   GET  /            -> { items: [ ...jogos... ], next_cursor? }
//        ?updated_since=<ISO>  delta (só alterados depois disso)
//        ?cursor=<n>&limit=<n> paginação (limit padrão 500, teto 1000)
//        ?platform=<str>       filtra por plataforma (norm)
//   POST /            -> body: UM jogo  -> upsert; devolve o objeto final
//        /bulk (ou body array) -> upsert em lote "última-escrita-vence";
//                                 devolve { added, updated, conflicts,
//                                           unchanged, unmatched }
//
// CONTRATO do "jogo" (dono é o RomVault):
//   { id, chave, titulo, plataforma, regiao?, possui, status, horas?, nota?,
//     hash?, capa_url?, atualizado_em }
//   status ∈ have | want | playing | beaten | dropped
//   chave  = `${norm(plataforma)}|${norm(titulo)}`
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── normalização (IDÊNTICA ao ConectaX, senão o match não bate) ──────────────
const strip = (s: string) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s: string) => strip(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const chaveDe = (plat: string, title: string) => `${norm(plat)}|${norm(title)}`;
const REGIAO: Record<string, string> = {
  'ntsc-u': 'USA', usa: 'USA', us: 'USA', pal: 'EUR', eur: 'EUR', europe: 'EUR',
  'ntsc-j': 'JPN', jpn: 'JPN', japan: 'JPN',
};
const regiaoDe = (r?: string | null) => (r ? (REGIAO[norm(r)] ?? r) : undefined);

// RomVault status  <->  contrato
const TO_CONTRACT: Record<string, string> = {
  owned: 'have', backlog: 'want', playing: 'playing', finished: 'beaten', abandoned: 'dropped',
};
const FROM_CONTRACT: Record<string, string> = {
  have: 'owned', want: 'backlog', playing: 'playing', beaten: 'finished', dropped: 'abandoned',
};
// quanto maior, mais "informativo" — vence no merge de (jogo, plataforma)
const RANK: Record<string, number> = { want: 0, have: 1, dropped: 2, playing: 3, beaten: 4 };

type Admin = ReturnType<typeof createClient>;

async function fetchAll<T = Record<string, unknown>>(
  build: () => { range: (a: number, b: number) => Promise<{ data: T[] | null; error: { message: string } | null }> },
): Promise<T[]> {
  const PAGE = 1000; const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// ── GET: monta o contrato a partir de game_copies + game_tracks ──────────────
type Jogo = {
  chave: string; titulo: string; plataforma: string; regiao?: string;
  possui: boolean; status: string; horas?: number; capa_url?: string; atualizado_em?: string;
};

async function construir(admin: Admin, userId: string): Promise<Jogo[]> {
  const copies = await fetchAll<{ game_id: string; platform: string; region: string | null; created_at: string }>(
    () => admin.from('game_copies').select('game_id, platform, region, created_at').eq('user_id', userId) as never);
  const tracks = await fetchAll<{ game_id: string; status: string; platform: string | null; hours_played: number | null; updated_at: string }>(
    () => admin.from('game_tracks').select('game_id, status, platform, hours_played, updated_at').eq('user_id', userId) as never);

  const ids = [...new Set([...copies.map((x) => x.game_id), ...tracks.map((x) => x.game_id)])];
  const games = new Map<string, { id: string; title: string; platforms: string[] | null; cover_url: string | null }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await admin.from('games').select('id, title, platforms, cover_url').in('id', ids.slice(i, i + 300));
    for (const g of (data ?? []) as never[]) games.set((g as { id: string }).id, g as never);
  }

  const map = new Map<string, Jogo>();
  const put = (gameId: string, plat: string | null | undefined, status: string, quando: string, horas?: number | null, regiao?: string) => {
    const g = games.get(gameId); if (!g || !plat) return;
    const k = `${gameId}|${plat}`;
    const prev = map.get(k);
    if (!prev) {
      map.set(k, {
        chave: chaveDe(plat, g.title), titulo: g.title, plataforma: plat,
        regiao, possui: status !== 'want', status,
        horas: horas ?? undefined, capa_url: g.cover_url ?? undefined, atualizado_em: quando,
      });
      return;
    }
    // status mais informativo vence
    if ((RANK[status] ?? 0) > (RANK[prev.status] ?? 0)) { prev.status = status; prev.possui = status !== 'want'; }
    if (horas != null && (prev.horas == null || horas > prev.horas)) prev.horas = horas;
    if (regiao && !prev.regiao) prev.regiao = regiao;
    if (quando && (!prev.atualizado_em || quando > prev.atualizado_em)) prev.atualizado_em = quando;
  };

  for (const cp of copies) put(cp.game_id, cp.platform, 'have', cp.created_at, undefined, regiaoDe(cp.region));
  for (const tr of tracks) {
    const g = games.get(tr.game_id);
    const plat = tr.platform ?? (g?.platforms ?? [])[0];
    put(tr.game_id, plat, TO_CONTRACT[tr.status] ?? 'have', tr.updated_at, tr.hours_played);
  }

  const list = [...map.values()];
  list.sort((a, b) => a.chave.localeCompare(b.chave));
  return list;
}

// ── POST/bulk: casa por TÍTULO (plataforma desempata) e grava game_tracks ────
async function mergeIntoRomvault(admin: Admin, userId: string, incoming: Jogo[]) {
  const catalog = await fetchAll<{ id: string; title: string; platforms: string[] | null }>(
    () => admin.from('games').select('id, title, platforms') as never);
  const byTitle = new Map<string, { id: string; plats: Set<string> }[]>();
  for (const g of catalog) {
    const k = norm(g.title);
    const arr = byTitle.get(k) ?? [];
    arr.push({ id: g.id, plats: new Set((g.platforms ?? []).map(norm)) });
    byTitle.set(k, arr);
  }
  const matchGame = (it: Jogo): string | null => {
    const parts = String(it.chave ?? '').split('|');
    const title = norm(it.titulo || parts[1] || '');
    const plat = norm(it.plataforma || parts[0] || '');
    const cands = byTitle.get(title);
    if (!cands || cands.length === 0) return null;
    if (cands.length === 1) return cands[0].id;
    return (cands.find((cc) => cc.plats.has(plat)) ?? cands[0]).id;
  };

  const tracks = await fetchAll<{ game_id: string; status: string; hours_played: number | null; updated_at: string }>(
    () => admin.from('game_tracks').select('game_id, status, hours_played, updated_at').eq('user_id', userId) as never);
  const trackByGame = new Map(tracks.map((t) => [t.game_id, t]));

  // desejo por jogo (o mais informativo / mais recente vence entre plataformas)
  const wanted = new Map<string, { status: string; horas?: number; quando: string }>();
  const unmatched: string[] = [];
  for (const it of incoming) {
    const gid = matchGame(it);
    if (!gid) { unmatched.push(it.titulo ?? it.chave); continue; }
    const rvStatus = it.possui === false ? 'backlog' : (FROM_CONTRACT[it.status ?? ''] ?? 'owned');
    const quando = it.atualizado_em ?? '';
    const cur = wanted.get(gid);
    if (!cur || (RANK[TO_CONTRACT[rvStatus]] ?? 0) > (RANK[TO_CONTRACT[cur.status]] ?? 0) || quando > cur.quando) {
      wanted.set(gid, { status: cur && (RANK[TO_CONTRACT[cur.status]] ?? 0) > (RANK[TO_CONTRACT[rvStatus]] ?? 0) ? cur.status : rvStatus, horas: it.horas ?? cur?.horas, quando: quando > (cur?.quando ?? '') ? quando : (cur?.quando ?? '') });
    }
  }

  const rep = { added: [] as string[], updated: [] as string[], conflicts: [] as { gid: string; nosso: string; deles: string }[], unchanged: 0, unmatched };
  const ops: { gid: string; status: string; horas?: number }[] = [];
  for (const [gid, w] of wanted) {
    const cur = trackByGame.get(gid);
    if (!cur) { rep.added.push(gid); ops.push({ gid, status: w.status, horas: w.horas }); continue; }
    if (cur.status === w.status) { rep.unchanged++; continue; }
    // divergência: última-escrita-vence por data
    if ((w.quando ?? '') > (cur.updated_at ?? '')) {
      // não rebaixa quem já está jogando/zerou pra 'owned', mas respeita want->have etc.
      const proteger = ['playing', 'finished'].includes(cur.status) && w.status === 'owned';
      const novo = proteger ? cur.status : w.status;
      if (novo !== cur.status) { rep.updated.push(gid); ops.push({ gid, status: novo, horas: w.horas }); }
      else rep.unchanged++;
    } else {
      rep.conflicts.push({ gid, nosso: TO_CONTRACT[cur.status] ?? cur.status, deles: TO_CONTRACT[w.status] ?? w.status });
    }
  }

  if (ops.length) {
    const now = new Date().toISOString();
    for (let i = 0; i < ops.length; i += 200) {
      const rows = ops.slice(i, i + 200).map((o) => ({
        user_id: userId, game_id: o.gid, status: o.status, source: 'api',
        ...(o.horas != null ? { hours_played: o.horas } : {}), updated_at: now,
      }));
      const { error } = await admin.from('game_tracks').upsert(rows, { onConflict: 'user_id,game_id' });
      if (error) throw new Error(`game_tracks upsert: ${error.message}`);
    }
  }
  return { added: rep.added.length, updated: rep.updated.length, conflicts: rep.conflicts, unchanged: rep.unchanged, unmatched };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // token: Authorization: Bearer rv_...  ou  x-api-key: rv_...
  const auth = req.headers.get('authorization') ?? '';
  const bearer = /^bearer\s+(.+)$/i.exec(auth)?.[1];
  const key = (bearer ?? req.headers.get('x-api-key') ?? '').trim();
  if (!key) return json({ error: 'Falta o token (Authorization: Bearer rv_... ou x-api-key).' }, 401);

  const { data: keyRow } = await admin
    .from('api_keys')
    .select('id, user_id, is_active, usage_count, permissions')
    .eq('key_hash', await sha256Hex(key))
    .maybeSingle();
  if (!keyRow || !keyRow.is_active) return json({ error: 'Token inválido ou revogado.' }, 401);

  const perms: string[] = (keyRow.permissions as string[] | null) ?? [];
  const need = req.method === 'GET' ? 'library:read' : 'library:write';
  if (!perms.includes(need)) return json({ error: `Este token não tem permissão '${need}'.` }, 403);

  const userId = keyRow.user_id as string;
  // uso (best-effort, não bloqueia)
  void admin.from('api_keys').update({ usage_count: (keyRow.usage_count as number ?? 0) + 1, last_used: new Date().toISOString() }).eq('id', keyRow.id);

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const since = url.searchParams.get('updated_since');
      const plat = url.searchParams.get('platform');
      const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') ?? '500') || 500));
      const cursor = Math.max(0, Number(url.searchParams.get('cursor') ?? '0') || 0);

      let items = await construir(admin, userId);
      if (since) items = items.filter((x) => (x.atualizado_em ?? '') > since);
      if (plat) items = items.filter((x) => norm(x.plataforma) === norm(plat));
      const page = items.slice(cursor, cursor + limit);
      const next = cursor + limit < items.length ? String(cursor + limit) : undefined;
      return json({ items: page, ...(next ? { next_cursor: next } : {}) });
    }

    if (req.method === 'POST') {
      const url = new URL(req.url);
      const body = await req.json().catch(() => null);
      const isBulk = url.pathname.endsWith('/bulk') || Array.isArray(body);
      const arr: Jogo[] = Array.isArray(body) ? body : body ? [body] : [];
      if (arr.length === 0) return json({ error: 'Corpo vazio: envie um jogo ou um array.' }, 400);

      const rep = await mergeIntoRomvault(admin, userId, arr);
      if (isBulk) return json(rep);
      // single: devolve o objeto final atualizado
      const list = await construir(admin, userId);
      const k = chaveDe(arr[0].plataforma ?? '', arr[0].titulo ?? '');
      const found = list.find((x) => x.chave === k);
      return json(found ?? { ...rep, note: 'gravado' });
    }

    return json({ error: 'Método não suportado.' }, 405);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
