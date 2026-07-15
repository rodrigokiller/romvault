import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Gamepad2 } from 'lucide-react';
import { useGame } from '@/hooks/useGames';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';

function humanize(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function GameDetail() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { data: game, isLoading } = useGame(slug);
  const [tab, setTab] = useState('overview');

  const tabs: TabItem[] = [
    { id: 'overview', label: t('games:tabOverview') },
    { id: 'images', label: t('games:tabImages') },
    { id: 'releases', label: t('games:tabReleases') },
    { id: 'translations', label: t('games:tabTranslations') },
    { id: 'romhacks', label: t('games:tabRomhacks') },
    { id: 'docs', label: t('games:tabDocs') },
  ];

  if (isLoading) return <LoadingPage />;

  // Sem dados (Supabase ausente ou jogo não encontrado): ainda mostramos o
  // shell da página, com título derivado do slug, para exercitar o layout.
  const title = game?.title ?? humanize(slug ?? 'jogo');

  return (
    <div className="container">
      <div className="detail-head">
        <div className="detail-cover">
          {game?.cover_url ? (
            <img
              src={game.cover_url}
              alt={title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <Gamepad2 aria-hidden />
          )}
        </div>
        <div className="detail-info">
          <span className="kicker">// {t('entities:kindGame')}</span>
          <h1>{title}</h1>
          {game?.description && <p className="page-sub">{game.description}</p>}
          <dl className="meta-grid">
            <MetaItem label={t('games:developer')} value={game?.developer} />
            <MetaItem
              label={t('games:publisher')}
              value={game?.publishers?.join(', ')}
            />
            <MetaItem label={t('games:released')} value={game?.release_date} />
            <MetaItem label={t('games:franchise')} value={game?.franchise} />
          </dl>
          {game?.platforms && game.platforms.length > 0 && (
            <div className="tile-badges" style={{ marginTop: 'var(--s4)' }}>
              {game.platforms.map((p) => (
                <Badge key={p} tone="accent">
                  {p}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="tab-panel" role="tabpanel">
        {tab === 'overview' && game?.description ? (
          <div className="prose">
            <p>{game.description}</p>
          </div>
        ) : (
          <EmptyState title={t('common:comingSoonTitle')} text={t('common:comingSoonText')} />
        )}
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="meta-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
