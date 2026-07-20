import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MonitorPlay, Gamepad2, Trash2, SquarePen } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useIsAdmin } from '@/hooks/useProfile';
import { useToast } from '@/components/ui/Toast';
import { useGamesPage } from '@/hooks/useGames';
import { GameCard } from '@/components/entities/GameCard';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';
import { PLATFORM_THEMES } from '@/lib/platformThemes';

/** fontes que usam alias de plataforma (de→para do importer) */
const ALIAS_SOURCES = ['igdb', 'rhdn', 'mobygames', 'screenscraper', 'libretro', 'smwcentral', 'pobre', 'steam', 'gog', 'psn', 'xbox', 'nintendo'];

const db = () => getSupabase() as unknown as SupabaseClient;

interface PlatformRow {
  slug: string; name: string; full_name: string | null; family: string | null; sort: number;
  description?: string | null; image_url?: string | null; wikipedia_url?: string | null;
  manufacturer?: string | null; generation?: string | null; media?: string | null;
  units_sold?: string | null; discontinued?: string | null;
  releases?: Record<string, string> | null; specs?: Record<string, string> | null;
}

/** Plataformas canônicas (migration 33), agrupadas por família. */
function usePlatforms() {
  return useQuery({
    queryKey: ['platformsIndex'],
    enabled: env.configured,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<PlatformRow[]> => {
      const { data, error } = await db().from('platforms').select('*').order('sort');
      if (error) return [];
      return (data ?? []) as PlatformRow[];
    },
  });
}

/** Contagem de jogos por plataforma (RPC games_per_platform já existia). */
function usePlatformCounts() {
  return useQuery({
    queryKey: ['platformCounts'],
    enabled: env.configured,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await db().rpc('games_per_platform');
      if (error) return new Map();
      return new Map(((data ?? []) as { platform: string; total: number }[])
        .map((r) => [r.platform, Number(r.total)]));
    },
  });
}

/** Uma plataforma pelo NOME curto da URL (pra pegar o slug e os metadados). */
function usePlatformByName(name: string) {
  return useQuery({
    queryKey: ['platformByName', name],
    enabled: env.configured && !!name,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<PlatformRow | null> => {
      const { data } = await db().from('platforms').select('*').eq('name', name).maybeSingle();
      return (data ?? null) as PlatformRow | null;
    },
  });
}

const REGION_LABEL: Record<string, string> = { na: 'NA', jp: 'JP', eu: 'EU', br: 'BR', au: 'AU', kr: 'KR', ww: 'WW' };

