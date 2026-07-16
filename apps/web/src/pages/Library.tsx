import { useMemo, useRef, useState } from 'react';
import { useFlip } from '@/hooks/useFlip';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Library as LibraryIcon, Clock, Trophy, Gamepad2, Coins, Copy as CopyIcon, Sparkles, Target, Download } from 'lucide-react';
import { useProfileByUsername } from '@/hooks/useProfile';
import {
  useLibrary, useLibraryCopies, useUserPlaythroughs, TRACK_STATUSES, type TrackStatus, type TrackWithGame,
} from '@/hooks/useTracks';
import { STATUS_ICON } from '@/components/entities/TrackButton';
import { BatchAdd } from '@/components/entities/BatchAdd';
import { useAuth } from '@/auth/AuthProvider';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';

/**
 * Cor-tema por plataforma: filtrar a estante por uma plataforma muda o accent
 * (borda/hover/badges) pra "cara" daquele console.
 */
const PLATFORM_THEMES: Record<string, string> = {
  SNES: '#a191dd', NES: '#e05a5a', N64: '#3aa655', GameCube: '#7a5fd0',
  Wii: '#9db7d4', 'Wii U': '#1fa8c9', Switch: '#e60012',
  'Game Boy': '#8bac0f', GBC: '#7b4fd8', GBA: '#5c67d8', NDS: '#8f9aa6', '3DS': '#d94a4a',
  Genesis: '#3b6fd4', 'Master System': '#d43b3b', 'Game Gear': '#333c8f',
  'Sega CD': '#4a90d9', Saturn: '#5b7d9e', Dreamcast: '#f0862e',
  PS1: '#8f9aa6', PS2: '#3b53a8', PS3: '#5b6f8f', PS4: '#2e6db4', PS5: '#e8ecf2', PSP: '#4a5d78', 'PS Vita': '#2e6db4',
  Xbox: '#107c10', 'Xbox 360': '#7ab648', 'Xbox One': '#107c10',
  PC: '#66c0f4', DOS: '#c4b26a', Arcade: '#f0c02e', 'TG-16': '#f07d2e', 'Neo Geo': '#2e6db4', FDS: '#c9302c',
};

