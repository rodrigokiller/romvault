import { useEffect, useMemo, useRef, useState } from 'react';
import { useFlip } from '@/hooks/useFlip';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Library as LibraryIcon, Clock, Trophy, Gamepad2, Coins, Copy as CopyIcon, Sparkles, Store, Target, Download, Eye, Languages, RefreshCw, Lock, LockOpen, Check, CheckSquare, X, Layers } from 'lucide-react';
import { GameQuickView } from '@/components/entities/GameQuickView';
import { useToast } from '@/components/ui/Toast';
import { useTranslationLangs, uiLangCode } from '@/hooks/useTranslationLangs';
import { useProfileByUsername } from '@/hooks/useProfile';
import {
  useLibrary, useLibraryCopies, useUserPlaythroughs, useUserSyncSummary, useUserLastPlayed,
  useSetGamesPrivacyBulk, useLibraryRelations, TRACK_STATUSES, type TrackStatus, type TrackWithGame,
} from '@/hooks/useTracks';
import { STATUS_ICON } from '@/components/entities/TrackButton';
import { BatchAdd } from '@/components/entities/BatchAdd';
import { ImportFile } from '@/components/entities/ImportFile';
import { FadeImg } from '@/components/ui/FadeImg';
import { useAuth } from '@/auth/AuthProvider';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';
import { PLATFORM_THEMES } from '@/lib/platformThemes';

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

/** "há 3 dias" / "há 2 meses" — última sessão nos cards da estante. */
function relativeDate(iso: string, t: (k: string, o?: Record<string, unknown>) => string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return t('library:today');
  if (days < 30) return t('library:daysAgo', { count: days });
  if (days < 365) return t('library:monthsAgo', { count: Math.floor(days / 30) });
  return t('library:yearsAgo', { count: Math.floor(days / 365) });
}

