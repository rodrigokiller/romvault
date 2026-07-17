import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Store, ArrowLeft, Pencil, Upload, Trash2, Rows3, LayoutGrid, Eye, X,
  Repeat, ChevronLeft, ChevronRight, ArrowLeftRight, Check,
} from 'lucide-react';
import type { Game } from '@romvault/core';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useProfileByUsername, useMyProfile } from '@/hooks/useProfile';
import { useSetCustomArt } from '@/hooks/useTracks';
import { useShelfOrder, useSaveShelfOrder } from '@/hooks/useShelves';
import { GameQuickView } from '@/components/entities/GameQuickView';
import { FadeImg } from '@/components/ui/FadeImg';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';
import { PLATFORM_THEMES as THEMES, SPINE_FAMILY } from '@/lib/platformThemes';

const db = () => getSupabase() as unknown as SupabaseClient;

interface OwnedGame {
  game: Game;
  platforms: string[]; // plataformas das CÓPIAS deste usuário
  acquired: string;    // 1ª cópia (ordem padrão: chegada na coleção)
  customArt: string | null;
}

/** Jogos que o usuário TEM (cópias), com jogo embutido + arte custom do track. */
function useOwnedGames(userId: string | undefined) {
  return useQuery({
    queryKey: ['ownedGames', userId],
    staleTime: 5 * 60_000,
    enabled: env.configured && Boolean(userId),
    queryFn: async (): Promise<OwnedGame[]> => {
      const [{ data: copies }, { data: arts }] = await Promise.all([
        db().from('game_copies')
          .select('game_id, platform, created_at, game:games(*)')
          .eq('user_id', userId as string)
          .order('created_at', { ascending: true })
          .range(0, 4999),
        db().from('game_tracks')
          .select('game_id, custom_art')
          .eq('user_id', userId as string)
          .not('custom_art', 'is', null)
          .range(0, 4999),
      ]);
      const artOf = new Map((arts ?? []).map((r) => [r.game_id as string, r.custom_art as string]));
      const map = new Map<string, OwnedGame>();
      for (const c of (copies ?? []) as unknown as { game_id: string; platform: string; created_at: string; game: Game | null }[]) {
        if (!c.game) continue;
        const prev = map.get(c.game_id);
        if (prev) {
          if (!prev.platforms.includes(c.platform)) prev.platforms.push(c.platform);
        } else {
          map.set(c.game_id, {
            game: c.game,
            platforms: [c.platform],
            acquired: c.created_at,
            customArt: artOf.get(c.game_id) ?? null,
          });
        }
      }
      // ordem padrão: chegada na coleção (novos no fim)
      return [...map.values()].sort((a, b) => a.acquired.localeCompare(b.acquired));
    },
  });
}

/** Aplica a ordem manual salva: itens ordenados primeiro, o resto no fim. */
function applyOrder(items: OwnedGame[], order: string[] | undefined): OwnedGame[] {
  if (!order?.length) return items;
  const pos = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const pa = pos.get(a.game.id) ?? Number.MAX_SAFE_INTEGER;
    const pb = pos.get(b.game.id) ?? Number.MAX_SAFE_INTEGER;
    return pa !== pb ? pa - pb : a.acquired.localeCompare(b.acquired);
  });
}

/**
 * VITRINE — apresentação dos jogos que o usuário TEM (spec v2, estilo app do
 * Nintendo Switch Online): grid masonry de PROPORÇÃO NATURAL (paisagem ocupa
 * largura, retrato ocupa altura — sem tarjas), views TODOS + por plataforma,
 * vista alternativa "Lombadas" e reordenação por arrastar (dono da vitrine).
 */
