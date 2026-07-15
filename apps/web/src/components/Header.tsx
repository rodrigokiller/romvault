import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Settings, LogIn, LogOut, User as UserIcon, Shield, Upload } from 'lucide-react';
import { Logo } from './Logo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SearchBox } from './SearchBox';
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
            <NavLink to="/" end className="header-link">
              {t('nav:home')}
            </NavLink>
            <NavLink to="/games" className="header-link">
              {t('nav:browse')}
            </NavLink>
            <NavLink to="/submit" className="header-link">
              {t('nav:submit')}
            </NavLink>
            <NavLink to="/users" className="header-link">
              {t('nav:community')}
            </NavLink>
          </nav>
        </div>

        <SearchBox variant="header" />

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
          <Link
            to="/submit"
            className="header-icon-btn header-icon-btn-mobile"
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
