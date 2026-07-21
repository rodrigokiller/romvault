-- ═══════════════════════════════════════════════════════════════════════════
-- 46) SEGREDOS DE CONTA (token de refresh da Epic, aprovado pelo Killer).
--
--   Guardar credencial de terceiro exige três cuidados, e os três estão aqui:
--   1) CRIPTOGRAFADA: a edge function grava AES-GCM (chave em TOKEN_ENC_KEY,
--      secret do Supabase). O banco nunca vê o token em claro.
--   2) FORA DO ALCANCE DE TODOS: RLS ligado e NENHUMA policy — nem o próprio
--      dono consegue ler esta tabela pelo cliente. Só a service role (edge).
--   3) SOME JUNTO: FK para user_accounts com ON DELETE CASCADE — desvincular a
--      conta apaga o segredo automaticamente.
--   Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.user_account_secrets (
  user_id    uuid not null,
  provider   text not null,
  secret_enc text not null,             -- AES-GCM (iv + ciphertext) em base64
  updated_at timestamptz not null default now(),
  primary key (user_id, provider),
  foreign key (user_id, provider)
    references public.user_accounts (user_id, provider) on delete cascade
);

alter table public.user_account_secrets enable row level security;
-- Sem policies DE PROPÓSITO: sem service role, ninguém lê nem escreve.
drop policy if exists "secrets: none" on public.user_account_secrets;
