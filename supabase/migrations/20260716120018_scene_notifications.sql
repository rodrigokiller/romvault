-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — cena pública + notificações + syncs agendados. Idempotente.
--   1) notifications: "um jogo do seu backlog ganhou tradução" e afins.
--   2) scene_top_patches(): ranking público de traduções/hacks mais zerados.
--   3) setup_ra_cron / setup_digest_cron: agendadores (mesmo padrão do IGDB —
--      segredos entram como parâmetro no SQL Editor, nunca no repo).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) notificações por usuário
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('backlog_translation', 'system')),
  ref        text not null default '',             -- chave de dedupe (ex.: translation_id)
  payload    jsonb not null default '{}'::jsonb,   -- { game_id, game_title, game_slug, translation_id, language }
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
-- dedupe do digest: 1 notificação por usuário+kind+ref
create unique index if not exists notifications_dedupe_idx
  on public.notifications (user_id, kind, ref);

alter table public.notifications enable row level security;
drop policy if exists "notifications: read self" on public.notifications;
create policy "notifications: read self" on public.notifications
  for select using (auth.uid() = user_id);
drop policy if exists "notifications: update self" on public.notifications;
create policy "notifications: update self" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- insert é só do service role (edge functions) — sem policy de insert.

-- 2) ranking público da cena: patches mais zerados (agregado, sem expor linhas)
create or replace function public.scene_top_patches(lim integer default 20)
returns table(patch_kind text, patch_id uuid, n bigint)
language sql
security definer
set search_path = public
as $$
  select patch_kind, patch_id, count(*) as n
  from public.game_playthroughs
  where patch_id is not null
  group by patch_kind, patch_id
  order by n desc
  limit lim;
$$;
grant execute on function public.scene_top_patches(integer) to anon, authenticated;

-- 3a) sync diário do RetroAchievements (todas as contas vinculadas)
create or replace function public.setup_ra_cron(
  fn_url    text,
  secret    text,
  cron_expr text default '30 5 * * *'   -- todo dia 05:30 UTC
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  perform cron.unschedule('ra-sync-all')
  where exists (select 1 from cron.job where jobname = 'ra-sync-all');
  perform cron.schedule(
    'ra-sync-all',
    cron_expr,
    format(
      $job$ select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', %L),
        body := '{}'::jsonb
      ); $job$,
      fn_url, secret
    )
  );
  return 'agendado: ra-sync-all @ ' || cron_expr;
end;
$$;
revoke execute on function public.setup_ra_cron(text, text, text) from anon, authenticated;

-- 3b) digest semanal "seu backlog ganhou tradução"
create or replace function public.setup_digest_cron(
  fn_url    text,
  secret    text,
  cron_expr text default '0 12 * * 5'   -- toda sexta 12:00 UTC
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  perform cron.unschedule('backlog-digest')
  where exists (select 1 from cron.job where jobname = 'backlog-digest');
  perform cron.schedule(
    'backlog-digest',
    cron_expr,
    format(
      $job$ select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', %L),
        body := jsonb_build_object('days', 8)
      ); $job$,
      fn_url, secret
    )
  );
  return 'agendado: backlog-digest @ ' || cron_expr;
end;
$$;
revoke execute on function public.setup_digest_cron(text, text, text) from anon, authenticated;
