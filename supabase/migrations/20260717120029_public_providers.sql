-- ═══════════════════════════════════════════════════════════════════════════
-- 29) Badge "biblioteca verificada por sync" no perfil público.
--   user_accounts é RLS só-dono (account_id é dado sensível), mas a LISTA de
--   provedores conectados é prova social inofensiva — este RPC expõe SÓ os
--   nomes dos provedores, e só quando a biblioteca do perfil é pública
--   (mesmo porteiro library_public das tabelas do tracker). Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.public_synced_providers(p_username text)
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(array_agg(ua.provider order by ua.provider), '{}')
  from public.user_accounts ua
  join public.profiles p on p.id = ua.user_id
  where p.username = p_username
    and (p.library_public or p.id = auth.uid());
$$;

grant execute on function public.public_synced_providers(text) to anon, authenticated;
