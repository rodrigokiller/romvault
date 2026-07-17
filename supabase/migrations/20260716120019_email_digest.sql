-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — opt-in do digest por E-MAIL ("seu backlog ganhou tradução").
-- Padrão DESLIGADO: e-mail só pra quem pedir nas configurações. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists email_digest boolean not null default false;
