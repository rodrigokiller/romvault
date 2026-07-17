import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, BarChart3, Trophy, Gamepad2, Users } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useProfileByUsername } from '@/hooks/useProfile';
import { useLibrary, useUserPlaythroughs, useUserSyncRows, useLibraryCopies } from '@/hooks/useTracks';
import { useAuth } from '@/auth/AuthProvider';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';
import { PLATFORM_THEMES } from '@/lib/platformThemes';

const db = () => getSupabase() as unknown as SupabaseClient;

type Period = 'week' | 'month' | 'year';
const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30, year: 365 };

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Média de zeradas no período entre quem EU sigo (a pitada social do trakt). */
function useFollowingAvg(myId: string | undefined, sinceISO: string) {
  return useQuery({
    queryKey: ['followingAvg', myId, sinceISO],
    enabled: env.configured && Boolean(myId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ people: number; avg: number } | null> => {
      const { data: follows } = await db()
        .from('follows').select('followed_id').eq('follower_id', myId as string).limit(200);
      const ids = (follows ?? []).map((f) => f.followed_id as string);
      if (ids.length === 0) return null;
      const { data: runs } = await db()
        .from('game_playthroughs')
        .select('user_id')
        .in('user_id', ids)
        .gte('finished_on', sinceISO.slice(0, 10))
        .range(0, 4999);
      return { people: ids.length, avg: (runs ?? []).length / ids.length };
    },
  });
}

/**
 * /u/:user/stats — painel estilo trakt: cards do período (semana/mês/ano),
 * HEATMAP de atividade do último ano (estilo GitHub), plataformas e jogos
 * do período, e "você vs quem você segue".
 */
