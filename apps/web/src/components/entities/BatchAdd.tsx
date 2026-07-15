import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ListPlus, Plus } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { useGames } from '@/hooks/useGames';
import { useDebounce } from '@/hooks/useDebounce';
import { TRACK_STATUSES, type TrackStatus } from '@/hooks/useTracks';

const db = () => getSupabase() as unknown as SupabaseClient;

/** "Adicionar vários": busca + checkboxes + um status pra todos de uma vez. */
export function BatchAdd() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<TrackStatus>('backlog');
  const [picked, setPicked] = useState<Map<string, string>>(new Map()); // id -> title
  const debounced = useDebounce(q, 250);
  const { data: results = [] } = useGames({ search: debounced || undefined });

  const batch = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Não autenticado.');
      const rows = [...picked.keys()].map((game_id) => ({
        user_id: user.id, game_id, status, source: 'manual',
      }));
      const { error } = await db().from('game_tracks')
        .upsert(rows, { onConflict: 'user_id,game_id', ignoreDuplicates: true });
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      void qc.invalidateQueries({ queryKey: ['library'] });
      void qc.invalidateQueries({ queryKey: ['trackMap'] });
      toast.success(t('library:batchDone', { count: n }));
      setPicked(new Map());
      setOpen(false);
    },
    onError: () => toast.error(t('forms:submitError')),
  });

  function toggle(id: string, title: string) {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, title);
      return next;
    });
  }

  if (!user) return null;

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <ListPlus /> {t('library:batchAdd')}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('library:batchTitle')}
        footer={
          <div style={{ display: 'flex', gap: 'var(--s3)', alignItems: 'center', width: '100%' }}>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as TrackStatus)}
              aria-label={t('library:batchStatus')}
              style={{ maxWidth: 180 }}
            >
              {TRACK_STATUSES.map((s) => (
                <option key={s} value={s}>{t(`library:status_${s}`)}</option>
              ))}
            </Select>
            <Button
              variant="primary"
              style={{ marginLeft: 'auto' }}
              disabled={picked.size === 0 || batch.isPending}
              onClick={() => void batch.mutateAsync()}
            >
              <Plus /> {t('library:batchConfirm', { count: picked.size })}
            </Button>
          </div>
        }
      >
        <div className="batch">
          <Input
            type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('browse:searchPlaceholder')}
          />
          <div className="batch-list">
            {results.slice(0, 20).map((g) => (
              <label key={g.id} className="batch-item">
                <input
                  type="checkbox"
                  checked={picked.has(g.id)}
                  onChange={() => toggle(g.id, g.title)}
                />
                <span className="batch-item-title">{g.title}</span>
                <span className="batch-item-plat mono">{g.platforms?.[0] ?? ''}</span>
              </label>
            ))}
            {debounced && results.length === 0 && (
              <p className="muted-text" style={{ padding: 'var(--s3)' }}>{t('search:noResults', { q: debounced })}</p>
            )}
          </div>
          {picked.size > 0 && (
            <p className="batch-picked mono">{[...picked.values()].join(' · ')}</p>
          )}
        </div>
      </Dialog>
    </>
  );
}
