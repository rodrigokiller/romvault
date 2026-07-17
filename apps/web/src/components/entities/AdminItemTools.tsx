import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Shield, RefreshCw, ImagePlus } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { useIsAdmin } from '@/hooks/useProfile';

/**
 * Ferramenta de admin NA PÁGINA do jogo (estilo trakt): re-sincroniza
 * metadados/arte do IGDB ou define arte manual por URL — sem sair da página.
 */
export function AdminItemTools({ gameId, dataSource, updatedAt, igdbId }: {
  gameId: string;
  dataSource?: string | null;
  updatedAt?: string | null;
  igdbId?: number | null;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [target, setTarget] = useState<'cover_url' | 'boxart' | 'box3d'>('cover_url');
  const [url, setUrl] = useState('');

  if (!isAdmin) return null;

  async function call(body: Record<string, unknown>, okMsg: string) {
    setRunning(true);
    try {
      const { data, error } = await getSupabase().functions.invoke('game-sync', { body });
      if (error) throw error;
      const d = data as { error?: string; updated?: string[]; matched?: string; note?: string };
      if (d?.error) throw new Error(d.error);
      toast.success(d?.note ?? `${okMsg}${d?.updated?.length ? `: ${d.updated.join(', ')}` : ''}`);
      void qc.invalidateQueries({ queryKey: ['game'] });
      void qc.invalidateQueries({ queryKey: ['games'] });
      setUrl('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      const notDeployed = /failed to send|fetch|networkerror/i.test(msg);
      toast.error(notDeployed ? t('settings:fnNotDeployed', { fn: 'game-sync' }) : (msg || t('forms:submitError')));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="admin-tools">
      <button type="button" className="admin-tools-toggle mono" onClick={() => setOpen((o) => !o)}>
        <Shield aria-hidden /> {t('admin:itemTools')}
      </button>
      {open && (
        <div className="admin-tools-body">
          {/* histórico: de onde veio e quando foi tocado pela última vez */}
          <span className="admin-tools-hint mono">
            {t('admin:itemSource')}: {dataSource ?? '?'}
            {igdbId ? ` · igdb_id ${igdbId}` : ` · ${t('admin:itemNoIgdb')}`}
            {updatedAt ? ` · ${t('admin:itemUpdated')} ${new Date(updatedAt).toLocaleDateString()}` : ''}
          </span>
          <div className="admin-tools-row">
            <Button
              size="sm" variant="secondary" disabled={running}
              onClick={() => void call({ game_id: gameId, action: 'igdb' }, t('admin:itemSynced'))}
            >
              {running ? <Spinner /> : <RefreshCw />} {t('admin:itemSyncIgdb')}
            </Button>
            <span className="admin-tools-hint">{t('admin:itemSyncHint')}</span>
          </div>
          <div className="admin-tools-row">
            <Select value={target} onChange={(e) => setTarget(e.target.value as typeof target)} aria-label={t('admin:itemArtTarget')}>
              <option value="cover_url">{t('admin:art_cover')}</option>
              <option value="boxart">{t('admin:art_boxart')}</option>
              <option value="box3d">{t('admin:art_box3d')}</option>
            </Select>
            <Input
              value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder={t('vitrine:artUrlPh')} aria-label={t('admin:itemArtTarget')}
            />
            <Button
              size="sm" variant="primary" disabled={running || !url.trim()}
              onClick={() => void call({ game_id: gameId, action: 'set-art', [target]: url.trim() }, t('admin:itemArtSet'))}
            >
              <ImagePlus /> {t('library:copyConfirm')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
