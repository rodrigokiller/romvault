import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Settings, LogIn, LogOut, User as UserIcon, Shield, Upload, Search } from 'lucide-react';
import { Logo } from './Logo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { openPalette } from './CommandPalette';
import { useAuth } from '@/auth/AuthProvider';
import { useIsAdmin } from '@/hooks/useProfile';
import './header.css';

/** Cabeçalho reutilizável, presente em todas as páginas. */
export function Header() {
  const { t } = useTranslation();
  const { session, user, signOut } = useAuth();
  const isAdmin = useIsAdmin();

  const username =
    (user?.user_metadata?.username as string | undefined) ??
    user?.email?.split('@')[0] ??
    'perfil';

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div className="header-left">
          <Link to="/" className="header-brand">
            <Logo />
          </Link>
          <nav className="header-nav" aria-label="Principal">
            <NavLink to="/games" className="header-link">
              {t('nav:games')}
            </NavLink>
            <NavLink to="/translations" className="header-link">
              {t('nav:translations')}
            </NavLink>
            <NavLink to="/romhacks" className="header-link">
              {t('nav:romhacks')}
            </NavLink>
            <NavLink to="/tools" className="header-link">
              {t('nav:tools')}
            </NavLink>
            <NavLink to="/docs" className="header-link">
              {t('nav:docs')}
            </NavLink>
            <NavLink to="/users" className="header-link">
              {t('nav:community')}
            </NavLink>
            {session && (
              <NavLink to={`/u/${username}/library`} className="header-link header-link-shelf">
                {t('nav:myShelf')}
              </NavLink>
            )}
          </nav>
        </div>

        {/* busca compacta: abre a command palette (Ctrl+K) sem disputar espaço com a nav */}
        <button type="button" className="header-search-btn" onClick={openPalette}>
          <Search aria-hidden />
          <span className="header-search-btn-label">{t('common:searchPlaceholder')}</span>
          <kbd className="header-search-kbd">Ctrl K</kbd>
        </button>

        <div className="header-right">
          <LanguageSwitcher />
          {isAdmin && (
            <Link
              to="/admin"
              className="header-icon-btn"
              aria-label={t('nav:admin')}
              title={t('nav:admin')}
            >
              <Shield aria-hidden />
            </Link>
          )}
          {/* Enviar saiu da nav (catálogo ocupou o espaço) — ícone sempre visível */}
          <Link
            to="/submit"
            className="header-icon-btn"
            aria-label={t('nav:submit')}
            title={t('nav:submit')}
          >
            <Upload aria-hidden />
          </Link>
          <Link
            to="/settings"
            className="header-icon-btn"
            aria-label={t('nav:settings')}
            title={t('nav:settings')}
          >
            <Settings aria-hidden />
          </Link>
          {session ? (
            <>
              <Link to={`/u/${username}`} className="header-user" title={t('nav:profile')}>
                <UserIcon aria-hidden />
                <span className="header-user-name">{username}</span>
              </Link>
              <button
                type="button"
                className="header-icon-btn"
                onClick={() => void signOut()}
                aria-label={t('nav:logout')}
                title={t('nav:logout')}
              >
                <LogOut aria-hidden />
              </button>
            </>
          ) : (
            <Link to="/login" className="header-login">
              <LogIn aria-hidden />
              <span>{t('nav:login')}</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