/** Bloco de dados técnicos da plataforma (carga da Wikipedia; admin ajusta). */
function PlatformInfo({ p }: { p: PlatformRow }) {
  const { t } = useTranslation();
  const releases = p.releases ?? {};
  const specs = p.specs ?? {};
  const rows: [string, string | null | undefined][] = [
    [t('platforms:infoManufacturer'), p.manufacturer],
    [t('platforms:infoGeneration'), p.generation],
    [t('platforms:infoMedia'), p.media],
    [t('platforms:infoUnitsSold'), p.units_sold],
    [t('platforms:infoDiscontinued'), p.discontinued],
  ];
  const specRows = Object.entries(specs);
  const relRows = Object.entries(releases);
  const hasAny = p.description || p.image_url || rows.some(([, v]) => v) || specRows.length || relRows.length;
  if (!hasAny) return null;
  return (
    <section className="section platform-info">
      <div className="platform-info-grid">
        {p.image_url && (
          <figure className="platform-info-img"><img src={p.image_url} alt={p.name} loading="lazy" /></figure>
        )}
        <div className="platform-info-body">
          {p.description && <p className="platform-info-desc">{p.description}</p>}
          {relRows.length > 0 && (
            <div className="platform-rel">
              <span className="platform-specs-h mono">{t('platforms:infoReleases')}</span>
              <div className="platform-rel-chips">
                {relRows.map(([r, d]) => (
                  <span key={r} className="type-chip mono"><b>{REGION_LABEL[r] ?? r.toUpperCase()}</b> {String(d)}</span>
                ))}
              </div>
            </div>
          )}
          {(rows.some(([, v]) => v) || specRows.length > 0) && (
            <dl className="platform-specs">
              {rows.filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
              {specRows.map(([k, v]) => (
                <div key={k}><dt className="mono">{k}</dt><dd>{String(v)}</dd></div>
              ))}
            </dl>
          )}
          {p.wikipedia_url && (
            <a href={p.wikipedia_url} target="_blank" rel="noreferrer" className="section-link mono">
              {t('platforms:infoWiki')}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

/** Editor admin dos dados da plataforma (a leitura é pública; só admin edita). */
function PlatformEditor({ p }: { p: PlatformRow }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const rel = p.releases ?? {};
  const [form, setForm] = useState({
    description: p.description ?? '', image_url: p.image_url ?? '', wikipedia_url: p.wikipedia_url ?? '',
    manufacturer: p.manufacturer ?? '', generation: p.generation ?? '', media: p.media ?? '',
    units_sold: p.units_sold ?? '', discontinued: p.discontinued ?? '',
    rel_na: rel.na ?? '', rel_jp: rel.jp ?? '', rel_eu: rel.eu ?? '', rel_br: rel.br ?? '',
  });
  if (!isAdmin) return null;

  async function save() {
    setSaving(true);
    try {
      // preserva regiões extras (au/kr/ww) e edita as 4 principais
      const releases: Record<string, string> = { ...(p.releases ?? {}) };
      for (const [k, v] of [['na', form.rel_na], ['jp', form.rel_jp], ['eu', form.rel_eu], ['br', form.rel_br]]) {
        if (v.trim()) releases[k] = v.trim(); else delete releases[k];
      }
      const upd = {
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
        wikipedia_url: form.wikipedia_url.trim() || null,
        manufacturer: form.manufacturer.trim() || null,
        generation: form.generation.trim() || null,
        media: form.media.trim() || null,
        units_sold: form.units_sold.trim() || null,
        discontinued: form.discontinued.trim() || null,
        releases,
      };
      const { error } = await db().from('platforms').update(upd).eq('slug', p.slug);
      if (error) throw error;
      toast.success(t('platforms:editSaved'));
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['platformByName'] });
      void qc.invalidateQueries({ queryKey: ['platformsIndex'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally { setSaving(false); }
  }

  const field = (key: keyof typeof form, label: string, textarea = false) => (
    <label className="admin-edit-field">
      <span className="mono">{label}</span>
      {textarea
        ? <Textarea rows={4} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
        : <Input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />}
    </label>
  );

  return (
    <section className="section">
      <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)}>
        <SquarePen size={14} /> {t('platforms:editBtn')}
      </Button>
      {open && (
        <div className="admin-edit" style={{ marginTop: 'var(--s3)' }}>
          {field('description', t('platforms:editDescription'), true)}
          <div className="admin-edit-row2">
            {field('image_url', t('platforms:editImage'))}
            {field('wikipedia_url', t('platforms:editWiki'))}
          </div>
          <div className="admin-edit-row2">
            {field('manufacturer', t('platforms:infoManufacturer'))}
            {field('generation', t('platforms:infoGeneration'))}
          </div>
          <div className="admin-edit-row2">
            {field('media', t('platforms:infoMedia'))}
            {field('units_sold', t('platforms:infoUnitsSold'))}
          </div>
          {field('discontinued', t('platforms:infoDiscontinued'))}
          <span className="platform-specs-h mono">{t('platforms:infoReleases')}</span>
          <div className="admin-edit-row2">
            {field('rel_na', 'NA')}
            {field('rel_jp', 'JP')}
            {field('rel_eu', 'EU')}
            {field('rel_br', 'BR')}
          </div>
          <div className="admin-tools-row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" disabled={saving} onClick={() => setOpen(false)}>{t('platforms:editCancel')}</Button>
            <Button variant="primary" disabled={saving} onClick={() => void save()}>{t('platforms:editSave')}</Button>
          </div>
        </div>
      )}
    </section>
  );
}

interface PlatformAlias { source: string; external_key: string }

/**
 * Aliases de→para da plataforma (public read; admin edita). Fecha o pedido do
 * Killer: ver a lista de todo mundo, corrigir os vínculos errados sem SQL.
 */
function AliasEditor({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  const [source, setSource] = useState('igdb');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: aliases = [] } = useQuery({
    queryKey: ['platformAliases', slug],
    enabled: env.configured && !!slug,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PlatformAlias[]> => {
      const { data, error } = await db().from('platform_aliases')
        .select('source, external_key').eq('platform', slug).order('source');
      if (error) return [];
      return (data ?? []) as PlatformAlias[];
    },
  });

  async function add() {
    if (!key.trim()) return;
    setBusy(true);
    try {
      const { error } = await db().from('platform_aliases')
        .upsert({ source, external_key: key.trim(), platform: slug }, { onConflict: 'source,external_key', ignoreDuplicates: false });
      if (error) throw error;
      setKey('');
      toast.success(t('platforms:aliasAdded'));
      void qc.invalidateQueries({ queryKey: ['platformAliases', slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally { setBusy(false); }
  }
  async function remove(a: PlatformAlias) {
    setBusy(true);
    try {
      const { error } = await db().from('platform_aliases')
        .delete().eq('source', a.source).eq('external_key', a.external_key);
      if (error) throw error;
      toast.success(t('platforms:aliasRemoved'));
      void qc.invalidateQueries({ queryKey: ['platformAliases', slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally { setBusy(false); }
  }

  return (
    <section className="section">
      <div className="section-head"><h2>{t('platforms:aliasesTitle')}</h2></div>
      <p className="page-sub">{t('platforms:aliasesHint')}</p>
      {aliases.length === 0 ? (
        <p className="page-sub mono" style={{ fontSize: '0.8rem' }}>{t('platforms:aliasesEmpty')}</p>
      ) : (
        <ul className="alias-list">
          {aliases.map((a) => (
            <li key={`${a.source}-${a.external_key}`} className="alias-row mono">
              <span className="type-chip mono">{a.source}</span>
              <span className="alias-key">{a.external_key}</span>
              {isAdmin && (
                <button type="button" className="alias-del" title={t('platforms:aliasRemove')}
                  disabled={busy} onClick={() => void remove(a)}>
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isAdmin && (
        <div className="alias-add">
          <Select aria-label={t('platforms:aliasSource')} value={source} onChange={(e) => setSource(e.target.value)} style={{ maxWidth: 160 }}>
            {ALIAS_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Input aria-label={t('platforms:aliasKey')} placeholder={t('platforms:aliasKeyPh')}
            value={key} onChange={(e) => setKey(e.target.value)} style={{ maxWidth: 240 }} />
          <Button variant="secondary" size="sm" disabled={busy || !key.trim()} onClick={() => void add()}>
            {t('platforms:aliasAdd')}
          </Button>
        </div>
      )}
    </section>
  );
}

const FAMILY_LABEL: Record<string, string> = {
  nintendo: 'Nintendo', sega: 'Sega', sony: 'Sony', microsoft: 'Microsoft',
  pc: 'PC', nec: 'NEC', snk: 'SNK', atari: 'Atari', mobile: 'Mobile', outros: 'Outros',
};

/** /platforms — o índice das plataformas, agrupado por família. */
export function PlatformsIndex() {
  const { t } = useTranslation();
  const { data: platforms = [], isLoading } = usePlatforms();
  const { data: counts } = usePlatformCounts();

  if (isLoading) return <LoadingPage />;

  const families = [...new Set(platforms.map((p) => p.family ?? 'outros'))];
  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t('platforms:kicker')}</span>
        <h1>{t('platforms:title')}</h1>
        <p className="page-sub">{t('platforms:subtitle')}</p>
      </header>

      {platforms.length === 0 ? (
        <EmptyState icon={MonitorPlay} title={t('platforms:emptyTitle')} text={t('platforms:emptyText')} />
      ) : (
        families.map((fam) => (
          <section key={fam} className="section">
            <div className="section-head"><h2>{FAMILY_LABEL[fam] ?? fam}</h2></div>
            <div className="platform-grid">
              {platforms.filter((p) => (p.family ?? 'outros') === fam).map((p) => (
                <Link
                  key={p.slug}
                  to={`/platform/${encodeURIComponent(p.name)}`}
                  className="platform-card"
                  style={PLATFORM_THEMES[p.name]
                    ? ({ '--plat-accent': PLATFORM_THEMES[p.name] } as React.CSSProperties)
                    : undefined}
                >
                  <span className="platform-card-body">
                    <span className="platform-card-name mono">{p.name}</span>
                    <span className="platform-card-full">{p.full_name ?? p.name}</span>
                    <span className="platform-card-count mono">
                      {t('platforms:gamesCount', { count: counts?.get(p.name) ?? 0 })}
                    </span>
                  </span>
                  {/* placeholder 64x64 — Killer troca por ícone de cada console depois */}
                  <span className="platform-card-icon" aria-hidden="true"><Gamepad2 size={26} /></span>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

/** /platform/:name — a página da plataforma: jogos paginados no tema dela. */
export function PlatformDetail() {
  const { t } = useTranslation();
  const { name = '' } = useParams<{ name: string }>();
  const [page, setPage] = useState(0);
  const { data, isLoading } = useGamesPage({ platform: name }, page, 24);
  const { data: platform } = usePlatformByName(name);
  const accent = PLATFORM_THEMES[name];

  if (isLoading && !data) return <LoadingPage />;

  const games = data?.games ?? [];
  const total = data?.total ?? 0;
  return (
    <div
      className="container"
      style={accent ? ({ '--plat-accent': accent } as React.CSSProperties) : undefined}
    >
      <header className="page-head platform-head">
        <span className="kicker">// {t('platforms:kicker')}</span>
        <h1 style={accent ? { color: accent } : undefined}>{name}</h1>
        <p className="page-sub">{t('platforms:detailSubtitle', { count: total })}</p>
        <div className="search-filters">
          <Link to={`/games?platform=${encodeURIComponent(name)}`} className="search-chip">
            {t('platforms:openExplore')}
          </Link>
          <Link to="/platforms" className="search-chip">{t('platforms:backToList')}</Link>
        </div>
      </header>

      {platform && <PlatformInfo p={platform} />}

      {games.length === 0 ? (
        <EmptyState icon={Gamepad2} title={t('browse:emptyTitle')} />
      ) : (
        <>
          <div className="card-grid card-grid-cover">
            {games.map((g) => <GameCard key={g.id} game={g} />)}
          </div>
          <Pagination page={page} totalPages={Math.ceil(total / 24)} onPage={setPage} />
        </>
      )}

      {platform && <PlatformEditor p={platform} />}
      {platform && <AliasEditor slug={platform.slug} />}
    </div>
  );
}