export function UserStats() {
  const { t, i18n } = useTranslation();
  const { username } = useParams<{ username: string }>();
  const { user: me } = useAuth();
  const { data: profile, isLoading } = useProfileByUsername(username);
  const { data: tracks = [] } = useLibrary(profile?.id);
  const { data: playthroughs = [] } = useUserPlaythroughs(profile?.id);
  const { data: syncRows = [] } = useUserSyncRows(profile?.id);
  const { data: copies = [] } = useLibraryCopies(profile?.id);
  const [period, setPeriod] = useState<Period>('month');

  const isMe = Boolean(me && profile && me.id === profile.id);
  const sinceMs = Date.now() - PERIOD_DAYS[period] * 86_400_000;
  const sinceISO = new Date(sinceMs).toISOString();
  const { data: vs } = useFollowingAvg(isMe ? profile?.id : undefined, sinceISO);

  /* ── números do período ── */
  const stats = useMemo(() => {
    const runs = playthroughs.filter((p) => new Date(p.finished_on).getTime() >= sinceMs);
    const activeGames = new Set(
      syncRows.filter((r) => r.last_played && new Date(r.last_played).getTime() >= sinceMs).map((r) => r.game_id),
    );
    const newCopies = copies.filter((c) => {
      const at = (c as unknown as { acquired_at?: string | null }).acquired_at;
      return at && new Date(at).getTime() >= sinceMs;
    }).length;
    const totalHours = Math.round(tracks.reduce((s, x) => s + (x.hours_played ?? 0), 0));
    return { runs: runs.length, active: activeGames.size, newCopies, totalHours };
  }, [playthroughs, syncRows, copies, tracks, sinceMs]);

  /* ── heatmap: atividade por dia no último ano (zeradas + last_played + cópias) ── */
  const heat = useMemo(() => {
    const map = new Map<string, number>();
    const bump = (iso: string | null | undefined, w = 1) => {
      if (!iso) return;
      const k = iso.slice(0, 10);
      map.set(k, (map.get(k) ?? 0) + w);
    };
    for (const p of playthroughs) bump(p.finished_on, 3); // zerar pesa mais
    for (const r of syncRows) bump(r.last_played, 1);
    for (const c of copies) bump((c as unknown as { acquired_at?: string | null }).acquired_at, 1);

    // 53 colunas x 7 linhas terminando hoje (semana começa no domingo)
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const cells: { key: string; count: number; future: boolean }[] = [];
    for (let i = 53 * 7 - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const key = dayKey(d);
      cells.push({ key, count: map.get(key) ?? 0, future: d > today });
    }
    const max = Math.max(1, ...cells.map((c) => c.count));
    return { cells, max };
  }, [playthroughs, syncRows, copies]);

  /* ── plataformas e jogos do período ── */
  const periodPlatforms = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of syncRows) {
      if (r.platform && r.last_played && new Date(r.last_played).getTime() >= sinceMs) {
        count.set(r.platform, (count.get(r.platform) ?? 0) + 1);
      }
    }
    for (const p of playthroughs) {
      if (new Date(p.finished_on).getTime() < sinceMs) continue;
      const tr = tracks.find((x) => x.game_id === (p as unknown as { game_id: string }).game_id);
      const plat = tr?.platform ?? tr?.game.platforms?.[0];
      if (plat) count.set(plat, (count.get(plat) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [syncRows, playthroughs, tracks, sinceMs]);

  const periodGames = useMemo(() => {
    const active = syncRows
      .filter((r) => r.last_played && new Date(r.last_played).getTime() >= sinceMs)
      .sort((a, b) => (b.last_played ?? '').localeCompare(a.last_played ?? ''));
    const seen = new Set<string>();
    const out: { id: string; title: string; slug: string; cover: string | null }[] = [];
    for (const r of active) {
      if (seen.has(r.game_id)) continue;
      seen.add(r.game_id);
      const tr = tracks.find((x) => x.game_id === r.game_id);
      if (!tr) continue;
      out.push({
        id: r.game_id, title: tr.game.title, slug: tr.game.slug,
        cover: tr.game.cover_url ?? tr.game.thumbnail ?? null,
      });
      if (out.length >= 12) break;
    }
    return out;
  }, [syncRows, tracks, sinceMs]);

  if (isLoading) return <LoadingPage />;
  if (!profile) {
    return <div className="container"><EmptyState icon={BarChart3} title={t('profile:notFound')} /></div>;
  }

  const maxPlat = Math.max(1, ...periodPlatforms.map(([, n]) => n));
  const months = Array.from({ length: 12 }, (_, m) =>
    new Date(2026, m, 15).toLocaleDateString(i18n.language, { month: 'short' }));

  return (
    <div className="container">
      <header className="page-head">
        <Link to={`/u/${username}`} className="back-link">
          <ArrowLeft aria-hidden /> @{profile.username}
        </Link>
        <span className="kicker">// {t('ustats:kicker')}</span>
        <h1>{t('ustats:title', { user: profile.username ?? username })}</h1>
        <div className="ustats-periods" role="tablist">
          {(['week', 'month', 'year'] as const).map((p) => (
            <button
              key={p} type="button" role="tab" aria-selected={period === p}
              className={`vitrine-tab ${period === p ? 'is-active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {t(`ustats:p_${p}`)}
            </button>
          ))}
          <Link to={`/u/${username}/year/${new Date().getFullYear()}`} className="vitrine-tab ustats-wrapped">
            <Trophy aria-hidden /> {t('profile:yearReview', { year: new Date().getFullYear() })}
          </Link>
        </div>
      </header>

      {/* cards do período */}
      <div className="ustats-cards">
        <div className="ustats-card">
          <span className="ustats-num mono">{stats.runs}</span>
          <span className="ustats-label">{t('ustats:cardRuns')}</span>
        </div>
        <div className="ustats-card">
          <span className="ustats-num mono">{stats.active}</span>
          <span className="ustats-label">{t('ustats:cardActive')}</span>
        </div>
        <div className="ustats-card">
          <span className="ustats-num mono">{stats.newCopies}</span>
          <span className="ustats-label">{t('ustats:cardCopies')}</span>
        </div>
        <div className="ustats-card">
          <span className="ustats-num mono">{stats.totalHours}h</span>
          <span className="ustats-label">{t('ustats:cardHours')}</span>
        </div>
      </div>

      {/* você vs quem você segue */}
      {isMe && vs && (
        <div className="ustats-vs">
          <span className="ustats-vs-label mono"><Users aria-hidden /> {t('ustats:vsTitle', { count: vs.people })}</span>
          <div className="ustats-vs-bars">
            <div className="ustats-vs-row">
              <span className="ustats-vs-who mono">{t('ustats:vsYou')}</span>
              <span className="ustats-vs-bar"><span style={{ width: `${Math.min(100, (stats.runs / Math.max(stats.runs, vs.avg, 1)) * 100)}%` }} /></span>
              <span className="ustats-vs-n mono">{stats.runs}</span>
            </div>
            <div className="ustats-vs-row">
              <span className="ustats-vs-who mono">{t('ustats:vsThem')}</span>
              <span className="ustats-vs-bar ustats-vs-them"><span style={{ width: `${Math.min(100, (vs.avg / Math.max(stats.runs, vs.avg, 1)) * 100)}%` }} /></span>
              <span className="ustats-vs-n mono">{vs.avg.toFixed(1)}</span>
            </div>
          </div>
        </div>
      )}

      {/* heatmap do último ano */}
      <section className="section">
        <div className="section-head"><h2>{t('ustats:heatTitle')}</h2></div>
        <div className="heatmap-wrap">
          <div className="heatmap-months mono" aria-hidden>
            {months.map((m) => <span key={m}>{m}</span>)}
          </div>
          <div className="heatmap" role="img" aria-label={t('ustats:heatTitle')}>
            {heat.cells.map((c) => {
              const level = c.future || c.count === 0 ? 0 : Math.min(4, Math.ceil((c.count / heat.max) * 4));
              return (
                <span
                  key={c.key}
                  className={`heat-cell heat-${level} ${c.future ? 'heat-future' : ''}`}
                  title={`${c.key}: ${c.count > 0 ? t('ustats:heatDay', { count: c.count }) : t('ustats:heatNone')}`}
                />
              );
            })}
          </div>
          <div className="heatmap-legend mono">
            <span>{t('ustats:heatLess')}</span>
            {[0, 1, 2, 3, 4].map((l) => <span key={l} className={`heat-cell heat-${l}`} />)}
            <span>{t('ustats:heatMore')}</span>
          </div>
        </div>
      </section>

      {/* plataformas do período */}
      {periodPlatforms.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>{t('ustats:platTitle')}</h2></div>
          <div className="ustats-plats">
            {periodPlatforms.map(([plat, n]) => (
              <div key={plat} className="ustats-plat-row">
                <span className="ustats-plat-name mono">{plat}</span>
                <span className="ustats-plat-bar">
                  <span
                    style={{
                      width: `${(n / maxPlat) * 100}%`,
                      background: PLATFORM_THEMES[plat] ?? 'var(--accent)',
                    }}
                  />
                </span>
                <span className="ustats-plat-n mono">{n}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* jogos do período */}
      {periodGames.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>{t('ustats:gamesTitle')}</h2></div>
          <div className="my-strip-covers">
            {periodGames.map((g) => (
              <Link key={g.id} to={`/games/${g.slug}`} title={g.title}>
                {g.cover
                  ? <img src={g.cover} alt={g.title} loading="lazy" />
                  : <span className="my-strip-fallback">{g.title}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      {stats.runs === 0 && stats.active === 0 && (
        <EmptyState icon={Gamepad2} title={t('ustats:emptyTitle')} text={t('ustats:emptyText')} />
      )}
    </div>
  );
}
