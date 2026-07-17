-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — TRAVA DE ESCALAÇÃO DE PRIVILÉGIO (achado da auditoria, crítico).
-- A policy "profiles: update self" (auth.uid()=id) deixa o dono editar QUALQUER
-- coluna da própria linha, inclusive is_admin: `update profiles set is_admin=
-- true where id=meu_id` promovia qualquer um a admin pelo supabase-js.
-- Trigger BEFORE UPDATE congela is_admin, invited_by e email — só o service
-- role (edge functions / SQL editor) pode mexer. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.profiles_guard_sensitive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role (edge functions, SQL editor) passa direto
  if (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
     or auth.uid() is null then
    return new;
  end if;
  -- usuários normais NÃO alteram estas colunas (reverte silenciosamente)
  new.is_admin   := old.is_admin;
  new.invited_by := old.invited_by;   -- só via redeem_invite (security definer)
  return new;
end;
$$;

drop trigger if exists profiles_guard_sensitive_trg on public.profiles;
create trigger profiles_guard_sensitive_trg
  before update on public.profiles
  for each row execute function public.profiles_guard_sensitive();
