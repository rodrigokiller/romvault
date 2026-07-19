-- ═══════════════════════════════════════════════════════════════════════════
-- 35) FILA DE VINCULAÇÃO (sugestões aceitas pelo Killer):
--   a) alias_pending: plataforma/gênero desconhecido encontrado num import
--      vira registro pra cadastro (a "regra 2" com formulário, não log perdido)
--   b) link_candidates(): pares de jogos com MESMO título em plataformas
--      diferentes SEM relação registrada — fila da ferramenta visual (fase 2)
--   c) data-fix: normaliza os gêneros CRUS herdados dos imports RHDN/PO.B.R.E
--      ("Action > Platformer" -> "Platform", "Ação" -> "Action") via
--      genre_aliases — a resposta ao "tenho que reimportar?": NÃO.
--   Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

/* ── a) aliases pendentes de cadastro ─────────────────────────────────────── */
create table if not exists public.alias_pending (
  source       text not null,          -- rhdn | pobre | smwcentral | ...
  kind         text not null check (kind in ('platform', 'genre')),
  external_key text not null,          -- o valor cru encontrado na fonte
  context      text,                   -- ex.: título do item onde apareceu
  times        int  not null default 1,
  first_seen   timestamptz not null default now(),
  primary key (source, kind, external_key)
);
alter table public.alias_pending enable row level security;
drop policy if exists "alias_pending: admin read" on public.alias_pending;
create policy "alias_pending: admin read" on public.alias_pending
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );
-- escrita: service role (importers CLI/edge) — sem policy de write.

/* ── b) candidatos a vínculo: título igual, plataformas diferentes, sem
       relação — só agregados, SECURITY DEFINER com trava de admin ─────────── */
create or replace function public.link_candidates(lim int default 40)
returns table (title text, ids uuid[], slugs text[], platforms text[])
language sql
security definer
stable
set search_path = public
as $$
  with grupos as (
    select
      min(g.title) as title,
      array_agg(g.id) as ids,
      array_agg(g.slug) as slugs,
      array_agg(coalesce(g.platforms[1], '?')) as plats,
      count(*) as n
    from public.games g
    group by lower(g.title)
    having count(*) > 1
  )
  select gr.title, gr.ids, gr.slugs, gr.plats
  from grupos gr
  where (select p.is_admin from public.profiles p where p.id = auth.uid())
    and not exists (
      select 1 from public.game_relations r
      where r.game_id = any(gr.ids) and r.related_id = any(gr.ids)
    )
  order by gr.n desc, gr.title
  limit lim;
$$;
grant execute on function public.link_candidates(int) to authenticated;

/* ── c) data-fix: gêneros herdados de RHDN/PO.B.R.E -> canônicos ──────────── */
with mapped as (
  select g.id,
    (select array_agg(distinct coalesce(gn.name, raw.v))
       from unnest(g.genres) as raw(v)
       left join public.genre_aliases ga
         on ga.source = case g.data_source
              when 'romhacking.net' then 'rhdn'
              when 'romhackers.org' then 'pobre'
            end
        and ga.external_key = raw.v
       left join public.genres gn on gn.slug = ga.genre
    ) as novo
  from public.games g
  where g.data_source in ('romhacking.net', 'romhackers.org')
    and coalesce(array_length(g.genres, 1), 0) > 0
)
update public.games g
set genres = mapped.novo
from mapped
where g.id = mapped.id
  and g.genres is distinct from mapped.novo;
