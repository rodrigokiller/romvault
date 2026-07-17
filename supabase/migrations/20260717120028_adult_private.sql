-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — conteúdo ADULTO (+18) e jogos PRIVADOS (estilo Steam).
--
--   is_adult (games): marcado pelos importers (tema "Erotic" do IGDB, rating
--   AO). Escondido do catálogo/busca por padrão; profiles.show_adult libera.
--
--   is_private (game_tracks/game_copies): o usuário esconde um jogo SEU da
--   biblioteca/vitrine públicas (Steam não expõe o flag de oculto via API,
--   então aqui é manual e vale pra TODOS os provedores). Policies RESTRICTIVE
--   garantem no banco: linha privada só sai pro dono, sem depender da UI.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.games
  add column if not exists is_adult boolean not null default false;
alter table public.profiles
  add column if not exists show_adult boolean not null default false;
alter table public.game_tracks
  add column if not exists is_private boolean not null default false;
alter table public.game_copies
  add column if not exists is_private boolean not null default false;

-- backfill: o que já entrou com tema Erotic (IGDB) ou rating AO vira adulto
update public.games
set is_adult = true
where is_adult = false
  and ('Erotic' = any (themes) or coalesce(age_rating, '') ilike '%AO%');

-- privadas só pro dono (RESTRICTIVE = AND com as policies existentes,
-- não precisa conhecer/alterar as permissivas atuais)
drop policy if exists "tracks: private only owner" on public.game_tracks;
create policy "tracks: private only owner" on public.game_tracks
  as restrictive for select
  using (not is_private or auth.uid() = user_id);

drop policy if exists "copies: private only owner" on public.game_copies;
create policy "copies: private only owner" on public.game_copies
  as restrictive for select
  using (not is_private or auth.uid() = user_id);
