import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Trophy, Gamepad2, ArrowLeft } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useProfileByUsername } from '@/hooks/useProfile';
import { ShareButton } from '@/components/entities/ShareButton';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';

const db = () => getSupabase() as unknown as SupabaseClient;

interface YearRun {
  finished_on: string;
  game: { title: string; slug: string; cover_url: string | null; thumbnail: string | null; platforms: string[] | null } | null;
}

function useYearRuns(userId: string | undefined, year: string) {
  return useQuery({
    queryKey: ['yearReview', userId, year],
    enabled: env.configured && Boolean(userId) && /^\d{4}$/.test(year),
    queryFn: async (): Promise<YearRun[]> => {
      const { data, error } = await db()
        .from('game_playthroughs')
        .select('finished_on, game:games(title, slug, cover_url, thumbnail, platforms)')
        .eq('user_id', userId as string)
        .gte('finished_on', `${year}-01-01`)
        .lte('finished_on', `${year}-12-31`)
        .order('finished_on', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as YearRun[]).filter((r) => r.game);
    },
  });
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** "Ano em Retrospecto": card compartilhável com as zeradas do ano. */
export function YearReview() {
  const { t } = useTranslation();
  const { username, year = '' } = useParams<{ username: string; year: string }>();
  const { data: profile, isLoading: profileLoading } = useProfileByUsername(username);
  const { data: runs = [], isLoading } = useYearRuns(profile?.id, year);

  const byMonth = useMemo(() => {
    const arr = Array(12).fill(0) as number[];
    for (const r of runs) arr[Number(r.finished_on.slice(5, 7)) - 1]++;
    return arr;
  }, [runs]);
  const maxMonth = Math.max(1, ...byMonth);

  const topPlatform = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of runs) {
      const p = r.game?.platforms?.[0];
      if (p) count.set(p, (count.get(p) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [runs]);

  if (profileLoading || isLoading) return <LoadingPage />;
  if (!profile) {
    return <div className="container"><EmptyState icon={Gamepad2} title={t('profile:notFound')} /></div>;
  }

  return (
    <div className="container container-narrow">
      <Link to={`/u/${username}`} className="back-link">
        <ArrowLeft aria-hidden /> @{username}
      </Link>

      <div className="wrapped">
        <header className="wrapped-head">
          <span className="kicker">// {t('wrapped:kicker')}</span>
          <h1 className="wrapped-year">{year}</h1>
          <p className="wrapped-sub">{t('wrapped:title', { user: profile.username ?? username })}</p>
        </header>

        {runs.length === 0 ? (
          <EmptyState icon={Trophy} title={t('wrapped:emptyTitle')} text={t('wrapped:emptyText', { year })} />
        ) : (
          <>
            <div className="wrapped-stats">
              <div className="wrapped-stat">
                <span className="wrapped-num">{runs.length}</span>
                <span className="wrapped-label">{t('wrapped:finished', { count: runs.length })}</span>
              </div>
              {topPlatform && (
                <div className="wrapped-stat">
                  <span className="wrapped-num">{topPlatform}</span>
                  <span className="wrapped-label">{t('wrapped:topPlatform')}</span>
                </div>
              )}
              <div className="wrapped-stat">
                <span className="wrapped-num">{MONTHS[byMonth.indexOf(Math.max(...byMonth))]}</span>
                <span className="wrapped-label">{t('wrapped:topMonth')}</span>
              </div>
            </div>

            {/* barras por mês */}
            <div className="wrapped-months" aria-hidden>
              {byMonth.map((n, i) => (
                <div key={MONTHS[i]} className="wrapped-month">
                  <div className="wrapped-month-bar" style={{ height: `${(n / maxMonth) * 64 + 4}px` }} title={`${MONTHS[i]}: ${n}`} />
                  <span className="wrapped-month-label mono">{MONTHS[i][0]}</span>
                </div>
              ))}
            </div>

            {/* capas do ano */}
            <div className="wrapped-covers">
              {runs.map((r, i) => (
                <Link key={`${r.game!.slug}-${i}`} to={`/games/${r.game!.slug}`} className="wrapped-cover" title={r.game!.title}>
                  {r.game!.cover_url || r.game!.thumbnail ? (
                    <img src={r.game!.cover_url ?? r.game!.thumbnail ?? ''} alt={r.game!.title} loading="lazy" />
                  ) : (
                    <span className="wrapped-cover-fallback">{r.game!.title}</span>
                  )}
                </Link>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--s5)' }}>
              <ShareButton title={t('wrapped:shareTitle', { user: profile.username ?? username, year, count: runs.length })} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
