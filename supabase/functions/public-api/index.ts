// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: API pública somente-leitura, autenticada por API key.
// A chave (rv_...) vai no header `x-api-key`; guardamos só o hash SHA-256, então
// aqui hasheamos o valor recebido e procuramos em api_keys.
//
// Deploy (SEM verificacao de JWT — a auth e' a nossa por x-api-key):
//   supabase functions deploy public-api --no-verify-jwt
//
// Rotas (GET):
//   /games?limit=&offset=&q=&platform=      /games/:slug
//   /romhacks?game=&limit=   /translations?game=   /documents?game=   /tools
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-api-key, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const MATERIALS = new Set(['romhacks', 'translations', 'documents', 'tools']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 1) auth por API key
  const key = req.headers.get('x-api-key');
  if (!key) return json({ error: 'Missing x-api-key header.' }, 401);
  const { data: keyRow } = await admin
    .from('api_keys')
    .select('id, usage_count, is_active')
    .eq('key_hash', await sha256Hex(key))
    .maybeSingle();
  if (!keyRow || !keyRow.is_active) return json({ error: 'Invalid or revoked API key.' }, 401);
  // uso (best-effort)
  admin.from('api_keys').update({ usage_count: (keyRow.usage_count ?? 0) + 1, last_used: new Date().toISOString() }).eq('id', keyRow.id).then(() => {});

  // 2) roteamento
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('public-api');
  const route = i >= 0 ? parts.slice(i + 1) : parts;
  const resource = route[0] ?? '';
  const p = url.searchParams;
  const limit = Math.min(Number(p.get('limit')) || 20, 100);
  const offset = Number(p.get('offset')) || 0;

  try {
    if (resource === 'games') {
      if (route[1]) {
        const { data, error } = await admin.from('games').select('*').eq('slug', route[1]).maybeSingle();
        if (error) throw error;
        return data ? json(data) : json({ error: 'Not found' }, 404);
      }
      let q = admin.from('games').select('*', { count: 'exact' });
      if (p.get('q')) q = q.ilike('title', `%${p.get('q')}%`);
      if (p.get('platform')) q = q.contains('platforms', [p.get('platform')]);
      const { data, count, error } = await q.order('title').range(offset, offset + limit - 1);
      if (error) throw error;
      return json({ data, count, limit, offset });
    }

    if (MATERIALS.has(resource)) {
      let q = admin.from(resource).select('*', { count: 'exact' });
      if (resource !== 'tools') q = q.eq('is_public', true);
      if (p.get('game') && resource !== 'tools') q = q.eq('game_id', p.get('game'));
      const { data, count, error } = await q.order('downloads', { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw error;
      return json({ data, count, limit, offset });
    }

    return json({ error: 'Unknown resource. Try /games, /romhacks, /translations, /documents, /tools.' }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
