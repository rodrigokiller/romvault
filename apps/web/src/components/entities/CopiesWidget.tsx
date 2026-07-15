import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Disc3, Plus, X, MonitorDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { useMyCopies, useAddCopy, useRemoveCopy } from '@/hooks/useTracks';

/**
 * "Minhas cópias": o nível COLEÇÃO — o mesmo jogo pode existir em várias
 * plataformas e em várias cópias (física/digital, loja, edição).
 */
export function CopiesWidget({ gameId, platforms }: { gameId: string; platforms: string[] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user, disabled } = useAuth();
  const { data: copies = [] } = useMyCopies(gameId);
  const addCopy = useAddCopy(gameId);
  const removeCopy = useRemoveCopy(gameId);

  const [platform, setPlatform] = useState(platforms[0] ?? '');
  const [distribution, setDistribution] = useState<'physical' | 'digital'>('physical');
  const [store, setStore] = useState('');
  const [acquiredAt, setAcquiredAt] = useState('');
  const [price, setPrice] = useState('');
  const [adding, setAdding] = useState(false);

  if (disabled || !user) return null;

  // scanner de duplicatas: já tem este jogo? em quais plataformas?
  const ownedPlatforms = [...new Set(copies.map((c) => c.platform))];

  async function add() {
    if (!platform) return;
    try {
      await addCopy.mutateAsync({
        platform,
        distribution,
        store: store.trim() || null,
        acquired_at: acquiredAt || null,
        price_paid: price ? Number(price) : null,
      });
      setStore(''); setAcquiredAt(''); setPrice('');
      setAdding(false);
      toast.success(t('library:copyAdded'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

  return (
    <div className="copies">
      <div className="copies-head">
        <span className="copies-title mono">
          {t('library:copiesTitle', { count: copies.length })}
        </span>
        <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
          <Plus /> {t('library:copyAdd')}
        </Button>
      </div>

      {copies.length > 0 && (
        <ul className="copies-list">
          {copies.map((copy) => (
            <li key={copy.id} className="copies-item">
              {copy.distribution === 'digital' ? <MonitorDown aria-hidden /> : <Disc3 aria-hidden />}
              <span className="copies-item-main">
                {copy.platform}
                <span className="muted-text">
                  {' · '}{t(`library:dist_${copy.distribution}`)}
                  {copy.store ? ` · ${copy.store}` : ''}
                  {copy.edition ? ` · ${copy.edition}` : ''}
                </span>
              </span>
              <button
                type="button" className="copies-remove" aria-label={t('library:copyRemove')}
                onClick={() => void removeCopy.mutateAsync(copy.id).catch(() => toast.error(t('forms:submitError')))}
              >
                <X aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <>
          {ownedPlatforms.length > 0 && (
            <p className="copies-dup mono">
              {t('library:dupWarning', { platforms: ownedPlatforms.join(', ') })}
            </p>
          )}
          <div className="copies-form">
            <Select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label={t('browse:filterPlatform')}>
              {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
            <Select value={distribution} onChange={(e) => setDistribution(e.target.value as 'physical' | 'digital')} aria-label="tipo">
              <option value="physical">{t('library:dist_physical')}</option>
              <option value="digital">{t('library:dist_digital')}</option>
            </Select>
            <Input value={store} onChange={(e) => setStore(e.target.value)} placeholder={t('library:copyStorePh')} />
            <Input
              type="date" value={acquiredAt} onChange={(e) => setAcquiredAt(e.target.value)}
              aria-label={t('library:copyAcquired')} title={t('library:copyAcquired')}
            />
            <Input
              type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)}
              placeholder={t('library:copyPricePh')} aria-label={t('library:copyPricePh')}
            />
            <Button size="sm" variant="primary" onClick={() => void add()} disabled={addCopy.isPending}>
              <Plus /> {t('library:copyConfirm')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
