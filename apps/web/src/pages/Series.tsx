import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Gamepad2, Layers } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';

const db = () => getSupabase() as unknown as SupabaseClient;

interface SeriesGame {
  id: string;
  slug: string;
  title: string;
  cover_url: string | null;
  thumbnail: string | null;
  platforms: string[] | null;
  release_date: string | null;
  game_type: string | null;
}

/** Todos os jogos cuja série OU franquia bate com o nome, em ordem de lançamento. */
function useSeriesGames(name: string | undefined) {
  return useQuery({
    queryKey: ['series', name],
    enabled: env.configured && Boolean(name),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SeriesGame[]> => {
      const safe = String(name).replace(/[,()]/g, ' ').trim();
      const { data, error } = await db()
        .from('games')
        .select('id, slug, title, cover_url, thumbnail, platforms, release_date, game_type')
        .or(`series.eq.${safe},franchise.eq.${safe}`)
        .order('release_date', { ascending: true, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as SeriesGame[];
    },
  });
}

/**
 * /series/:name — a LINHA DO TEMPO da série/franquia: todos os lançamentos em
 * ordem, agrupados por ano, com o tipo (main/remaster/port) de cada um.
 */
export function Series() {
  const { t } = useTranslation();
  const { name } = useParams<{ name: string }>();
  const { data: games = [], isLoading } = useSeriesGames(name);

  if (isLoading) return <LoadingPage />;

  // agrupa por ano de lançamento (sem data vai pro fim, em "?")
  const byYear = new Map<string, SeriesGame[]>();
  for (const g of games) {
    const y = g.release_date?.slice(0, 4) ?? '?';
    byYear.set(y, [...(byYear.get(y) ?? []), g]);
  }
  const years = [...byYear.keys()].sort((a, b) => (a === '?' ? 1 : b === '?' ? -1 : a.localeCompare(b)));

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t('series:kicker')}</span>
        <h1>{name}</h1>
        <p className="page-sub">{t('series:subtitle', { count: games.length })}</p>
      </header>

      {games.length === 0 ? (
        <EmptyState icon={Layers} title={t('series:emptyTitle')} text={t('series:emptyText')} />
      ) : (
        <div className="series-timeline">
          {years.map((year) => (
            <div key={year} className="series-year">
              <span className="series-year-label mono">{year}</span>
              <div className="series-year-games">
                {byYear.get(year)!.map((g) => (
                  <Link key={g.id} to={`/games/${g.slug}`} className="version-card" title={g.title}>
                    <span className="version-cover">
                      {g.cover_url || g.thumbnail
                        ? <img src={g.cover_url ?? g.thumbnail ?? ''} alt={g.title} loading="lazy" />
                        : <Gamepad2 aria-hidden />}
                    </span>
                    <span className="version-body">
                      {g.game_type && g.game_type !== 'main' && (
                        <span className="type-chip mono">{t(`games:type_${g.game_type}`)}</span>
                      )}
                      <span className="version-title">{g.title}</span>
                      <span className="version-plats mono">{(g.platforms ?? []).slice(0, 3).join(' · ')}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
