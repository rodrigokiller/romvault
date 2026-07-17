// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: digest "seu backlog ganhou tradução".
// Cruza traduções PUBLICADAS nos últimos N dias com os backlogs dos usuários
// e insere notificações (dedupe por user+translation via índice único).
// A notificação que só o ROMVault consegue mandar.
//
// Auth: x-cron-secret == CRON_SECRET (pg_cron)  OU  JWT de admin (teste manual).
// Deploy:  supabase functions deploy backlog-digest --no-verify-jwt
// Agendar: select setup_digest_cron('https://.../backlog-digest', 'SEGREDO');
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const cronSecret = Deno.env.get('CRON_SECRET');
    const admin = createClient(url, serviceKey);

    // auth: cron OU admin logado
    const viaCron = Boolean(cronSecret) && req.headers.get('x-cron-secret') === cronSecret;
    if (!viaCron) {
      const asUser = createClient(url, anonKey, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      });
      const { data: { user } } = await asUser.auth.getUser();
      if (!user) return json({ error: 'Não autenticado.' }, 401);
      const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
      if (!prof?.is_admin) return json({ error: 'Só admins disparam o digest manualmente.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const days = Math.min(60, Math.max(1, Number(body.days ?? 8)));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    // 1) traduções novas do período (públicas, com jogo)
    const fresh = await fetchAll(() =>
      admin.from('translations')
        .select('id, game_id, language, title, created_at, game:games(title, slug)')
        .eq('is_public', true)
        .not('game_id', 'is', null)
        .gte('created_at', since));
    if (fresh.length === 0) return json({ ok: true, translations: 0, notified: 0 });

    const byGame = new Map<string, typeof fresh>();
    for (const tr of fresh) {
      byGame.set(tr.game_id as string, [...(byGame.get(tr.game_id as string) ?? []), tr]);
    }

    // 2) quem tem esses jogos no BACKLOG
    const tracks = await fetchAll(() =>
      admin.from('game_tracks')
        .select('user_id, game_id')
        .eq('status', 'backlog')
        .in('game_id', [...byGame.keys()]));

    // 3) monta notificações (dedupe fica com o índice único: ignoreDuplicates)
    const rows: Record<string, unknown>[] = [];
    for (const tr of tracks) {
      for (const t of byGame.get(tr.game_id as string) ?? []) {
        rows.push({
          user_id: tr.user_id,
          kind: 'backlog_translation',
          ref: String(t.id),
          payload: {
            translation_id: t.id,
            language: t.language ?? null,
            game_id: tr.game_id,
            game_title: (t.game as { title?: string } | null)?.title ?? null,
            game_slug: (t.game as { slug?: string } | null)?.slug ?? null,
          },
        });
      }
    }
    let notified = 0;
    const inserted: Record<string, unknown>[] = [];
    for (let i = 0; i < rows.length; i += 500) {
      const { data } = await admin.from('notifications')
        .upsert(rows.slice(i, i + 500), { onConflict: 'user_id,kind,ref', ignoreDuplicates: true })
        .select('id, user_id, payload');
      notified += (data ?? []).length;
      inserted.push(...(data ?? []));
    }

    // e-mail OPT-IN (profiles.email_digest) via Resend — 1 e-mail por usuário
    // com a lista da semana. Sem RESEND_API_KEY, o digest segue só no sino.
    let emailed = 0;
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey && inserted.length > 0) {
      const siteUrl = Deno.env.get('SITE_URL') ?? 'https://romvault.vercel.app';
      const from = Deno.env.get('RESEND_FROM') ?? 'ROMVault <onboarding@resend.dev>';
      const byUser = new Map<string, { game_title?: string; game_slug?: string; language?: string }[]>();
      for (const n of inserted) {
        const uid = n.user_id as string;
        byUser.set(uid, [...(byUser.get(uid) ?? []), n.payload as never]);
      }
      const { data: optIns } = await admin.from('profiles')
        .select('id').eq('email_digest', true).in('id', [...byUser.keys()]);
      for (const p of optIns ?? []) {
        const { data: au } = await admin.auth.admin.getUserById(p.id as string);
        const email = au?.user?.email;
        if (!email) continue;
        const items = byUser.get(p.id as string) ?? [];
        const list = items.map((x) =>
          `<li><a href="${siteUrl}/games/${x.game_slug ?? ''}">${x.game_title ?? '?'}</a> — ${x.language ?? '?'}</li>`).join('');
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: [email],
            subject: `Seu backlog ganhou ${items.length === 1 ? 'uma tradução' : `${items.length} traduções`} — ROMVault`,
            html: `<p>Jogos do seu backlog que ganharam tradução:</p><ul>${list}</ul>`
              + `<p><a href="${siteUrl}">Abrir o ROMVault</a> · Pra parar de receber: Configurações → Privacidade.</p>`,
          }),
        });
        if (res.ok) emailed++;
      }
    }

    return json({ ok: true, translations: fresh.length, candidates: rows.length, notified, emailed });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
