-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — status das integrações (painel admin): contas vinculadas e
-- último sync por provedor. SECURITY DEFINER + trava de admin (user_accounts
-- tem RLS self-only; o agregado só sai pra admins).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.integrations_status()
returns table(provider text, accounts bigint, last_sync timestamptz)
language sql
security definer
set search_path = public
as $$
  select ua.provider, count(*) as accounts, max(ua.last_sync) as last_sync
  from public.user_accounts ua
  where exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  group by ua.provider
  order by ua.provider;
$$;
grant execute on function public.integrations_status() to authenticated;
