-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — Storage (uploads de patches, thumbnails, screenshots)
--   Bucket público `uploads`. Leitura pública; escrita só do dono, e cada
--   usuário só grava dentro da sua própria pasta (primeiro segmento = uid).
--   Idempotente: seguro reexecutar.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

-- Leitura pública dos arquivos do bucket
drop policy if exists "uploads: public read" on storage.objects;
create policy "uploads: public read" on storage.objects
  for select using (bucket_id = 'uploads');

-- Upload: só autenticado, e só na própria pasta (name começa com "<uid>/")
drop policy if exists "uploads: insert own" on storage.objects;
create policy "uploads: insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Atualizar/remover só os próprios objetos
drop policy if exists "uploads: update own" on storage.objects;
create policy "uploads: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'uploads' and owner = auth.uid());

drop policy if exists "uploads: delete own" on storage.objects;
create policy "uploads: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'uploads' and owner = auth.uid());
