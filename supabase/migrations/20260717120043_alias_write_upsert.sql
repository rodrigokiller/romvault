-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: cadastrar/ajustar um alias de plataforma (ou gênero) que JÁ existe dava
-- erro 42501 "new row violates row-level security policy (USING expression)".
--
-- Causa: o painel faz UPSERT (INSERT ... ON CONFLICT DO UPDATE). A policy antiga
-- era só FOR INSERT WITH CHECK, então quando a chave (source,external_key) já
-- existia o Postgres caía no ramo UPDATE — que não tinha policy nenhuma e era
-- negado (o tell "(USING expression)" é justamente o ramo de update do upsert).
--
-- Correção: trocar as policies de escrita de admin de FOR INSERT para FOR ALL
-- (insert + update + delete), com USING e WITH CHECK. O SELECT continua aberto
-- a todos pela policy "read" separada (policies permissivas são OR).
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "platform_aliases: admin write" on public.platform_aliases;
create policy "platform_aliases: admin write" on public.platform_aliases
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "genre_aliases: admin write" on public.genre_aliases;
create policy "genre_aliases: admin write" on public.genre_aliases
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
