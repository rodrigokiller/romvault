-- ═══════════════════════════════════════════════════════════════════════════
-- 44) DETALHES DA PLATAFORMA (pedido do Killer): cada plataforma vira uma
--   "página nossa" com dados TÉCNICOS — descrição, imagem do console, datas de
--   lançamento por região, fabricante, geração, mídia e specs livres. A carga
--   inicial vem de um scraper da Wikipedia (--source=platform-wiki), depois o
--   admin ajusta pelo painel da própria página.
--   Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.platforms
  add column if not exists description   text,
  add column if not exists image_url     text,
  add column if not exists wikipedia_url text,
  add column if not exists manufacturer  text,
  add column if not exists generation    text,       -- "4ª geração" / "fifth generation"
  add column if not exists media         text,       -- cartucho / CD-ROM / ...
  add column if not exists units_sold    text,       -- "49,1 milhões" (ranges/texto)
  add column if not exists discontinued  text,       -- datas variam/são ranges
  add column if not exists releases      jsonb not null default '{}'::jsonb, -- {na,jp,eu,br,...} texto (ano ou data)
  add column if not exists specs         jsonb not null default '{}'::jsonb; -- cpu/ram/tela/... livres

-- escrita: admin edita pelo painel (a leitura já é pública pela policy antiga)
drop policy if exists "platforms: admin write" on public.platforms;
create policy "platforms: admin write" on public.platforms
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
