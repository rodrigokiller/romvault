import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Gamepad2, CheckCircle2, XCircle, Bookmark, Library, Trash2, ChevronDown, Archive } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { useMyTrack, useSetTrack, useRemoveTrack, TRACK_STATUSES, type TrackStatus } from '@/hooks/useTracks';

// eslint-disable-next-line react-refresh/only-export-components
export const STATUS_ICON: Record<TrackStatus, typeof Gamepad2> = {
  playing: Gamepad2,
  finished: CheckCircle2,
  abandoned: XCircle,
  backlog: Bookmark,
  owned: Archive,
};

/** "Adicionar à biblioteca" com escolha de status (jogando/terminado/...). */
export function TrackButton({ gameId }: { gameId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { user, disabled } = useAuth();
  const { data: track } = useMyTrack(gameId);
  const setTrack = useSetTrack(gameId);
  const removeTrack = useRemoveTrack(gameId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  if (disabled) return null;

  async function choose(status: TrackStatus) {
    setOpen(false);
    if (!user) { navigate('/login'); return; }
    try {
      await setTrack.mutateAsync({ status });
      toast.success(t(`library:added_${status}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

  async function remove() {
    setOpen(false);
    try {
      await removeTrack.mutateAsync();
      toast.success(t('library:removed'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

  const Icon = track ? STATUS_ICON[track.status] : Library;

  return (
    <div
      className="share"
      ref={ref}
      onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
    >
      <Button variant={track ? 'primary' : 'secondary'} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon aria-hidden /> {track ? t(`library:status_${track.status}`) : t('library:addToLibrary')} <ChevronDown aria-hidden />
      </Button>
      {open && (
        <div className="share-menu" role="menu">
          {TRACK_STATUSES.map((s) => {
            const SIcon = STATUS_ICON[s];
            return (
              <button
                key={s}
                type="button"
                role="menuitem"
                className={`share-item ${track?.status === s ? 'is-current' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); void choose(s); }}
              >
                <SIcon aria-hidden /> {t(`library:status_${s}`)}
              </button>
            );
          })}
          {track && (
            <button type="button" role="menuitem" className="share-item share-item-danger"
              onMouseDown={(e) => { e.preventDefault(); void remove(); }}>
              <Trash2 aria-hidden /> {t('library:removeFromLibrary')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
