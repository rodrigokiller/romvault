import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Library as LibraryIcon, Clock, Trophy, Gamepad2 } from 'lucide-react';
import { useProfileByUsername } from '@/hooks/useProfile';
import {
  useLibrary, useLibraryCopies, TRACK_STATUSES, type TrackStatus, type TrackWithGame,
} from '@/hooks/useTracks';
import { STATUS_ICON } from '@/components/entities/TrackButton';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';

/** Estante de jogos do usuário: abas por status + prateleira de capas. */
export function Library() {
  const { t } = useTranslation();
  const { username } = useParams<{ username: string }>();
  const { data: profile, isLoading: profileLoading } = useProfileByUsername(username);
  const { data: tracks = [], isLoading } = useLibrary(profile?.id);
  const { data: copies = [] } = useLibraryCopies(profile?.id);
  const [status, setStatus] = useState<TrackStatus | 'all'>('all');
  const [platform, setPlatform] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: tracks.length };
    for (const s of TRACK_STATUSES) map[s] = tracks.filter((x) => x.status === s).length;
    return map;
  }, [tracks]);

  // plataformas da coleção: cópias do usuário + plataforma do track
  const copiesByGame = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const copy of copies) map.set(copy.game_id, [...(map.get(copy.game_id) ?? []), copy.platform]);
    return map;
  }, [copies]);
  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const copy of copies) set.add(copy.platform);
    for (const tr of tracks) if (tr.platform) set.add(tr.platform);
    return [...set].sort();
  }, [copies, tracks]);

  const shown = useMemo(() => {
    let list = status === 'all' ? tracks : tracks.filter((x) => x.status === status);
    if (platform) {
      list = list.filter(
        (x) =>
          x.platform === platform ||
          (copiesByGame.get(x.game_id) ?? []).includes(platform) ||
          (x.game.platforms ?? []).includes(platform),
      );
    }
    return list;
  }, [tracks, status, platform, copiesByGame]);

  const totalHours = useMemo(
    () => tracks.reduce((sum, x) => sum + (x.hours_played ?? 0), 0),
    [tracks],
  );

  if (profileLoading || isLoading) return <LoadingPage />;
  if (!profile) {
    return (
      <div className="container">
        <EmptyState icon={LibraryIcon} title={t('profile:notFound')} />
      </div>
    );
  }

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t('library:kicker')}</span>
        <h1>{t('library:title', { user: profile.username ?? username })}</h1>
        <div className="lib-stats">
          <span className="lib-stat">
            <Gamepad2 aria-hidden /> {t('library:statGames', { count: tracks.length })}
          </span>
          {totalHours > 0 && (
            <span className="lib-stat">
              <Clock aria-hidden /> {t('library:statHours', { count: Math.round(totalHours) })}
            </span>
          )}
          {counts.finished > 0 && (
            <span className="lib-stat">
              <Trophy aria-hidden /> {t('library:statFinished', { count: counts.finished })}
            </span>
          )}
        </div>
      </header>

      <div className="type-seg" role="tablist">
        <button
          type="button" role="tab" aria-selected={status === 'all'}
          className={`type-seg-btn ${status === 'all' ? 'is-active' : ''}`}
          onClick={() => setStatus('all')}
        >
          {t('browse:filterAll')} <span className="search-chip-n">{counts.all}</span>
        </button>
        {TRACK_STATUSES.map((s) => {
          const SIcon = STATUS_ICON[s];
          return (
            <button
              key={s} type="button" role="tab" aria-selected={status === s}
              className={`type-seg-btn ${status === s ? 'is-active' : ''}`}
              onClick={() => setStatus(s)}
            >
              <SIcon aria-hidden /> {t(`library:status_${s}`)} <span className="search-chip-n">{counts[s]}</span>
            </button>
          );
        })}
      </div>

      {platforms.length > 0 && (
        <div className="search-filters" style={{ marginTop: 'calc(var(--s3) * -1)' }}>
          <button
            type="button"
            className={`search-chip ${platform === null ? 'is-active' : ''}`}
            onClick={() => setPlatform(null)}
          >
            {t('browse:filterAll')}
          </button>
          {platforms.map((p) => (
            <button
              key={p}
              type="button"
              className={`search-chip ${platform === p ? 'is-active' : ''}`}
              onClick={() => setPlatform(platform === p ? null : p)}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState icon={LibraryIcon} title={t('library:emptyTitle')} text={t('library:emptyText')} />
      ) : (
        <div className="shelf">
          {shown.map((track) => (
            <ShelfItem key={track.game_id} track={track} />
          ))}
        </div>
      )}
    </div>
  );
}

function ShelfItem({ track }: { track: TrackWithGame }) {
  const { t } = useTranslation();
  const g = track.game;
  const SIcon = STATUS_ICON[track.status];
  return (
    <Link to={`/games/${g.slug}`} className="shelf-item" title={g.title}>
      <div className={`shelf-cover status-${track.status}`}>
        {g.cover_url || g.thumbnail ? (
          <img src={g.cover_url ?? g.thumbnail ?? ''} alt={g.title} loading="lazy" />
        ) : (
          <span className="shelf-cover-fallback">{g.title}</span>
        )}
        <span className={`shelf-badge badge-${track.status}`} title={t(`library:status_${track.status}`)}>
          <SIcon aria-hidden />
        </span>
      </div>
      <span className="shelf-title">{g.title}</span>
      <span className="shelf-meta mono">
        {g.platforms?.[0] ?? ''}
        {track.hours_played ? ` · ${track.hours_played}h` : ''}
      </span>
    </Link>
  );
}
