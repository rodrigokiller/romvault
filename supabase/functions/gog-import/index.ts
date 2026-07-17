// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: importa a biblioteca GOG pelo PERFIL PÚBLICO
// (endpoint JSON público gog.com/u/<user>/games/stats — sem key, sem NPSSO).
// O usuário só precisa deixar o perfil público nas configurações do GOG.
//
// GOG não expõe conquistas por esse caminho: vem jogos + horas + última
// sessão. Tudo PC. Match por título — NUNCA cria jogo. Cria cópias
// (digital · GOG) e game_sync_data; tracks novos entram como backlog
// (com horas), igual o Steam.
//
// Sem segredo. Deploy: supabase functions deploy gog-import --no-verify-jwt
// Cron: aceita x-cron-secret (CRON_SECRET) — sincroniza provider='gog'.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const keyTitle = (raw: string) => norm(raw.replace(/[®™©]/g, ''));

// deno-lint-ignore no-explicit-any
async function fetchAll(query: () => any): Promise<any[]> {
  const PAGE = 1000;
  // deno-lint-ignore no-explicit-any
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

interface GogGame {
  title: string;
  hours: number | null;
  lastSession: string | null;
}

/** Lê todas as páginas do perfil público do GOG. */
async function gogGames(username: string): Promise<GogGame[]> {
  const out: GogGame[] = [];
  for (let page = 1; page <= 40; page++) {
    // o GOG (atrás de CDN) recusa UA "de robô": manda cara de navegador
    const res = await fetch(
      `https://www.gog.com/u/${encodeURIComponent(username)}/games/stats?page=${page}`,
      {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          Referer: `https://www.gog.com/u/${encodeURIComponent(username)}/games`,
        },
      },
    );
    if (res.status === 404) throw new Error(`Perfil GOG "${username}" não existe ou é privado.`);
    if (res.status === 403) {
      throw new Error('GOG bloqueou a consulta (HTTP 403) — perfil privado OU o CDN deles recusou o datacenter; confira a privacidade em gog.com/account/settings/privacy e tente de novo mais tarde.');
    }
    if (!res.ok) throw new Error(`GOG: HTTP ${res.status}`);
    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    const items = (data?._embedded?.items ?? []) as any[];
    for (const it of items) {
      const title = it?.game?.title;
      if (!title) continue;
      // stats vem keyed pelo id do usuário: { "<uid>": { playtime, lastSession } }
      // deno-lint-ignore no-explicit-any
      const stat = Object.values((it?.stats ?? {}) as Record<string, any>)[0];
      out.push({
        title: String(title),
        hours: stat?.playtime ? Math.round((Number(stat.playtime) / 60) * 10) / 10 : null,
        lastSession: stat?.lastSession ?? null,
      });
    }
    const pages = Number(data?.pages ?? 1);
    if (page >= pages) break;
  }
  return out;
}

// deno-lint-ignore no-explicit-any
async function syncUser(admin: any, userId: string, username: string, byKey: Map<string, string>) {
  const games = await gogGames(username);
  if (games.length === 0) throw new Error('Nenhum jogo visível nesse perfil GOG.');

  const matched: { gid: string; g: GogGame }[] = [];
  const misses: string[] = [];
  for (const g of games) {
    const gid = byKey.get(`PC|${keyTitle(g.title)}`);
    if (gid) matched.push({ gid, g });
    else misses.push(g.title);
  }

  const myTracks = await fetchAll(() =>
    admin.from('game_tracks').select('game_id, source').eq('user_id', userId));
  const trackByGame = new Map(myTracks.map((x: { game_id: string; source: string }) => [x.game_id, x.source]));

  const newTracks: Record<string, unknown>[] = [];
  let updated = 0;
  for (const m of matched) {
    const src = trackByGame.get(m.gid);
    if (src === undefined) {
      newTracks.push({
        user_id: userId, game_id: m.gid, status: 'backlog', platform: 'PC',
        hours_played: m.g.hours, source: 'gog',
      });
    } else if (src === 'gog' && m.g.hours) {
      await admin.from('game_tracks').update({ hours_played: m.g.hours })
        .eq('user_id', userId).eq('game_id', m.gid);
      updated++;
    }
  }
  for (let i = 0; i < newTracks.length; i += 200) {
    await admin.from('game_tracks').upsert(newTracks.slice(i, i + 200), { onConflict: 'user_id,game_id' });
  }

  // dado bruto por provedor (dedupe por game_id)
  const syncByGame = new Map<string, Record<string, unknown>>();
  for (const m of matched) {
    syncByGame.set(m.gid, {
      user_id: userId, game_id: m.gid, provider: 'gog', platform: 'PC',
      hours_played: m.g.hours,
      last_played: m.g.lastSession,
      synced_at: new Date().toISOString(),
    });
  }
  const syncRows = [...syncByGame.values()];
  for (let i = 0; i < syncRows.length; i += 200) {
    await admin.from('game_sync_data')
      .upsert(syncRows.slice(i, i + 200), { onConflict: 'user_id,game_id,provider' });
  }

  // cópias (vitrine)
  const myCopies = await fetchAll(() =>
    admin.from('game_copies').select('game_id').eq('user_id', userId).eq('store', 'GOG'));
  const copyGames = new Set(myCopies.map((c: { game_id: string }) => c.game_id));
  const newCopies: Record<string, unknown>[] = [];
  for (const m of matched) {
    if (!copyGames.has(m.gid)) {
      copyGames.add(m.gid);
      newCopies.push({
        user_id: userId, game_id: m.gid, platform: 'PC',
        distribution: 'digital', store: 'GOG',
      });
    }
  }
  for (let i = 0; i < newCopies.length; i += 200) {
    await admin.from('game_copies').insert(newCopies.slice(i, i + 200));
  }

  await admin.from('user_accounts')
    .update({ last_sync: new Date().toISOString() })
    .eq('user_id', userId).eq('provider', 'gog');

  return {
    gog_games: games.length,
    matched: matched.length,
    tracks_added: newTracks.length,
    tracks_updated: updated,
    copies_added: newCopies.length,
    unmatched: misses.length,
    sample_misses: misses.slice(0, 10),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const cronSecret = Deno.env.get('CRON_SECRET');
    const admin = createClient(url, serviceKey);

    const catalog = await fetchAll(() => admin.from('games').select('id, title, platforms'));
    const byKey = new Map<string, string>();
    for (const g of catalog) {
      for (const p of (g.platforms ?? []) as string[]) {
        byKey.set(`${p}|${norm(g.title)}`, g.id);
      }
    }

    if (cronSecret && req.headers.get('x-cron-secret') === cronSecret) {
      const accounts = await fetchAll(() =>
        admin.from('user_accounts').select('user_id, account_id').eq('provider', 'gog'));
      let ok = 0, failed = 0;
      for (const acc of accounts) {
        try {
          await syncUser(admin, acc.user_id as string, acc.account_id as string, byKey);
          ok++;
        } catch { failed++; }
        await new Promise((r) => setTimeout(r, 1500));
      }
      return json({ ok: true, mode: 'cron', accounts: accounts.length, synced: ok, failed });
    }

    const asUser = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const body = await req.json().catch(() => ({}));
    const target = String(body.gog_user ?? '').trim();
    if (!target) return json({ error: 'Informe o username do GOG.' }, 400);

    const result = await syncUser(admin, user.id, target, byKey);
    return json({ ok: true, ...result });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
