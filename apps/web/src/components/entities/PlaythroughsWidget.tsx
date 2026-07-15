import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { useMyPlaythroughs, useAddPlaythrough, useRemovePlaythrough, type Playthrough } from '@/hooks/useTracks';

/** Exibe a data respeitando a precisão registrada. */
function fmt(p: Playthrough): string {
  const [y, m, d] = p.finished_on.split('-');
  if (p.precision === 'year') return y;
  if (p.precision === 'month') return `${m}/${y}`;
  return `${d}/${m}/${y}`;
}

/** "Zeradas": cada vez que terminou o jogo, com data obrigatória (dia/mês/ano). */
export function PlaythroughsWidget({ gameId }: { gameId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user, disabled } = useAuth();
  const { data: runs = [] } = useMyPlaythroughs(gameId);
  const add = useAddPlaythrough(gameId);
  const remove = useRemovePlaythrough(gameId);

  const [adding, setAdding] = useState(false);
  const [precision, setPrecision] = useState<Playthrough['precision']>('day');
  const [value, setValue] = useState('');

  if (disabled || !user) return null;

  async function save() {
    // data é OBRIGATÓRIA — normaliza pra ISO conforme a precisão
    let iso: string | null = null;
    if (precision === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(value)) iso = value;
    else if (precision === 'month' && /^\d{4}-\d{2}$/.test(value)) iso = `${value}-01`;
    else if (precision === 'year' && /^\d{4}$/.test(value)) iso = `${value}-01-01`;
    if (!iso) { toast.error(t('library:runDateRequired')); return; }
    try {
      await add.mutateAsync({ finished_on: iso, precision });
      setValue(''); setAdding(false);
      toast.success(t('library:runAdded'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

  return (
    <div className="copies">
      <div className="copies-head">
        <span className="copies-title mono">{t('library:runsTitle', { count: runs.length })}</span>
        <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
          <Plus /> {t('library:runAdd')}
        </Button>
      </div>

      {runs.length > 0 && (
        <ul className="copies-list">
          {runs.map((p) => (
            <li key={p.id} className="copies-item">
              <Trophy aria-hidden />
              <span className="copies-item-main">{fmt(p)}</span>
              <button
                type="button" className="copies-remove" aria-label={t('library:runRemove')}
                onClick={() => void remove.mutateAsync(p.id).catch(() => toast.error(t('forms:submitError')))}
              >
                <X aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="copies-form">
          <Select
            value={precision}
            onChange={(e) => { setPrecision(e.target.value as Playthrough['precision']); setValue(''); }}
            aria-label={t('library:runPrecision')}
          >
            <option value="day">{t('library:prec_day')}</option>
            <option value="month">{t('library:prec_month')}</option>
            <option value="year">{t('library:prec_year')}</option>
          </Select>
          {precision === 'day' && <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} />}
          {precision === 'month' && <Input type="month" value={value} onChange={(e) => setValue(e.target.value)} />}
          {precision === 'year' && (
            <Input type="number" min={1970} max={2100} placeholder="2024" value={value} onChange={(e) => setValue(e.target.value)} />
          )}
          <Button size="sm" variant="primary" onClick={() => void save()} disabled={add.isPending}>
            <Plus /> {t('library:runConfirm')}
          </Button>
        </div>
      )}
    </div>
  );
}
