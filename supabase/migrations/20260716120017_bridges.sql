-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — PONTES hub <-> tracker (identidade: trackear a experiência
-- PATCHEADA, não só o jogo). Idempotente.
--   1) Zerada com patch: playthrough registra a tradução/hack usada.
--   2) Cópia com patch: repro/EverDrive/ISO patcheada aponta o material.
--   3) patch_usage(): contagem pública "N zeraram com esta tradução"
--      (security definer: agrega sem expor linhas privadas).
--   4) user_accounts: contas vinculadas (Steam, RetroAchievements...) pro
--      sync automático estilo PlayTracker.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.game_playthroughs
  add column if not exists patch_kind text check (patch_kind in ('translation', 'romhack')),
  add column if not exists patch_id uuid;
create index if not exists playthroughs_patch_idx
  on public.game_playthroughs (patch_kind, patch_id) where patch_id is not null;

alter table public.game_copies
  add column if not exists patch_kind text check (patch_kind in ('translation', 'romhack')),
  add column if not exists patch_id uuid;

-- "N pessoas zeraram com esta tradução/hack" — soma TODAS as zeradas (públicas
-- e privadas) sem expor nenhuma linha: só o agregado sai.
create or replace function public.patch_usage(kind text, id uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*) from public.game_playthroughs
  where patch_kind = kind and patch_id = id;
$$;
grant execute on function public.patch_usage(text, uuid) to anon, authenticated;

-- contas vinculadas (o "Account links" do PlayTracker): 1 por provedor/usuário
create table if not exists public.user_accounts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  provider   text not null check (provider in
    ('steam', 'retroachievements', 'psn', 'xbox', 'nintendo', 'gog', 'epic')),
  account_id text not null,          -- steamid64, username do RA, gamertag...
  linked_at  timestamptz not null default now(),
  last_sync  timestamptz,
  primary key (user_id, provider)
);
alter table public.user_accounts enable row level security;

drop policy if exists "accounts: self" on public.user_accounts;
create policy "accounts: self" on public.user_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