/** Exporta a biblioteca como JSON (tracks + cópias) via download no navegador. */
function exportLibrary(tracks: TrackWithGame[], copies: { game_id: string; platform: string; distribution: string; store: string | null; price_paid: number | null }[]) {
  const payload = {
    exported_at: new Date().toISOString(),
    games: tracks.map((tr) => ({
      title: tr.game.title,
      platforms: tr.game.platforms,
      status: tr.status,
      hours_played: tr.hours_played,
      notes: tr.notes,
      copies: copies
        .filter((cp) => cp.game_id === tr.game_id)
        .map((cp) => ({ platform: cp.platform, distribution: cp.distribution, store: cp.store, price_paid: cp.price_paid })),
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `romvault-biblioteca-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Estante de jogos do usuário: abas por status + prateleira de capas. */
export function Library() {
  const { t } = useTranslation();
  const { username } = useParams<{ username: string }>();
  const [params, setParams] = useSearchParams();
  const showcase = params.get('view') === 'showcase';
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfileByUsername(username);
  const isMe = Boolean(user && profile && user.id === profile.id);
  const { data: tracks = [], isLoading } = useLibrary(profile?.id);
  const { data: copies = [] } = useLibraryCopies(profile?.id);
  const { data: playthroughs = [] } = useUserPlaythroughs(profile?.id);
  const [status, setStatus] = useState<TrackStatus | 'all'>('all');
  const [platform, setPlatform] = useState<string | null>(null);
  const [onlyDupes, setOnlyDupes] = useState(false);
  const [order, setOrder] = useState<'recent' | 'az' | 'platform'>('recent');
  // arte da vitrine: capa de loja (retrato) ou box art física
  const [artMode, setArtMode] = useState<'store' | 'box'>('box');
  const shelfRef = useRef<HTMLDivElement | null>(null);

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
    // "repetidos": jogos com mais de uma cópia
    if (onlyDupes) list = list.filter((x) => (copiesByGame.get(x.game_id) ?? []).length > 1);
    // reordenar a coleção (o FLIP anima a troca de lugares)
    if (order === 'az') list = [...list].sort((a, b) => a.game.title.localeCompare(b.game.title));
    else if (order === 'platform') {
      list = [...list].sort((a, b) =>
        (a.game.platforms?.[0] ?? '').localeCompare(b.game.platforms?.[0] ?? '') ||
        a.game.title.localeCompare(b.game.title));
    }
    return list;
  }, [tracks, status, platform, copiesByGame, onlyDupes, order]);

  // anima a reorganização da estante (filtros/ordenação)
  useFlip(shelfRef, `${status}|${platform}|${onlyDupes}|${order}|${shown.length}`);

  const totalHours = useMemo(
    () => tracks.reduce((sum, x) => sum + (x.hours_played ?? 0), 0),
    [tracks],
  );
  // valor da coleção (soma dos price_paid das cópias)
  const totalValue = useMemo(
    () => copies.reduce((sum, c) => sum + (c.price_paid ?? 0), 0),
    [copies],
  );
  // zeradas por jogo (badge ×N) e do ano corrente (meta anual)
  const runsByGame = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of playthroughs) map.set(p.game_id, (map.get(p.game_id) ?? 0) + 1);
    return map;
  }, [playthroughs]);
  const currentYear = new Date().getFullYear();
  const runsThisYear = useMemo(
    () => playthroughs.filter((p) => p.finished_on.startsWith(String(currentYear))).length,
    [playthroughs, currentYear],
  );
  const goal = (profile as { yearly_goal?: number | null } | undefined)?.yearly_goal ?? null;
  const dupeCount = useMemo(
    () => [...copiesByGame.values()].filter((arr) => arr.length > 1).length,
    [copiesByGame],
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
          {totalValue > 0 && (
            <span className="lib-stat">
              <Coins aria-hidden /> {t('library:statValue', { value: totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 }) })}
            </span>
          )}
          {goal && (
            <span className="lib-stat" title={t('library:goalTitle', { year: currentYear })}>
              <Target aria-hidden /> {t('library:statGoal', { done: runsThisYear, goal, year: currentYear })}
            </span>
          )}
          <button
            type="button"
            className={`lib-stat lib-showcase ${showcase ? 'is-active' : ''}`}
            onClick={() => setParams(showcase ? {} : { view: 'showcase' })}
          >
            <Sparkles aria-hidden /> {t('library:showcase')}
          </button>
          {showcase && (
            <button
              type="button"
              className="lib-stat lib-showcase"
              onClick={() => setArtMode((m) => (m === 'box' ? 'store' : 'box'))}
              title={t('library:artModeHint')}
            >
              {artMode === 'box' ? t('library:artBox') : t('library:artStore')}
            </button>
          )}
          {isMe && !showcase && <BatchAdd />}
          {isMe && !showcase && tracks.length > 0 && (
            <button
              type="button"
              className="lib-stat lib-showcase"
              onClick={() => exportLibrary(tracks, copies)}
              title={t('library:exportHint')}
            >
              <Download aria-hidden /> {t('library:export')}
            </button>
          )}
        </div>
        {goal && (
          <div className="backlog-progress" style={{ marginTop: 'var(--s3)' }}>
            <div className="backlog-progress-bar" role="progressbar" aria-valuenow={Math.min(100, Math.round((runsThisYear / goal) * 100))} aria-valuemin={0} aria-valuemax={100}>
              <div className="backlog-progress-fill" style={{ width: `${Math.min(100, (runsThisYear / goal) * 100)}%` }} />
            </div>
          </div>
        )}
      </header>

      {!showcase && (
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
      )}

      {!showcase && (platforms.length > 0 || dupeCount > 0) && (
        <div className="search-filters" style={{ marginTop: 'calc(var(--s3) * -1)' }}>
          <button
            type="button"
            className={`search-chip ${platform === null && !onlyDupes ? 'is-active' : ''}`}
            onClick={() => { setPlatform(null); setOnlyDupes(false); }}
          >
            {t('browse:filterAll')}
          </button>
          {platforms.map((p) => (
            <button
              key={p}
              type="button"
              className={`search-chip ${platform === p ? 'is-active' : ''}`}
              style={platform === p && PLATFORM_THEMES[p]
                ? { color: PLATFORM_THEMES[p], borderColor: PLATFORM_THEMES[p] }
                : undefined}
              onClick={() => setPlatform(platform === p ? null : p)}
            >
              {p}
            </button>
          ))}
          {dupeCount > 0 && (
            <button
              type="button"
              className={`search-chip ${onlyDupes ? 'is-active' : ''}`}
              onClick={() => setOnlyDupes((v) => !v)}
              title={t('library:dupesHint')}
            >
              <CopyIcon aria-hidden style={{ width: 12, height: 12, verticalAlign: '-2px', marginRight: 4 }} />
              {t('library:dupesChip', { count: dupeCount })}
            </button>
          )}
          <span className="chips-sep" aria-hidden>·</span>
          {(['recent', 'az', 'platform'] as const).map((o) => (
            <button
              key={o}
              type="button"
              className={`search-chip ${order === o ? 'is-active' : ''}`}
              onClick={() => setOrder(o)}
            >
              {t(`library:order_${o}`)}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState icon={LibraryIcon} title={t('library:emptyTitle')} text={t('library:emptyText')} />
      ) : (
        <div
          ref={shelfRef}
          className={`shelf ${showcase ? 'shelf-showcase shelf-physical' : ''} ${platform ? 'shelf-themed' : ''}`}
          style={platform && PLATFORM_THEMES[platform]
            ? ({ '--shelf-accent': PLATFORM_THEMES[platform] } as React.CSSProperties)
            : undefined}
        >
          {shown.map((track) => (
            <ShelfItem key={track.game_id} track={track} runs={runsByGame.get(track.game_id) ?? 0} showcase={showcase} artMode={artMode} />
          ))}
        </div>
      )}
    </div>
  );
}

function ShelfItem({ track, runs, showcase, artMode }: { track: TrackWithGame; runs: number; showcase: boolean; artMode: 'store' | 'box' }) {
  const { t } = useTranslation();
  const g = track.game;
  const SIcon = STATUS_ICON[track.status];
  const meta = (g.metadata as unknown as { box3d?: string; boxart?: string } | null) ?? null;
  // vitrine em modo "caixa": box 3D real > box art física > capa de loja
  const box3d = showcase && artMode === 'box' ? (meta?.box3d ?? null) : null;
  const boxart = showcase && artMode === 'box' && !box3d ? (meta?.boxart ?? null) : null;
  return (
    <Link to={`/games/${g.slug}`} className="shelf-item" title={g.title} data-flip={track.game_id}>
      <div className={`shelf-cover status-${track.status} ${box3d ? 'shelf-cover-3d' : ''}`}>
        {box3d ? (
          <img src={box3d} alt={g.title} loading="lazy" />
        ) : boxart ? (
          <img src={boxart} alt={g.title} loading="lazy" style={{ objectFit: 'contain' }} />
        ) : g.cover_url || g.thumbnail ? (
          <img src={g.cover_url ?? g.thumbnail ?? ''} alt={g.title} loading="lazy" />
        ) : (
          <span className="shelf-cover-fallback">{g.title}</span>
        )}
        <span className={`shelf-badge badge-${track.status}`} title={t(`library:status_${track.status}`)}>
          <SIcon aria-hidden />
        </span>
        {runs >= 2 && (
          <span className="shelf-runs" title={t('library:runsBadge', { count: runs })}>
            🏆×{runs}
          </span>
        )}
      </div>
      <span className="shelf-title">{g.title}</span>
      {!showcase && (
        <span className="shelf-meta mono">
          {g.platforms?.[0] ?? ''}
          {track.hours_played ? ` · ${track.hours_played}h` : ''}
        </span>
      )}
    </Link>
  );
}
