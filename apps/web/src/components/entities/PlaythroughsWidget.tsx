import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Plus, X, Star, Languages, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { useMyPlaythroughs, useAddPlaythrough, useRemovePlaythrough, type Playthrough, type PatchKind } from '@/hooks/useTracks';
import { useUpsertReview } from '@/hooks/useReviews';

/** Opção de patch (tradução/hack DESTE jogo) pro "jogou com". */
export interface PatchOption {
  kind: PatchKind;
  id: string;
  label: string;
}

/** Exibe a data respeitando a precisão registrada. */
function fmt(p: Playthrough): string {
  const [y, m, d] = p.finished_on.split('-');
  if (p.precision === 'year') return y;
  if (p.precision === 'month') return `${m}/${y}`;
  return `${d}/${m}/${y}`;
}

/** "Zeradas": cada vez que terminou o jogo, com data obrigatória (dia/mês/ano). */
export function PlaythroughsWidget({ gameId, patchOptions = [] }: { gameId: string; patchOptions?: PatchOption[] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user, disabled } = useAuth();
  const { data: runs = [] } = useMyPlaythroughs(gameId);
  const add = useAddPlaythrough(gameId);
  const remove = useRemovePlaythrough(gameId);
  const upsertReview = useUpsertReview('game', gameId);

  const [adding, setAdding] = useState(false);
  const [precision, setPrecision] = useState<Playthrough['precision']>('day');
  const [value, setValue] = useState('');
  const [review, setReview] = useState('');
  const [rating, setRating] = useState(0);
  const [patch, setPatch] = useState(''); // "kind:id" ou vazio

  if (disabled || !user) return null;

  const patchLabel = (p: Playthrough): PatchOption | null =>
    (p.patch_id && patchOptions.find((o) => o.id === p.patch_id && o.kind === p.patch_kind)) || null;

  async function save() {
    // data é OBRIGATÓRIA — normaliza pra ISO conforme a precisão
    let iso: string | null = null;
    if (precision === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(value)) iso = value;
    else if (precision === 'month' && /^\d{4}-\d{2}$/.test(value)) iso = `${value}-01`;
    else if (precision === 'year' && /^\d{4}$/.test(value)) iso = `${value}-01-01`;
    if (!iso) { toast.error(t('library:runDateRequired')); return; }
    const [pk, pid] = patch ? patch.split(':') : [null, null];
    try {
      await add.mutateAsync({
        finished_on: iso, precision, notes: review.trim() || null,
        patch_kind: (pk as PatchKind) ?? null, patch_id: pid ?? null,
      });
      // nota opcional vira review pública do jogo (upsert: 1 por usuário)
      if (rating > 0) await upsertReview.mutateAsync({ rating, comment: review.trim() });
      setValue(''); setReview(''); setRating(0); setPatch(''); setAdding(false);
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
              <span className="copies-item-main">
                {fmt(p)}
                {patchLabel(p) && (
                  <span className="patch-chip mono" title={t('library:runWith')}>
                    {patchLabel(p)!.kind === 'translation' ? <Languages aria-hidden /> : <Sparkles aria-hidden />}
                    {patchLabel(p)!.label}
                  </span>
                )}
                {p.notes && <span className="muted-text"> — “{p.notes}”</span>}
              </span>
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
          {patchOptions.length > 0 && (
            <Select value={patch} onChange={(e) => setPatch(e.target.value)} aria-label={t('library:runWith')}>
              <option value="">{t('library:runWithNone')}</option>
              {patchOptions.map((o) => (
                <option key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>
                  {o.kind === 'translation' ? t('entities:kindTranslation') : t('entities:kindRomhack')}: {o.label}
                </option>
              ))}
            </Select>
          )}
          <div className="run-review">
            <span className="stars" role="radiogroup" aria-label={t('community:yourRating')}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n} type="button" className="star-btn"
                  aria-label={String(n)}
                  onClick={() => setRating(rating === n ? 0 : n)}
                >
                  <Star
                    aria-hidden width={18} height={18}
                    style={{ fill: n <= rating ? 'var(--amber)' : 'none', color: n <= rating ? 'var(--amber)' : 'var(--line-bright)' }}
                  />
                </button>
              ))}
            </span>
            <Textarea
              value={review} onChange={(e) => setReview(e.target.value)} rows={2}
              placeholder={t('library:runReviewPh')}
            />
          </div>
          <Button size="sm" variant="primary" onClick={() => void save()} disabled={add.isPending}>
            <Plus /> {t('library:runConfirm')}
          </Button>
        </div>
      )}
    </div>
  );
}
