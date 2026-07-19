import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MonitorPlay, Gamepad2 } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useGamesPage } from '@/hooks/useGames';
import { GameCard } from '@/components/entities/GameCard';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';
import { PLATFORM_THEMES } from '@/lib/platformThemes';

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
                  <span className="platform-card-name mono">{p.name}</span>
                  <span className="platform-card-full">{p.full_name ?? p.name}</span>
                  <span className="platform-card-count mono">
                    {t('platforms:gamesCount', { count: counts?.get(p.name) ?? 0 })}
                  </span>
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
    </div>
  );
}