/** Estante de jogos do usuário: abas por status + prateleira de capas. */
export function Library() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { username } = useParams<{ username: string }>();
  const [params, setParams] = useSearchParams();
  const showcase = params.get('view') === 'showcase';
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfileByUsername(username);
  const isMe = Boolean(user && profile && user.id === profile.id);
  const { data: tracks = [], isLoading } = useLibrary(profile?.id);
  const { data: copies = [] } = useLibraryCopies(profile?.id);
  const { data: playthroughs = [] } = useUserPlaythroughs(profile?.id);
  const { data: syncSummary = [] } = useUserSyncSummary(profile?.id);
  const { data: lastPlayed } = useUserLastPlayed(profile?.id);
  const [status, setStatus] = useState<TrackStatus | 'all'>('all');
  const [platform, setPlatform] = useState<string | null>(null);
  const [onlyDupes, setOnlyDupes] = useState(false);
  const [onlyPlayable, setOnlyPlayable] = useState(false); // tem tradução no idioma da UI
  const [showPrivate, setShowPrivate] = useState(false); // privados escondidos até do dono, por padrão
  const [order, setOrder] = useState<'recent' | 'az' | 'platform' | 'activity'>('recent');
  // arte da vitrine: capa de loja (retrato) ou box art física
  const [artMode, setArtMode] = useState<'store' | 'box'>('box');
  // modo seleção: marcar vários jogos e aplicar privacidade em massa
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bulkPrivacy = useSetGamesPrivacyBulk();
  // agrupar VERSÕES ligadas (remaster/remake/port) num card só
  const [groupVersions, setGroupVersions] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
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

  // a PONTE hub->tracker: quais jogos da estante têm tradução, e em que idiomas
  const gameIds = useMemo(() => tracks.map((x) => x.game_id), [tracks]);
  // componentes conexos das versões ligadas (union-find sobre game_relations)
  const { data: relEdges = [] } = useLibraryRelations(gameIds);
  const groupOf = useMemo(() => {
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let r = parent.get(x) ?? x;
      while (r !== (parent.get(r) ?? r)) r = parent.get(r) ?? r;
      parent.set(x, r);
      return r;
    };
    for (const e of relEdges) {
      const ra = find(e.a);
      const rb = find(e.b);
      if (ra !== rb) parent.set(ra, rb);
    }
    const roots = new Map<string, string>();
    const sizes = new Map<string, number>();
    for (const id of gameIds) {
      const r = find(id);
      roots.set(id, r);
      sizes.set(r, (sizes.get(r) ?? 0) + 1);
    }
    return { roots, sizes };
  }, [relEdges, gameIds]);
  const hasGroups = useMemo(() => [...groupOf.sizes.values()].some((n) => n > 1), [groupOf]);
  const { data: langsByGame } = useTranslationLangs(gameIds);
  const uiCode = uiLangCode(i18n.language || 'pt-BR');
  const playableCount = useMemo(
    () => tracks.filter((x) => (langsByGame?.get(x.game_id) ?? []).includes(uiCode)).length,
    [tracks, langsByGame, uiCode],
  );

  const shownData = useMemo(() => {
    let list = status === 'all' ? tracks : tracks.filter((x) => x.status === status);
    if (platform) {
      list = list.filter(
        (x) =>
          x.platform === platform ||
          (copiesByGame.get(x.game_id) ?? []).includes(platform) ||
          (x.game.platforms ?? []).includes(platform),
      );
    }
    // privados: fora da lista até ligar o chip (a RLS já esconde dos outros)
    if (!showPrivate) list = list.filter((x) => !x.is_private);
    // "repetidos": jogos com mais de uma cópia
    if (onlyDupes) list = list.filter((x) => (copiesByGame.get(x.game_id) ?? []).length > 1);
    // "jogável no meu idioma": tem tradução de fã no idioma da interface
    if (onlyPlayable) list = list.filter((x) => (langsByGame?.get(x.game_id) ?? []).includes(uiCode));
    // reordenar a coleção (o FLIP anima a troca de lugares)
    if (order === 'az') list = [...list].sort((a, b) => a.game.title.localeCompare(b.game.title));
    else if (order === 'platform') {
      list = [...list].sort((a, b) =>
        (a.game.platforms?.[0] ?? '').localeCompare(b.game.platforms?.[0] ?? '') ||
        a.game.title.localeCompare(b.game.title));
    } else if (order === 'activity') {
      // último jogado (dos syncs) primeiro; quem não tem (retro/manual)
      // mantém a ordem normal no fim — sem "ferrar" a parte retro
      list = [...list].sort((a, b) => {
        const la = lastPlayed?.get(a.game_id) ?? '';
        const lb = lastPlayed?.get(b.game_id) ?? '';
        if (la && lb) return lb.localeCompare(la);
        if (la) return -1;
        if (lb) return 1;
        return 0;
      });
    }

    // AGRUPAR VERSÕES: cada componente conexo (via game_relations) vira um
    // card só — o representante é o último jogado (senão o track mais recente);
    // clicar no selo ×N expande o grupo inline
    const groupBadge = new Map<string, { root: string; size: number; expanded: boolean }>();
    if (groupVersions) {
      const byRoot = new Map<string, TrackWithGame[]>();
      for (const tr of list) {
        const root = groupOf.roots.get(tr.game_id) ?? tr.game_id;
        byRoot.set(root, [...(byRoot.get(root) ?? []), tr]);
      }
      const repOf = new Map<string, string>();
      for (const [root, members] of byRoot) {
        if (members.length < 2) continue;
        const rep = [...members].sort((x, y) => {
          const lx = lastPlayed?.get(x.game_id) ?? '';
          const ly = lastPlayed?.get(y.game_id) ?? '';
          if (lx !== ly) return ly.localeCompare(lx);
          return y.updated_at.localeCompare(x.updated_at);
        })[0];
        repOf.set(root, rep.game_id);
        groupBadge.set(rep.game_id, { root, size: members.length, expanded: expandedGroups.has(root) });
      }
      list = list.filter((tr) => {
        const root = groupOf.roots.get(tr.game_id) ?? tr.game_id;
        const rep = repOf.get(root);
        if (!rep) return true;
        if (expandedGroups.has(root)) return true;
        return tr.game_id === rep;
      });
    }
    return { list, groupBadge };
  }, [tracks, status, platform, copiesByGame, onlyDupes, onlyPlayable, showPrivate, langsByGame, uiCode, order, lastPlayed, groupVersions, groupOf, expandedGroups]);
  const shown = shownData.list;

  // anima a reorganização da estante (filtros/ordenação)
  useFlip(shelfRef, `${status}|${platform}|${onlyDupes}|${onlyPlayable}|${showPrivate}|${order}|${groupVersions}|${expandedGroups.size}|${shown.length}`);

  // atalhos do modo seleção: Esc cancela, Ctrl+A seleciona os visíveis
  useEffect(() => {
    if (!selecting) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelecting(false);
        setSelected(new Set());
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelected(new Set(shown.map((x) => x.game_id)));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecting, shown]);

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

  function toggleSelect(gameId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      return next;
    });
  }

  async function applyBulk(isPrivate: boolean) {
    const ids = [...selected];
    try {
      await bulkPrivacy.mutateAsync({ gameIds: ids, isPrivate });
      toast.success(t('library:bulkDone', { count: ids.length }));
      setSelecting(false);
      setSelected(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
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
          <Link to={`/u/${username}/vitrine`} className="lib-stat lib-showcase">
            <Store aria-hidden /> {t('vitrine:viewVitrine')}
          </Link>
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
          {isMe && !showcase && <ImportFile />}
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
          {isMe && !showcase && tracks.length > 0 && (
            <button
              type="button"
              className={`lib-stat lib-showcase ${selecting ? 'is-active' : ''}`}
              onClick={() => { setSelecting((v) => !v); setSelected(new Set()); }}
              title={t('library:selectHint')}
            >
              <CheckSquare aria-hidden /> {t('library:selectMode')}
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
        {/* tracking POR CONTA dentro da própria library (sem página separada) */}
        {syncSummary.length > 0 && (
          <div className="sync-summary mono">
            <span className="sync-summary-label">// {t('library:syncSummaryLabel')}</span>
            {syncSummary.map((s) => (
              <span key={s.provider} className="sync-summary-item" title={t('library:syncSummaryHint')}>
                <RefreshCw aria-hidden />
                {s.provider === 'retroachievements' ? 'RA' : s.provider}
                {' '}{t('library:statGames', { count: s.games })}
                {s.hours > 0 ? ` · ${s.hours}h` : ''}
                {s.total > 0 ? ` · ${s.earned}/${s.total}` : ''}
              </span>
            ))}
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

      {(platforms.length > 0 || dupeCount > 0) && (
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
          {isMe && tracks.some((x) => x.is_private) && (
            <button
              type="button"
              className={`search-chip ${showPrivate ? 'is-active' : ''}`}
              onClick={() => setShowPrivate((v) => !v)}
              title={t('library:privateChipHint')}
            >
              <Lock aria-hidden style={{ width: 12, height: 12, verticalAlign: '-2px', marginRight: 4 }} />
              {t('library:privateChip', { count: tracks.filter((x) => x.is_private).length })}
            </button>
          )}
          {hasGroups && (
            <button
              type="button"
              className={`search-chip ${groupVersions ? 'is-active' : ''}`}
              onClick={() => { setGroupVersions((v) => !v); setExpandedGroups(new Set()); }}
              title={t('library:groupHint')}
            >
              <Layers aria-hidden style={{ width: 12, height: 12, verticalAlign: '-2px', marginRight: 4 }} />
              {t('library:groupVersions')}
            </button>
          )}
          {playableCount > 0 && (
            <button
              type="button"
              className={`search-chip ${onlyPlayable ? 'is-active' : ''}`}
              onClick={() => setOnlyPlayable((v) => !v)}
              title={t('library:playableHint', { lang: uiCode })}
            >
              <Languages aria-hidden style={{ width: 12, height: 12, verticalAlign: '-2px', marginRight: 4 }} />
              {t('library:playableChip', { lang: uiCode, count: playableCount })}
            </button>
          )}
          <span className="chips-sep" aria-hidden>·</span>
          {(['recent', 'az', 'platform', 'activity'] as const).map((o) => (
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
            <ShelfItem
              key={track.game_id} track={track} runs={runsByGame.get(track.game_id) ?? 0}
              showcase={showcase} artMode={artMode}
              langBadge={(langsByGame?.get(track.game_id) ?? []).includes(uiCode) ? uiCode : null}
              selecting={selecting}
              isSelected={selected.has(track.game_id)}
              onToggleSelect={() => toggleSelect(track.game_id)}
              group={shownData.groupBadge.get(track.game_id)}
              onToggleGroup={(root) => setExpandedGroups((prev) => {
                const next = new Set(prev);
                if (next.has(root)) next.delete(root);
                else next.add(root);
                return next;
              })}
            />
          ))}
        </div>
      )}

      {/* barra de ações em massa (modo seleção): privacidade estilo Steam */}
      {selecting && (
        <div className="bulk-bar" role="toolbar" aria-label={t('library:selectMode')}>
          <span className="bulk-bar-count mono">{t('library:selectedCount', { count: selected.size })}</span>
          <button
            type="button" className="search-chip"
            onClick={() => setSelected(new Set(shown.map((x) => x.game_id)))}
          >
            {t('library:selectVisible')}
          </button>
          {selected.size > 0 && (
            <button type="button" className="search-chip" onClick={() => setSelected(new Set())}>
              {t('library:selectClear')}
            </button>
          )}
          <span className="chips-sep" aria-hidden>·</span>
          <button
            type="button" className="search-chip bulk-chip-private"
            disabled={selected.size === 0 || bulkPrivacy.isPending}
            onClick={() => void applyBulk(true)}
          >
            <Lock aria-hidden /> {t('library:bulkPrivate')}
          </button>
          <button
            type="button" className="search-chip"
            disabled={selected.size === 0 || bulkPrivacy.isPending}
            onClick={() => void applyBulk(false)}
          >
            <LockOpen aria-hidden /> {t('library:bulkPublic')}
          </button>
          <button
            type="button" className="search-chip"
            onClick={() => { setSelecting(false); setSelected(new Set()); }}
            aria-label={t('forms:actionReset')}
          >
            <X aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

/** Tipo de "chassi" físico por plataforma (protótipo do molde de caixa). */
const JEWEL_PLATFORMS = new Set(['PS1', 'PS2', 'Saturn', 'Dreamcast', 'Sega CD']);
const CARTON_PLATFORMS = new Set([
  'SNES', 'NES', 'N64', 'Genesis', 'Master System', 'Game Gear', 'Game Boy',
  'GBC', 'GBA', 'Virtual Boy', '32X', 'FDS', 'TG-16',
]);

function ShelfItem({ track, runs, showcase, artMode, langBadge, selecting = false, isSelected = false, onToggleSelect, group, onToggleGroup }: {
  track: TrackWithGame; runs: number; showcase: boolean; artMode: 'store' | 'box';
  langBadge?: string | null; selecting?: boolean; isSelected?: boolean; onToggleSelect?: () => void;
  /** representante de um grupo de versões ligadas (modo "Agrupar versões") */
  group?: { root: string; size: number; expanded: boolean };
  onToggleGroup?: (root: string) => void;
}) {
  const { t } = useTranslation();
  const [viewOpen, setViewOpen] = useState(false);
  const g = track.game;
  const SIcon = STATUS_ICON[track.status];
  const adult = Boolean((g as typeof g & { is_adult?: boolean }).is_adult);
  /** Bloqueia a navegação do Link pai (quick view abre modal no lugar). */
  function halt(e: { preventDefault: () => void; stopPropagation: () => void }) {
    e.preventDefault();
    e.stopPropagation();
  }
  const meta = (g.metadata as unknown as { box3d?: string; boxart?: string } | null) ?? null;
  // vitrine em modo "caixa": box 3D real > box art física > capa de loja NO MOLDE
  const box3d = showcase && artMode === 'box' ? (meta?.box3d ?? null) : null;
  const boxart = showcase && artMode === 'box' && !box3d ? (meta?.boxart ?? null) : null;
  const plat = g.platforms?.[0] ?? '';
  // sem arte física: a capa de loja entra num CHASSI da plataforma (molde)
  const caseType = showcase && artMode === 'box' && !box3d && !boxart
    ? (JEWEL_PLATFORMS.has(plat) ? 'jewel' : CARTON_PLATFORMS.has(plat) ? 'carton' : null)
    : null;
  return (
    <Link
      to={`/games/${g.slug}`}
      className={`shelf-item ${selecting ? 'is-selecting' : ''} ${isSelected ? 'is-selected' : ''}`}
      title={g.title} data-flip={track.game_id}
      aria-pressed={selecting ? isSelected : undefined}
      onClick={selecting ? (e) => { halt(e); onToggleSelect?.(); } : undefined}
    >
      <div className={`shelf-cover status-${track.status} ${box3d ? 'shelf-cover-3d' : ''} ${adult ? 'adult-blur' : ''}`}>
        {box3d ? (
          <FadeImg src={box3d} alt={g.title} />
        ) : boxart ? (
          <FadeImg src={boxart} alt={g.title} style={{ objectFit: 'contain' }} />
        ) : caseType && (g.cover_url || g.thumbnail) ? (
          <span
            className={`case case-${caseType}`}
            style={PLATFORM_THEMES[plat] ? ({ '--case-accent': PLATFORM_THEMES[plat] } as React.CSSProperties) : undefined}
          >
            {caseType === 'jewel' && <span className="case-spine" aria-hidden />}
            {caseType === 'carton' && <span className="case-band mono" aria-hidden>{plat}</span>}
            <FadeImg className="case-art" src={g.cover_url ?? g.thumbnail ?? ''} alt={g.title} />
          </span>
        ) : g.cover_url || g.thumbnail ? (
          <FadeImg src={g.cover_url ?? g.thumbnail ?? ''} alt={g.title} />
        ) : (
          <span className="shelf-cover-fallback">{g.title}</span>
        )}
        {adult && <span className="adult-tag mono" title={t('games:adultHint')}>+18</span>}
        <span className={`shelf-badge badge-${track.status}`} title={t(`library:status_${track.status}`)}>
          <SIcon aria-hidden />
        </span>
        {track.is_private && !selecting && (
          <span className="shelf-private" title={t('library:privateBadge')}>
            <Lock aria-hidden />
          </span>
        )}
        {group && (
          <button
            type="button"
            className={`shelf-group mono ${group.expanded ? 'is-open' : ''}`}
            title={t('library:groupBadge', { count: group.size })}
            onClick={(e) => { halt(e); onToggleGroup?.(group.root); }}
          >
            <Layers aria-hidden /> ×{group.size}
          </button>
        )}
        {selecting ? (
          <span className={`shelf-check ${isSelected ? 'is-on' : ''}`} aria-hidden>
            {isSelected && <Check />}
          </span>
        ) : (
          <button
            type="button"
            className="shelf-eye"
            title={t('games:quickView')}
            onClick={(e) => { halt(e); setViewOpen(true); }}
          >
            <Eye aria-hidden />
          </button>
        )}
        {runs >= 2 && (
          <span className="shelf-runs" title={t('library:runsBadge', { count: runs })}>
            <Trophy aria-hidden /> ×{runs}
          </span>
        )}
        {langBadge && (
          <span className="shelf-lang mono" title={t('library:playableHint', { lang: langBadge })}>
            {langBadge}
          </span>
        )}
      </div>
      <span className="shelf-title">{g.title}</span>
      {!showcase && (
        <>
          <span className="shelf-meta mono">
            {g.platforms?.[0] ?? ''}
            {track.hours_played ? ` · ${track.hours_played}h` : ''}
            {track.achievements_total
              ? ` · ${track.achievements_earned ?? 0}/${track.achievements_total}`
              : ''}
          </span>
          <span className="shelf-meta shelf-meta-sub mono" title={t('library:lastSession')}>
            {relativeDate(track.updated_at, t)}
            {track.source !== 'manual' ? ` · ${track.source}` : ''}
          </span>
        </>
      )}
      {viewOpen && (
        <span onClick={halt}>
          <GameQuickView game={g} open={viewOpen} onClose={() => setViewOpen(false)} />
        </span>
      )}
    </Link>
  );
}
