import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Spinner } from './feedback';

/** Botão "carregar mais" para listas paginadas. Some quando não há mais páginas. */
export function LoadMore({
  hasMore,
  loading,
  onMore,
}: {
  hasMore: boolean;
  loading: boolean;
  onMore: () => void;
}) {
  const { t } = useTranslation();
  if (!hasMore) return null;
  return (
    <div className="load-more">
      <Button variant="secondary" onClick={onMore} disabled={loading}>
        {loading ? <Spinner /> : t('browse:loadMore')}
      </Button>
    </div>
  );
}
