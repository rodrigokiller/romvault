import { useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, Library, Eye, Gamepad2, Disc3 } from 'lucide-react';
import type { Game } from '@romvault/core';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { useMyFavoriteGameIds, useToggleFavorite } from '@/hooks/useFavorites';
import { useMyTrackMap, useSetTrack, useAddCopy, TRACK_STATUSES, type TrackStatus } from '@/hooks/useTracks';
import { STATUS_ICON } from './TrackButton';

/**
 * Ações rápidas no card de jogo (sem abrir a página): favoritar, adicionar à
 * biblioteca (menu de status) e quick-view. No desktop aparecem no hover; no
 * touch ficam sempre visíveis (@media hover:none).
 */
export function QuickActions({ game, translationBadges }: { game: Game; translationBadges?: string[] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { user, disabled } = useAuth();
  const { data: favIds } = useMyFavoriteGameIds();
  const { data: trackMap } = useMyTrackMap();
  const toggleFav = useToggleFavorite('game', game.id);
  const setTrack = useSetTrack(game.id);
  const addCopy = useAddCopy(game.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);

  if (disabled) return null;

  const isFav = favIds?.has(game.id) ?? false;
  const status = trackMap?.get(game.id);
  const StatusIcon = status ? STATUS_ICON[status] : Library;

  /** Bloqueia a navegação do Link pai. */
  function halt(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function requireLogin(): boolean {
    if (user) return false;
    navigate('/login');
    return true;
  }

  async function onFav(e: MouseEvent) {
    halt(e);
    if (requireLogin()) return;
    try {
      await toggleFav.mutateAsync(isFav);
    } catch {
      toast.error(t('forms:submitError'));
    }
  }

  async function pick(e: MouseEvent, s: TrackStatus) {
    halt(e);
    setMenuOpen(false);
    if (requireLogin()) return;
    try {
      await setTrack.mutateAsync({ status: s });
      toast.success(t(`library:added_${s}`));
    } catch {
      toast.error(t('forms:submitError'));
    }
  }

  async function ownCopy(e: MouseEvent) {
    halt(e);
    setMenuOpen(false);
    if (requireLogin()) return;
    try {
      await addCopy.mutateAsync({
        platform: game.platforms?.[0] ?? 'PC',
        distribution: 'physical',
        store: null,
      });
      toast.success(t('library:copyAdded'));
    } catch {
      toast.error(t('forms:submitError'));
    }
  }

  return (
    <>
      <div className="qa" onClick={halt}>
        <button
          type="button"
          className={`qa-btn ${isFav ? 'is-on' : ''}`}
          aria-label={t('community:favorite')}
          title={t('community:favorite')}
          onClick={(e) => void onFav(e)}
        >
          <Heart aria-hidden style={{ fill: isFav ? 'currentColor' : 'none' }} />
        </button>

        <div className="qa-lib">
          <button
            type="button"
            className={`qa-btn ${status ? 'is-on' : ''}`}
            aria-label={t('library:addToLibrary')}
            title={status ? t(`library:status_${status}`) : t('library:addToLibrary')}
            aria-expanded={menuOpen}
            onClick={(e) => { halt(e); setMenuOpen((o) => !o); }}
          >
            <StatusIcon aria-hidden />
          </button>
          {menuOpen && (
            <div className="qa-menu" role="menu">
              {TRACK_STATUSES.map((s) => {
                const SIcon = STATUS_ICON[s];
                return (
                  <button
                    key={s}
                    type="button"
                    role="menuitem"
                    className={`qa-menu-item ${status === s ? 'is-current' : ''}`}
                    onClick={(e) => void pick(e, s)}
                  >
                    <SIcon aria-hidden /> {t(`library:status_${s}`)}
                  </button>
                );
              })}
              <button
                type="button"
                role="menuitem"
                className="qa-menu-item qa-menu-copy"
                onClick={(e) => void ownCopy(e)}
              >
                <Disc3 aria-hidden /> {t('library:ownThis')}
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="qa-btn"
          aria-label={t('games:quickView')}
          title={t('games:quickView')}
          onClick={(e) => { halt(e); setViewOpen(true); }}
        >
          <Eye aria-hidden />
        </button>
      </div>

      {viewOpen && (
        <div onClick={halt}>
          <Dialog open={viewOpen} onClose={() => setViewOpen(false)} title={game.title}>
            <div className="qv">
              <div className="qv-cover">
                {game.cover_url || game.thumbnail ? (
                  <img src={game.cover_url ?? game.thumbnail ?? ''} alt={game.title} />
                ) : (
                  <Gamepad2 aria-hidden />
                )}
              </div>
              <div className="qv-body">
                <div className="tile-badges">
                  {(game.platforms ?? []).slice(0, 4).map((p) => (
                    <Badge key={p} tone="accent">{p}</Badge>
                  ))}
                  {(translationBadges ?? []).map((code) => (
                    <span key={code} className="lang-chip" title={t('games:hasTranslations')}>
                      {code}
                    </span>
                  ))}
                </div>
                <div className="tile-meta" style={{ marginTop: 'var(--s2)' }}>
                  {game.release_date && <span>{game.release_date.slice(0, 4)}</span>}
                  {game.developer && <span className="dot">{game.developer}</span>}
                  {game.genres?.length ? <span className="dot">{game.genres.join(', ')}</span> : null}
                </div>
                {game.description && <p className="qv-desc">{game.description}</p>}
                <Link to={`/games/${game.slug}`} onClick={(e) => e.stopPropagation()}>
                  <Button variant="primary" size="sm">{t('games:openFull')}</Button>
                </Link>
              </div>
            </div>
          </Dialog>
        </div>
      )}
    </>
  );
}
