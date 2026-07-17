import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Flag } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';

const db = () => getSupabase() as unknown as SupabaseClient;

const REASONS = ['wrong_art', 'wrong_match', 'wrong_data', 'broken_link', 'other'] as const;

/**
 * "Reportar problema": qualquer usuário sinaliza arte/dados/match errado —
 * cai na fila do admin com o link da página. O FF VI com arte de FF VII
 * teria sido reportado pelo primeiro visitante.
 */
export function ReportButton({ subjectType, subjectId, subjectLabel }: {
  subjectType: 'game' | 'romhack' | 'translation' | 'doc' | 'tool';
  subjectId: string;
  subjectLabel: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user, disabled } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]>('wrong_art');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (disabled || !user) return null;

  async function send() {
    setBusy(true);
    try {
      const { error } = await db().from('reports').insert({
        user_id: user!.id,
        subject_type: subjectType,
        subject_id: subjectId,
        subject_label: subjectLabel,
        subject_url: window.location.pathname,
        reason,
        note: note.trim() || null,
      });
      if (error) throw error;
      toast.success(t('report:sent'));
      setOpen(false);
      setNote('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title={t('report:title')}>
        <Flag /> {t('report:btn')}
      </Button>
      {open && (
        <Dialog open={open} onClose={() => setOpen(false)} title={t('report:title')}>
          <p className="page-sub">{t('report:text', { title: subjectLabel })}</p>
          <div style={{ display: 'grid', gap: 'var(--s3)', marginTop: 'var(--s3)' }}>
            <Select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} aria-label={t('report:reason')}>
              {REASONS.map((r) => <option key={r} value={r}>{t(`report:r_${r}`)}</option>)}
            </Select>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('report:notePh')} />
            <div className="submit-actions">
              <Button variant="primary" size="sm" disabled={busy} onClick={() => void send()}>
                <Flag /> {t('report:send')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
