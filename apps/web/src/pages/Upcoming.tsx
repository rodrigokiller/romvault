import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarClock } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import type { Game } from '@romvault/core';
import { GameCard } from '@/components/entities/GameCard';
import { Select } from '@/components/ui/Select';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';

const db = () => getSupabase() as unknown as SupabaseClient;
const COLS =
  'id, title, slug, cover_url, thumbnail, platforms, genres, release_date, developer, description, franchise, series, is_adult, game_type, hypes, tba';

/** agenda = por data; hyped = por expectativa; tba = anunciado sem data */
type Mode = 'agenda' | 'hyped' | 'tba';
const PER = 24;

interface UpcomingGame extends Game { hypes?: number | null; tba?: boolean | null }

/** Faltam quantos dias? (null pra TBA/sem data) */
function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const ms = new Date(date).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.ceil(ms / 864e5);
}

function useUpcoming(mode: Mode, platform: string, page: number) {
  return useQuery({
    queryKey: ['upcoming', mode, platform, page],
    enabled: env.configured,
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ games: UpcomingGame[]; total: number }> => {
      const today = new Date().toISOString().slice(0, 10);
      let q = db().from('games').select(COLS, { count: 'exact' }).eq('is_adult', false);
      if (mode === 'tba') {
        q = q.eq('tba', true).order('hypes', { ascending: false, nullsFirst: false });
      } else if (mode === 'hyped') {
        q = q.gt('release_date', today).order('hypes', { ascending: false, nullsFirst: false });
      } else {
        q = q.gt('release_date', today).order('release_date', { ascending: true });
      }
      if (platform) q = q.contains('platforms', [platform]);
      const { data, count, error } = await q.range(page * PER, page * PER + PER - 1);
      if (error) return { games: [], total: 0 };
      return { games: (data ?? []) as unknown as UpcomingGame[], total: count ?? 0 };
    },
  });
}

/** Plataformas com jogos futuros — pro filtro (lista curta, não o catálogo todo). */
function usePlatformOptions() {
  return useQuery({
    queryKey: ['platformsIndex'],
    enabled: env.configured,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<{ slug: string; name: string }[]> => {
      const { data } = await db().from('platforms').select('slug, name').order('sort');
      return (data ?? []) as { slug: string; name: string }[];
    },
  });
}

/** /upcoming — a agenda de lançamentos e o que a galera mais espera. */
export function Upcoming() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('agenda');
  const [platform, setPlatform] = useState('');
  const [page, setPage] = useState(0);
  const { data, isLoading } = useUpcoming(mode, platform, page);
  const { data: platforms = [] } = usePlatformOptions();

  const games = data?.games ?? [];
  const total = data?.total ?? 0;
  const pick = (m: Mode) => { setMode(m); setPage(0); };

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t('upcoming:kicker')}</span>
        <h1>{t('upcoming:title')}</h1>
        <p className="page-sub">{t('upcoming:subtitle')}</p>
        <div className="search-filters">
          {(['agenda', 'hyped', 'tba'] as Mode[]).map((m) => (
            <button
              key={m} type="button"
              className={`search-chip${mode === m ? ' is-active' : ''}`}
              onClick={() => pick(m)}
            >
              {t(`upcoming:mode_${m}`)}
            </button>
          ))}
          <Select
            aria-label={t('upcoming:platformFilter')}
            value={platform}
            onChange={(e) => { setPlatform(e.target.value); setPage(0); }}
            style={{ maxWidth: 190 }}
          >
            <option value="">{t('upcoming:allPlatforms')}</option>
            {platforms.map((p) => <option key={p.slug} value={p.name}>{p.name}</option>)}
          </Select>
        </div>
      </header>

      {isLoading && !data ? <LoadingPage /> : games.length === 0 ? (
        <EmptyState icon={CalendarClock} title={t('upcoming:emptyTitle')} text={t('upcoming:emptyText')} />
      ) : (
        <>
          <div className="card-grid card-grid-cover">
            {games.map((g) => (
              <div key={g.id} className="upcoming-cell">
                <GameCard game={g} />
                <span className="upcoming-tag mono">
                  {mode === 'tba' || !g.release_date
                    ? t('upcoming:tbaTag')
                    : t('upcoming:inDays', { count: daysUntil(g.release_date) ?? 0 })}
                  {typeof g.hypes === 'number' && g.hypes > 0 && (
                    <span className="upcoming-hypes">{t('upcoming:following', { count: g.hypes })}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <Pagination page={page} totalPages={Math.ceil(total / PER)} onPage={setPage} />
        </>
      )}
    </div>
  );
}
