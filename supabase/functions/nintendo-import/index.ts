// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: Nintendo Switch (EXPERIMENTAL — API não-oficial
// do app Nintendo Switch Online, mesmo caminho do projeto open-source nxapi
// e do PlayTracker).
//
// Modelo (igual PlayTracker): uma CONTA DE SERVIÇO nossa no NSO; o usuário
// informa o FRIEND CODE e aceita o pedido de amizade; a presença de amigos
// expõe o jogo atual/último com tempo total — cada sync acumula os jogos
// que a pessoa for jogando (por isso "jogue de novo pra aparecer").
//
// FRÁGIL por natureza: depende do token de sessão (dura meses), da API
// terceira de assinatura (imink) e da versão corrente do app NSO (resolvida
// dinamicamente na App Store). Se quebrar, o erro explica o que renovar.
//
// Segredo:  supabase secrets set NINTENDO_SESSION_TOKEN=<via nxapi: npx nxapi nso auth>
// Deploy:   supabase functions deploy nintendo-import --no-verify-jwt
// Cron:     aceita x-cron-secret — acumula presença de todas as contas 'nintendo'.
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

const ZNC = 'https://api-lp1.znc.srv.nintendo.net';

/** Versão corrente do app NSO (App Store) — o znc rejeita versões velhas. */
async function nsoAppVersion(): Promise<string> {
  try {
    const res = await fetch('https://itunes.apple.com/lookup?id=1234806557');
    const data = await res.json();
    return String(data?.results?.[0]?.version ?? '2.12.0');
  } catch {
    return '2.12.0';
  }
}

interface ZncAuth {
  webToken: string;
  appVersion: string;
}

/** session_token -> tokens da conta -> f (imink) -> login no znc. */
async function zncLogin(sessionToken: string): Promise<ZncAuth> {
  const tokRes = await fetch('https://accounts.nintendo.com/connect/1.0.0/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: '71b963c1b7b6d119',
      session_token: sessionToken,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer-session-token',
    }),
  });
  const tok = await tokRes.json();
  if (!tok?.id_token) throw new Error('NINTENDO_SESSION_TOKEN inválido/expirado — renove com: npx nxapi nso auth');

  const meRes = await fetch('https://api.accounts.nintendo.com/2.0.0/users/me', {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  const me = await meRes.json();

  // assinatura f: tenta imink e cai pro znca-api do nxapi (os dois serviços
  // que a comunidade mantém — certificado do imink já expirou uma vez)
  const reqId = crypto.randomUUID();
  const fBody = JSON.stringify({ token: tok.id_token, hash_method: 1, request_id: reqId });
  const F_PROVIDERS = [
    'https://api.imink.app/f',
    'https://nxapi-znca-api.fancy.org.uk/api/znca/f',
  ];
  // deno-lint-ignore no-explicit-any
  let f: any = null;
  let lastErr = '';
  for (const url of F_PROVIDERS) {
    try {
      const fRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'ROMVault/1.0 (+https://romvault.app)' },
        body: fBody,
      });
      if (!fRes.ok) { lastErr = `${url}: HTTP ${fRes.status}`; continue; }
      f = await fRes.json();
      if (f?.f) break;
      lastErr = `${url}: resposta sem f`;
      f = null;
    } catch (e) {
      lastErr = `${url}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  if (!f) throw new Error(`Nenhum serviço de assinatura respondeu (${lastErr}) — tente mais tarde.`);

  const appVersion = await nsoAppVersion();
  const loginRes = await fetch(`${ZNC}/v3/Account/Login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Platform': 'Android',
      'X-ProductVersion': appVersion,
      'User-Agent': `com.nintendo.znca/${appVersion}(Android/14)`,
    },
    body: JSON.stringify({
      parameter: {
        f: f.f,
        naIdToken: tok.id_token,
        timestamp: f.timestamp,
        requestId: f.request_id,
        language: me.language ?? 'en-US',
        naCountry: me.country ?? 'US',
        naBirthday: me.birthday ?? '1990-01-01',
      },
    }),
  });
  const login = await loginRes.json();
  const webToken = login?.result?.webApiServerCredential?.accessToken;
  if (!webToken) {
    throw new Error(`Login no NSO falhou (status ${login?.status ?? '?'}) — provável mudança na API; atualizar a function.`);
  }
  return { webToken, appVersion };
}

