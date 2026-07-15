import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User } from 'lucide-react';
import { EmptyState } from '@/components/ui/feedback';

export function Profile() {
  const { t } = useTranslation();
  const { username } = useParams<{ username: string }>();
  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t('nav:profile')}</span>
        <h1>@{username}</h1>
      </header>
      <EmptyState icon={User} title={t('common:comingSoonTitle')} text={t('profile:empty')} />
    </div>
  );
}
