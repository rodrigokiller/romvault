// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: hacks NOVOS do SMW Central (incremental).
//
// O CLI (--source=smwc) faz a carga toda; esta função só pega os LANÇAMENTOS
// novos (páginas mais recentes de smwhacks) e insere os que faltam, ligados ao
// jogo Super Mario World. Dedupe via id_map (source='smwcentral',
// entity='romhack:smw') — o MESMO do CLI, então os dois se completam.
//
// Deploy: supabase functions deploy smwc-scrape --no-verify-jwt
// Cron: select public.setup_import_cron('smwc-scrape', '.../smwc-scrape',
//   'CRON-SECRET', '{}'::jsonb, '45 8 * * *');
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const stripHtml = (s: unknown) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
// deno-lint-ignore no-explicit-any
const smwcImages = (h: any): string[] =>
  (Array.isArray(h.images) ? h.images : [])
    .map((u: string) => (String(u).startsWith('//') ? 'https:' + u : String(u)))
    .filter((u: string) => /^https:\/\//.test(u))
    .slice(0, 8);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const cronSecret = Deno.env.get('CRON_SECRET');
    const isCron = Boolean(cronSecret) && req.headers.get('x-cron-secret') === cronSecret;
    if (!isCron) {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const asUser = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data: { user } } = await asUser.auth.getUser();
      if (!user) return json({ error: 'Não autenticado.' }, 401);
      const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
      if (!prof?.is_admin) return json({ error: 'Apenas admins.' }, 403);
    }

    const source = 'smwcentral', entity = 'romhack:smw';
    // jogo-base
    let { data: game } = await admin.from('games').select('id, title').eq('slug', 'super-mario-world').maybeSingle();
    if (!game) {
      const { data } = await admin.from('games').select('id, title').ilike('title', 'Super Mario World').contains('platforms', ['SNES']).limit(1);
      game = data?.[0] ?? null;
    }
    if (!game) return json({ error: 'Jogo-base Super Mario World não está no catálogo.' }, 404);

    // ids já importados (dedupe)
    const seen = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data } = await admin.from('id_map').select('external_id').eq('source', source).eq('entity', entity).range(from, from + 999);
      for (const r of (data ?? []) as { external_id: string }[]) seen.add(r.external_id);
      if (!data || data.length < 1000) break;
    }

    const maxPages = Math.min(Number(body.pages) || 3, 10);
    const stats = { novos: 0, jaTinha: 0, paginas: 0 };
    for (let page = 1; page <= maxPages; page++) {
      const res = await fetch(`https://www.smwcentral.net/ajax.php?a=getsectionlist&s=smwhacks&u=0&n=${page}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (RomVault scene bot)', Accept: 'application/json' },
      });
      if (!res.ok) break;
      const bodyJson = await res.json().catch(() => null);
      // deno-lint-ignore no-explicit-any
      const hacks = (bodyJson?.data ?? []) as any[];
      if (hacks.length === 0) break;
      stats.paginas++;

      let novosNaPagina = 0;
      for (const h of hacks) {
        const extId = String(h.id);
        if (seen.has(extId)) { stats.jaTinha++; continue; }
        const f = h.fields ?? {};
        const authors = Array.isArray(h.authors) ? h.authors.map((a: { name?: string }) => a?.name).filter(Boolean).join(', ') : null;
        const imgs = smwcImages(h);
        const row = {
          game_id: game.id,
          title: stripHtml(h.name) || `SMWC #${extId}`,
          description: stripHtml(f.description) || null,
          thumbnail: imgs[0] ?? null,
          screenshots: imgs,
          categories: ['Levels'],
          difficulty: typeof f.difficulty === 'string' ? stripHtml(f.difficulty) : null,
          hack_type: (typeof f.length === 'string' || typeof f.length === 'number') ? `${f.length} exits` : null,
          tags: Array.isArray(h.tags) ? h.tags.map((t: string) => stripHtml(t)).filter(Boolean).slice(0, 12) : [],
          credits: authors,
          downloads: Number(h.downloads) || 0,
          rating: Number(h.rating) || 0,
          release_date: h.time ? new Date(h.time * 1000).toISOString().slice(0, 10) : null,
          file_url: h.download_url ? (String(h.download_url).startsWith('//') ? 'https:' + h.download_url : String(h.download_url)) : null,
          data_source: 'smwcentral',
          source_url: `https://www.smwcentral.net/?p=section&a=details&id=${extId}`,
          is_public: true,
        };
        const { data: ins, error } = await admin.from('romhacks').insert(row).select('id').single();
        if (error || !ins) continue;
        seen.add(extId);
        stats.novos++; novosNaPagina++;
        await admin.from('id_map').upsert(
          { romvault_id: ins.id, source, entity, external_id: extId, confidence: 1, match_type: 'external_id' },
          { onConflict: 'source,entity,external_id' },
        ).then(() => {}, () => {});
      }
      // páginas vêm do mais novo pro mais velho: se uma inteira já era conhecida,
      // já alcançamos o que tínhamos — para.
      if (novosNaPagina === 0) break;
    }

    await admin.from('job_runs').insert({ job: 'smwc-scrape', mode: isCron ? 'cron' : 'manual', ok: true, stats }).then(() => {}, () => {});
    return json({ ok: true, ...stats });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