// deno-lint-ignore no-explicit-any
async function znc(auth: ZncAuth, path: string, parameter: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${ZNC}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${auth.webToken}`,
      'X-Platform': 'Android',
      'X-ProductVersion': auth.appVersion,
      'User-Agent': `com.nintendo.znca/${auth.appVersion}(Android/14)`,
    },
    body: JSON.stringify({ parameter }),
  });
  const data = await res.json();
  if (data?.status !== 0) throw new Error(`NSO ${path}: status ${data?.status}`);
  return data.result;
}

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

interface Presence {
  state?: string;
  logoutAt?: number;
  game?: { name?: string; totalPlayTime?: number; firstPlayedAt?: number };
}

/**
 * Acumula o jogo da presença de UM amigo (o atual/último): sync_data + track
 * + cópia. Retorna o nome do jogo acumulado (ou null).
 */
// deno-lint-ignore no-explicit-any
async function accumulate(admin: any, userId: string, presence: Presence | undefined, byKey: Map<string, string>) {
  const g = presence?.game;
  if (!g?.name) return null;
  const gid = byKey.get(`Switch|${keyTitle(g.name)}`) ?? byKey.get(`Switch 2|${keyTitle(g.name)}`);
  if (!gid) return `sem match: ${g.name}`;

  const hours = g.totalPlayTime ? Math.round((g.totalPlayTime / 60) * 10) / 10 : null;
  await admin.from('game_sync_data').upsert({
    user_id: userId, game_id: gid, provider: 'nintendo', platform: 'Switch',
    hours_played: hours,
    last_played: presence?.logoutAt ? new Date(presence.logoutAt * 1000).toISOString() : null,
    synced_at: new Date().toISOString(),
  }, { onConflict: 'user_id,game_id,provider' });

  const { data: track } = await admin.from('game_tracks')
    .select('source').eq('user_id', userId).eq('game_id', gid).maybeSingle();
  if (!track) {
    await admin.from('game_tracks').insert({
      user_id: userId, game_id: gid, status: 'playing', platform: 'Switch',
      hours_played: hours, source: 'nintendo',
    });
  }

  const { data: copy } = await admin.from('game_copies')
    .select('id').eq('user_id', userId).eq('game_id', gid).eq('store', 'Nintendo').maybeSingle();
  if (!copy) {
    await admin.from('game_copies').insert({
      user_id: userId, game_id: gid, platform: 'Switch', distribution: 'digital', store: 'Nintendo',
    });
  }

  await admin.from('user_accounts')
    .update({ last_sync: new Date().toISOString() })
    .eq('user_id', userId).eq('provider', 'nintendo');
  return g.name;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const sessionToken = Deno.env.get('NINTENDO_SESSION_TOKEN');
    const cronSecret = Deno.env.get('CRON_SECRET');
    if (!sessionToken) {
      return json({ error: 'NINTENDO_SESSION_TOKEN não configurado (npx nxapi nso auth na conta de serviço).' }, 500);
    }
    const admin = createClient(url, serviceKey);
    const auth = await zncLogin(sessionToken);

    const catalog = await fetchAll(() =>
      admin.from('games').select('id, title, platforms').contains('platforms', ['Switch']));
    const catalog2 = await fetchAll(() =>
      admin.from('games').select('id, title, platforms').contains('platforms', ['Switch 2']));
    const byKey = new Map<string, string>();
    for (const g of [...catalog, ...catalog2]) {
      for (const p of (g.platforms ?? []) as string[]) {
        byKey.set(`${p}|${norm(g.title)}`, g.id);
      }
    }

    // amigos da conta de serviço (a fonte de presença)
    const friendsRes = await znc(auth, '/v3/Friend/List', {});
    // deno-lint-ignore no-explicit-any
    const friends = (friendsRes?.friends ?? []) as any[];

    // MODO CRON: acumula presença de todo mundo vinculado
    if (cronSecret && req.headers.get('x-cron-secret') === cronSecret) {
      const accounts = await fetchAll(() =>
        admin.from('user_accounts').select('user_id, account_id').eq('provider', 'nintendo'));
      let ok = 0, absent = 0;
      for (const acc of accounts) {
        // account_id = nsaId (salvo no vínculo)
        const friend = friends.find((f) => f.nsaId === acc.account_id);
        if (!friend) { absent++; continue; }
        await accumulate(admin, acc.user_id as string, friend.presence, byKey);
        ok++;
      }
      await admin.from('job_runs').insert({ job: 'nintendo-cron', mode: 'cron', ok: true, stats: { accounts: accounts.length, synced: ok, not_friends_yet: absent } }).then(() => {}, () => {});
      return json({ ok: true, mode: 'cron', accounts: accounts.length, synced: ok, not_friends_yet: absent });
    }

    // MODO USUÁRIO: friend code -> amizade -> acumular presença
    const asUser = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const body = await req.json().catch(() => ({}));
    const rawCode = String(body.friend_code ?? '').trim();
    const code = rawCode.replace(/^SW-?/i, '').replace(/[^0-9]/g, '');
    if (code.length !== 12) return json({ error: 'Friend code inválido (formato SW-1234-5678-9012).' }, 400);
    const friendCode = `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;

    const target = await znc(auth, '/v3/Friend/GetUserByFriendCode', { friendCode });
    const nsaId = target?.nsaId;
    if (!nsaId) return json({ error: 'Friend code não encontrado.' }, 404);

    const friend = friends.find((f) => f.nsaId === nsaId);
    if (!friend) {
      // ainda não somos amigos: envia o pedido e instrui
      await znc(auth, '/v3/FriendRequest/Create', { nsaId });
      return json({
        ok: true, pending: true, nsa_id: nsaId,
        message: 'Pedido de amizade enviado! Aceite no seu Switch (ou no app) e clique em Sincronizar de novo.',
      });
    }

    const acc = await accumulate(admin, user.id, friend.presence, byKey);
    return json({
      ok: true, nsa_id: nsaId,
      accumulated: acc ?? 'nenhum jogo na presença agora — jogue algo e o sync diário acumula',
      note: 'A Nintendo só expõe o jogo atual/último: os jogos entram conforme você joga (sync diário).',
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