export function Vitrine() {
  const { t } = useTranslation();
  const { username } = useParams<{ username: string }>();
  const { data: profile, isLoading: profileLoading } = useProfileByUsername(username);
  const { data: me } = useMyProfile();
  const { data: owned = [], isLoading } = useOwnedGames(profile?.id);
  const [view, setView] = useState<string>('all');
  const [artMode, setArtMode] = useState<'box' | 'store'>('box');
  const [spines, setSpines] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const isMe = Boolean(me && profile && me.id === profile.id);

  /* ── a vitrine lembra como você deixou (modo/arte/view, por vitrine) ── */
  const prefsKey = profile ? `rv:vitrine:${profile.id}` : null;
  const hydrated = useRef(false);
  useEffect(() => {
    if (!prefsKey) return;
    try {
      const p = JSON.parse(localStorage.getItem(prefsKey) ?? 'null') as
        { view?: string; artMode?: 'box' | 'store'; spines?: boolean } | null;
      if (p) {
        if (p.view) setView(p.view);
        if (p.artMode) setArtMode(p.artMode);
        setSpines(Boolean(p.spines));
      }
    } catch { /* prefs corrompidas: ignora */ }
    hydrated.current = true;
  }, [prefsKey]);
  useEffect(() => {
    if (!prefsKey || !hydrated.current) return;
    localStorage.setItem(prefsKey, JSON.stringify({ view, artMode, spines }));
  }, [prefsKey, view, artMode, spines]);

  const { data: savedOrder } = useShelfOrder(profile?.id, view);
  const saveOrder = useSaveShelfOrder(view);
  const toast = useToast();

  // views: TODOS + cada plataforma em que há cópias
  const platforms = useMemo(
    () => [...new Set(owned.flatMap((o) => o.platforms))].sort(),
    [owned],
  );
  const shown = useMemo(() => {
    const inView = view === 'all' ? owned : owned.filter((o) => o.platforms.includes(view));
    return applyOrder(inView, savedOrder);
  }, [owned, view, savedOrder]);
  const accent = view !== 'all' ? THEMES[view] : undefined;

  // view lembrada pode apontar pra uma plataforma que não existe mais
  useEffect(() => {
    if (owned.length > 0 && view !== 'all' && !platforms.includes(view)) setView('all');
  }, [owned.length, view, platforms]);

  /* ── drag-and-drop (só o dono): solta ANTES do item alvo e persiste ── */
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  function drop(target: number) {
    if (dragIdx === null || dragIdx === target) { setDragIdx(null); setOverIdx(null); return; }
    const ids = shown.map((o) => o.game.id);
    const [moved] = ids.splice(dragIdx, 1);
    ids.splice(target > dragIdx ? target - 1 : target, 0, moved);
    setDragIdx(null);
    setOverIdx(null);
    saveOrder.mutate(ids, { onError: () => toast.error(t('forms:submitError')) });
  }

  /** Props de arrasto compartilhadas entre capas e lombadas. */
  function dragProps(i: number) {
    if (!isMe) return {};
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => { e.dataTransfer.effectAllowed = 'move'; setDragIdx(i); },
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (overIdx !== i) setOverIdx(i); },
      onDrop: (e: React.DragEvent) => { e.preventDefault(); drop(i); },
      onDragEnd: () => { setDragIdx(null); setOverIdx(null); },
    };
  }

  /** Move um item N posições (botões do modo reordenar — funciona no touch). */
  function moveBy(i: number, delta: number) {
    const target = i + delta;
    if (target < 0 || target >= shown.length) return;
    const ids = shown.map((o) => o.game.id);
    const [moved] = ids.splice(i, 1);
    ids.splice(target, 0, moved);
    saveOrder.mutate(ids, { onError: () => toast.error(t('forms:submitError')) });
  }
  const dragClass = (i: number) =>
    `${dragIdx === i ? 'is-dragging' : ''} ${overIdx === i && dragIdx !== null && dragIdx !== i ? 'is-drop-target' : ''}`;

  if (profileLoading || isLoading) return <LoadingPage />;
  if (!profile) {
    return <div className="container"><EmptyState icon={Store} title={t('profile:notFound')} /></div>;
  }

  return (
    <div
      className="vitrine"
      style={accent ? ({ '--vt-accent': accent } as React.CSSProperties) : undefined}
    >
      {/* fundo temático da plataforma (tipográfico até os desenhos chegarem) */}
      {view !== 'all' && (
        <span className="vitrine-bg mono" aria-hidden>{view}</span>
      )}

      <div className="container vitrine-inner">
        <header className="vitrine-head">
          <div>
            <Link to={`/u/${username}`} className="back-link">
              <ArrowLeft aria-hidden /> @{profile.username}
            </Link>
            <h1>{t('vitrine:title', { user: profile.username ?? username })}</h1>
            <p className="page-sub">
              {t('vitrine:subtitle', { count: owned.length })}
              {isMe && !spines && <span className="vitrine-drag-hint"> · {t('vitrine:dragHint')}</span>}
            </p>
          </div>
          <div className="vitrine-modes">
            <button
              type="button"
              className="lib-stat lib-showcase"
              onClick={() => setSpines((s) => !s)}
            >
              {spines
                ? <><LayoutGrid aria-hidden /> {t('vitrine:mode_covers')}</>
                : <><Rows3 aria-hidden /> {t('vitrine:mode_spines')}</>}
            </button>
            {!spines && (
              <button
                type="button"
                className="lib-stat lib-showcase"
                onClick={() => setArtMode((m) => (m === 'box' ? 'store' : 'box'))}
              >
                {artMode === 'box' ? t('library:artBox') : t('library:artStore')}
              </button>
            )}
            {isMe && !spines && (
              <button
                type="button"
                className={`lib-stat lib-showcase ${ordering ? 'is-active' : ''}`}
                onClick={() => setOrdering((o) => !o)}
              >
                {ordering
                  ? <><Check aria-hidden /> {t('vitrine:orderDone')}</>
                  : <><ArrowLeftRight aria-hidden /> {t('vitrine:order')}</>}
              </button>
            )}
          </div>
        </header>

        {/* estantes: TODOS + plataformas */}
        <div className="vitrine-tabs" role="tablist">
          <button
            type="button" role="tab" aria-selected={view === 'all'}
            className={`vitrine-tab ${view === 'all' ? 'is-active' : ''}`}
            onClick={() => setView('all')}
          >
            {t('vitrine:all')} <span className="search-chip-n">{owned.length}</span>
          </button>
          {platforms.map((p) => (
            <button
              key={p} type="button" role="tab" aria-selected={view === p}
              className={`vitrine-tab ${view === p ? 'is-active' : ''}`}
              style={view === p && THEMES[p] ? { color: THEMES[p], borderColor: THEMES[p] } : undefined}
              onClick={() => setView(p)}
            >
              {p} <span className="search-chip-n">{owned.filter((o) => o.platforms.includes(p)).length}</span>
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <EmptyState icon={Store} title={t('vitrine:emptyTitle')} text={t('vitrine:emptyText')} />
        ) : spines ? (
          <div className="spine-shelf">
            {shown.map((o, i) => {
              const plat = view !== 'all' && o.platforms.includes(view) ? view : o.platforms[0];
              const family = SPINE_FAMILY[plat] ?? 'dvd';
              const color = THEMES[plat];
              return (
                <Link
                  key={o.game.id}
                  to={`/games/${o.game.slug}`}
                  className={`spine spine-${family} ${dragClass(i)}`}
                  style={color ? ({ '--spine-accent': color } as React.CSSProperties) : undefined}
                  title={`${o.game.title} (${plat})`}
                  {...dragProps(i)}
                >
                  <span className="spine-title">{o.game.title}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="vitrine-grid">
            {shown.map((o, i) => (
              <VitrineCard
                key={o.game.id}
                owned={o}
                artMode={artMode}
                canEdit={isMe}
                className={dragClass(i)}
                dragProps={dragProps(i)}
                ordering={ordering}
                onMove={(delta) => moveBy(i, delta)}
                atStart={i === 0}
                atEnd={i === shown.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Card da grade de capas: quick view, flip do verso, reordenar e arte custom. */
function VitrineCard({
  owned: o, artMode, canEdit, className, dragProps, ordering, onMove, atStart, atEnd,
}: {
  owned: OwnedGame;
  artMode: 'box' | 'store';
  canEdit: boolean;
  className?: string;
  dragProps?: Record<string, unknown>;
  ordering?: boolean;
  onMove?: (delta: number) => void;
  atStart?: boolean;
  atEnd?: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const setArt = useSetCustomArt();
  const [editing, setEditing] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [url, setUrl] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  // clique fora fecha o editor de arte
  useEffect(() => {
    if (!editing) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setEditing(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [editing]);

  const meta = (o.game.metadata as unknown as {
    box3d?: string; boxart?: string; moby?: { front?: string; back?: string };
  } | null) ?? null;
  // prioridade: arte CUSTOM do usuário > (caixa: box3d > boxart > loja) > loja
  const art = o.customArt
    ?? (artMode === 'box' ? (meta?.box3d ?? meta?.boxart ?? o.game.cover_url) : o.game.cover_url)
    ?? o.game.thumbnail;
  const back = meta?.moby?.back ?? null; // verso real da caixa (scan do Moby)

  async function save(value: string | null) {
    try {
      await setArt.mutateAsync({ gameId: o.game.id, url: value });
      toast.success(value ? t('vitrine:artSaved') : t('vitrine:artRemoved'));
      setEditing(false);
      setUrl('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

  return (
    <div className={`vitrine-card-wrap ${className ?? ''}`} ref={wrapRef} {...dragProps}>
      <Link
        to={`/games/${o.game.slug}`}
        className={`vitrine-card ${flipped ? 'is-flipped' : ''}`}
        title={o.game.title}
        onClick={(e) => { if (ordering) e.preventDefault(); }}
      >
        <span className="vitrine-flip">
          <span className="vitrine-face vitrine-face-front">
            {art ? (
              <FadeImg src={art} alt={o.game.title} />
            ) : (
              <span className="vitrine-card-fallback">{o.game.title}</span>
            )}
          </span>
          {back && (
            <span className="vitrine-face vitrine-face-back" aria-hidden={!flipped}>
              <img src={back} alt="" loading="lazy" />
            </span>
          )}
        </span>
      </Link>
      {ordering ? (
        <span className="vitrine-move">
          <button
            type="button" disabled={atStart}
            title={t('vitrine:moveBack')} aria-label={t('vitrine:moveBack')}
            onClick={() => onMove?.(-1)}
          >
            <ChevronLeft aria-hidden />
          </button>
          <button
            type="button" disabled={atEnd}
            title={t('vitrine:moveFwd')} aria-label={t('vitrine:moveFwd')}
            onClick={() => onMove?.(1)}
          >
            <ChevronRight aria-hidden />
          </button>
        </span>
      ) : (
        <>
          <button
            type="button"
            className="vitrine-hover-btn vitrine-eye"
            title={t('games:quickView')}
            onClick={() => setViewOpen(true)}
          >
            <Eye aria-hidden />
          </button>
          {back && (
            <button
              type="button"
              className={`vitrine-hover-btn vitrine-flipbtn ${flipped ? 'is-on' : ''}`}
              title={t('vitrine:flip')}
              onClick={() => setFlipped((f) => !f)}
            >
              <Repeat aria-hidden />
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              className="vitrine-hover-btn vitrine-edit"
              title={t('vitrine:editArt')}
              onClick={() => { setUrl(o.customArt ?? ''); setEditing((e) => !e); }}
            >
              <Pencil aria-hidden />
            </button>
          )}
        </>
      )}
      {editing && (
        <div
          className="vitrine-art-editor"
          onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
        >
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('vitrine:artUrlPh')}
            aria-label={t('vitrine:editArt')}
            autoFocus
          />
          <div className="vitrine-art-actions">
            <Button size="sm" variant="primary" disabled={setArt.isPending || !url.trim()} onClick={() => void save(url.trim())}>
              {t('vitrine:artSave')}
            </Button>
            {o.customArt && (
              <Button size="sm" variant="ghost" disabled={setArt.isPending} onClick={() => void save(null)}>
                <Trash2 /> {t('vitrine:artRemove')}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X /> {t('forms:actionReset')}
            </Button>
            {/* molde não-funcional: upload real vem com storage próprio (ver ROADMAP) */}
            <Button size="sm" variant="ghost" disabled title={t('vitrine:artUploadSoon')}>
              <Upload /> {t('vitrine:artUploadSoon')}
            </Button>
          </div>
        </div>
      )}
      {viewOpen && <GameQuickView game={o.game} open={viewOpen} onClose={() => setViewOpen(false)} />}
    </div>
  );
}
