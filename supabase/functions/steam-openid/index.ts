// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: verificação do "Entrar com a Steam" (OpenID 2.0).
// O cliente redireciona pro login da Steam; a Steam volta pro /settings com
// os parâmetros openid.*; aqui validamos com check_authentication (server a
// server, à prova de falsificação) e devolvemos o SteamID64 — o usuário nem
// precisa saber o que é um SteamID.
//
// Sem segredo (OpenID da Steam não usa key).
// Deploy: supabase functions deploy steam-openid --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const asUser = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const body = await req.json().catch(() => ({}));
    const raw = String(body.query ?? '');
    const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
    if (params.get('openid.mode') !== 'id_res') {
      return json({ error: 'Resposta OpenID inválida.' }, 400);
    }

    // valida a assinatura com a própria Steam
    params.set('openid.mode', 'check_authentication');
    const verify = await fetch('https://steamcommunity.com/openid/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const text = await verify.text();
    if (!/is_valid\s*:\s*true/.test(text)) {
      return json({ error: 'A Steam não confirmou o login (tente de novo).' }, 401);
    }

    const claimed = params.get('openid.claimed_id') ?? '';
    const steamid = claimed.match(/\/openid\/id\/(\d{17})/)?.[1];
    if (!steamid) return json({ error: 'SteamID não encontrado na resposta.' }, 400);

    return json({ ok: true, steamid });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
