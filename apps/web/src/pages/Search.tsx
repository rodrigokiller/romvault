import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search as SearchIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui/feedback';

export function Search() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// search</span>
        <h1>
          {q ? (
            <>
              <span style={{ color: 'var(--muted)' }}>q:</span>{' '}
              <span className="mono">{q}</span>
            </>
          ) : (
            t('common:searchPlaceholder')
          )}
        </h1>
      </header>
      <EmptyState
        icon={SearchIcon}
        title={t('common:comingSoonTitle')}
        text={t('common:comingSoonText')}
      />
    </div>
  );
}
