-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — fecha o ciclo do reporte: resolver no admin gera notificação
-- pro autor ("seu reporte sobre X foi resolvido"). Insert em notifications é
-- service-only, então um TRIGGER (security definer) faz o trabalho.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('backlog_translation', 'system', 'report_resolved'));

create or replace function public.report_resolved_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.resolved_at is not null and old.resolved_at is null then
    insert into public.notifications (user_id, kind, ref, payload)
    values (
      new.user_id,
      'report_resolved',
      'report:' || new.id::text,
      jsonb_build_object('label', new.subject_label, 'url', new.subject_url)
    )
    on conflict (user_id, kind, ref) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists report_resolved_notify_trg on public.reports;
create trigger report_resolved_notify_trg
  after update on public.reports
  for each row execute function public.report_resolved_notify();
