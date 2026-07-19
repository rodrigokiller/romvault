-- ═══════════════════════════════════════════════════════════════════════════
-- 39) Editor de entidades no /admin ("edit estilo banco"): admins podem
--   ATUALIZAR qualquer jogo/material/artigo pelo painel (as policies antigas
--   eram só "update own"). Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare tbl text;
begin
  foreach tbl in array array['games', 'romhacks', 'translations', 'documents', 'tools', 'articles'] loop
    execute format('drop policy if exists "%s: admin update" on public.%I', tbl, tbl);
    execute format(
      'create policy "%s: admin update" on public.%I for update using (
         exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
       ) with check (
         exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
       )', tbl, tbl);
  end loop;
end;
$$;
