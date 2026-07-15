import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layers, ArrowLeft } from 'lucide-react';
import { useCollections, useCollection } from '@/hooks/useCollections';
import { MaterialCard } from '@/components/entities/MaterialCard';
import { GameCard } from '@/components/entities/GameCard';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';
import type { Game } from '@romvault/core';

export function CollectionsList() {
  const { t } = useTranslation();
  const { data: collections = [], isLoading } = useCollections();

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t('collections:kicker')}</span>
        <h1>{t('collections:title')}</h1>
        <p className="page-sub">{t('collections:subtitle')}</p>
      </header>
      {isLoading ? (
        <LoadingPage />
      ) : collections.length === 0 ? (
        <EmptyState icon={Layers} title={t('collections:emptyTitle')} text={t('collections:emptyText')} />
      ) : (
        <div className="collection-grid">
          {collections.map((col) => (
            <Link key={col.id} to={`/collections/${col.slug}`} className="collection-card">
              <div className="collection-cover">
                {col.cover_url ? <img src={col.cover_url} alt="" loading="lazy" /> : <Layers aria-hidden />}
              </div>
              <div className="collection-body">
                <h2>{col.title}</h2>
                {col.description && <p>{col.description}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function CollectionDetail() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const { data, isLoading } = useCollection(slug);

  if (isLoading) return <LoadingPage />;
  if (!data) {
    return (
      <div className="container">
        <EmptyState icon={Layers} title={t('entities:notFoundTitle')} />
        <Link to="/collections" className="back-link"><ArrowLeft aria-hidden /> {t('entities:backToList')}</Link>
      </div>
    );
  }

  const { collection, items } = data;
  return (
    <div className="container">
      <Link to="/collections" className="back-link"><ArrowLeft aria-hidden /> {t('entities:backToList')}</Link>
      <header className="page-head">
        <span className="kicker">// {t('collections:kicker')}</span>
        <h1>{collection.title}</h1>
        {collection.description && <p className="page-sub">{collection.description}</p>}
      </header>
      {items.length === 0 ? (
        <EmptyState icon={Layers} title={t('collections:emptyItemsTitle')} />
      ) : (
        <div className="card-grid">
          {items.map((entry) =>
            entry.kind === 'game' ? (
              <GameCard key={`g-${String(entry.item.id)}`} game={entry.item as unknown as Game} />
            ) : (
              <MaterialCard key={`${entry.kind}-${String(entry.item.id)}`} kind={entry.kind} item={entry.item} />
            ),
          )}
        </div>
      )}
    </div>
  );
}
