import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Compass, Database } from 'lucide-react';
import { Button } from '@/components/ui/Button';

function Centered({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="container">
      <div className="centered">
        <Icon className="centered-icon" />
        <span className="kicker">// ROMVault</span>
        <h1 style={{ fontSize: '1.5rem' }}>{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function NotFound() {
  const { t } = useTranslation();
  return (
    <Centered icon={Compass} title={t('errors:notFoundTitle')}>
      <p>{t('errors:notFoundText')}</p>
      <Link to="/">
        <Button variant="primary">{t('errors:notFoundCta')}</Button>
      </Link>
    </Centered>
  );
}

export function AppError() {
  const { t } = useTranslation();
  return (
    <Centered icon={AlertTriangle} title={t('errors:appTitle')}>
      <p>{t('errors:appText')}</p>
      <Button variant="primary" onClick={() => window.location.reload()}>
        {t('errors:appReload')}
      </Button>
    </Centered>
  );
}

export function NotConfigured() {
  const { t } = useTranslation();
  return (
    <Centered icon={Database} title={t('errors:notConfiguredTitle')}>
      <p>{t('errors:notConfiguredText')}</p>
      <p>
        <strong>{t('errors:notConfiguredLocal')}</strong>
      </p>
      <p>
        <strong>{t('errors:notConfiguredProd')}</strong>
      </p>
    </Centered>
  );
}
