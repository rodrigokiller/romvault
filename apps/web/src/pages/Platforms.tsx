import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MonitorPlay, Gamepad2, Trash2 } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useIsAdmin } from '@/hooks/useProfile';
import { useToast } from '@/components/ui/Toast';
import { useGamesPage } from '@/hooks/useGames';
import { GameCard } from '@/components/entities/GameCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';
import { PLATFORM_THEMES } from '@/lib/platformThemes';

/** fontes que usam alias de plataforma (de→para do importer) */
const ALIAS_SOURCES = ['igdb', 'rhdn', 'mobygames', 'screenscraper', 'libretro', 'smwcentral', 'pobre', 'steam', 'gog', 'psn', 'xbox', 'nintendo'];

const db = () => getSupabase() as unknown as SupabaseClient;

interface PlatformRow { slug: string; name: string; full_name: string | null; family: string | null; sort: number }

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

      {platform && <AliasEditor slug={platform.slug} />}
    </div>
  );
}
