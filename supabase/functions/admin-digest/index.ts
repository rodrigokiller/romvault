// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: DIGEST DO ADMIN (semanal via cron, ou manual pelo
// painel). Junta os números da fila de vinculação (admin_queue_stats) e manda
// por e-mail (Resend) pra todos os admins: o hub avisa onde precisa de
// curadoria em vez do admin lembrar de abrir o painel.
//
// Auth: x-cron-secret == CRON_SECRET (cron) OU JWT de admin (botão no painel).
// Segredos: RESEND_API_KEY (+ RESEND_FROM, SITE_URL opcionais), CRON_SECRET.
// Deploy: supabase functions deploy admin-digest --no-verify-jwt
// Agendar: select public.setup_admin_digest_cron('<url>/functions/v1/admin-digest', '<CRON_SECRET>');
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

interface QueueStats {
  sem_igdb: number;
  candidatos: number;
  aliases: number;
  misses_7d: number;
  amostra_aliases: { source: string; kind: string; external_key: string }[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(url, serviceKey);

    // auth: cron OU admin logado
    const cronSecret = Deno.env.get('CRON_SECRET');
    const viaCron = Boolean(cronSecret) && req.headers.get('x-cron-secret') === cronSecret;
    if (!viaCron) {
      const asUser = createClient(url, anonKey, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      });
      const { data: { user } } = await asUser.auth.getUser();
      if (!user) return json({ error: 'Não autenticado.' }, 401);
      const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
      if (!prof?.is_admin) return json({ error: 'Só admins.' }, 403);
    }

    const { data: stats, error: stErr } = await admin.rpc('admin_queue_stats');
    if (stErr) return json({ error: `admin_queue_stats: ${stErr.message} (migration 36 aplicada?)` }, 500);
    const s = stats as QueueStats;

    // TENDÊNCIA: compara com a edição anterior (curadoria vira progresso
    // visível, "12 -> 8", não só pilha)
    const { data: prevRun } = await admin.from('job_runs')
      .select('stats').eq('job', 'admin-digest')
      .order('finished_at', { ascending: false }).limit(1).maybeSingle();
    const prev = (prevRun?.stats ?? null) as Partial<QueueStats> | null;
    const trend = (now: number, before: number | undefined) =>
      before === undefined || before === now
        ? `<b>${now}</b>`
        : `<b>${now}</b> <span style="color:${now < before ? '#1a7f4e' : '#b3541e'}">(antes ${before})</span>`;

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ ok: true, sent: 0, stats: s, note: 'RESEND_API_KEY ausente: só os números.' });

    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://romvault.app';
    const from = Deno.env.get('RESEND_FROM') ?? 'ROMVault <onboarding@resend.dev>';

    const { data: admins } = await admin.from('profiles').select('id, username').eq('is_admin', true);
    const aliasList = (s.amostra_aliases ?? [])
      .map((a) => `<li><code>${a.external_key}</code> (${a.source} · ${a.kind})</li>`).join('');
    const html =
      `<h2>Fila de vinculação desta semana</h2>` +
      `<ul>` +
      `<li>${trend(s.sem_igdb, prev?.sem_igdb)} jogos criados por sync sem vínculo IGDB</li>` +
      `<li>${trend(s.candidatos, prev?.candidatos)} títulos duplicados sem relação registrada</li>` +
      `<li>${trend(s.aliases, prev?.aliases)} aliases de plataforma/gênero pra cadastrar</li>` +
      `<li>${trend(s.misses_7d, prev?.misses_7d)} jogos sem match nos syncs dos últimos 7 dias</li>` +
      `</ul>` +
      (aliasList ? `<h3>Aliases recentes</h3><ul>${aliasList}</ul>` : '') +
      `<p><a href="${siteUrl}/admin">Abrir o painel de admin</a></p>`;

    let sent = 0;
    let failed = 0;
    for (const p of admins ?? []) {
      const { data: au } = await admin.auth.admin.getUserById(p.id as string);
      const email = au?.user?.email;
      if (!email) continue;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [email],
          subject: `Curadoria da semana: ${s.sem_igdb + s.candidatos + s.aliases} pendências — ROMVault`,
          html,
        }),
      });
      if (res.ok) sent++;
      else failed++;
      await new Promise((r) => setTimeout(r, 600)); // Resend: 2 req/s
    }

    if (viaCron) {
      await admin.from('job_runs').insert({
        job: 'admin-digest', mode: 'cron', ok: failed === 0,
        stats: { sent, failed, ...s, amostra_aliases: undefined },
      }).then(() => {}, () => {});
    }
    return json({ ok: true, sent, failed, stats: s });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
