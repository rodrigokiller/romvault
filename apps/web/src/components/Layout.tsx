import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Header } from './Header';
import { env } from '@/lib/env';
import '@/pages/pages.css';

/** Casca do app: cabeçalho fixo + conteúdo roteado + rodapé. */
export function Layout() {
  const { t } = useTranslation();
  return (
    <>
      <Header />
      {!env.configured && (
        <div className="config-banner" role="status">
          <span className="kicker">// {t('errors:notConfiguredTitle')}</span>
          <span>{t('errors:notConfiguredText')}</span>
        </div>
      )}
      <main className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <span className="mono">ROMVault</span>
          <span className="muted-text">
            {t('common:tagline')} · {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </>
  );
}
