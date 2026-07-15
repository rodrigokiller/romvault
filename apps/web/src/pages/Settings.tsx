import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/auth/AuthProvider';
import { SUPPORTED_LANGS } from '@/i18n/config';

export function Settings() {
  const { t, i18n } = useTranslation();
  const { session, user, disabled } = useAuth();

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t('nav:settings')}</span>
        <h1>{t('settings:title')}</h1>
        <p className="page-sub">{t('settings:subtitle')}</p>
      </header>

      <Card className="settings-section">
        <div>
          <div className="card-title">{t('settings:sectionLanguage')}</div>
          <div className="card-sub">{t('settings:sectionLanguageHint')}</div>
        </div>
        <div className="setting-row">
          <span className="mono" style={{ color: 'var(--muted)' }}>
            {t('nav:language')}
          </span>
          <div style={{ minWidth: 200 }}>
            <Select
              value={SUPPORTED_LANGS.find((l) => i18n.language?.startsWith(l.code.slice(0, 2)))?.code ?? 'pt-BR'}
              onChange={(e) => void i18n.changeLanguage(e.target.value)}
              aria-label={t('nav:language')}
            >
              {SUPPORTED_LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <Card className="settings-section" style={{ marginTop: 'var(--s5)' }}>
        <div>
          <div className="card-title">{t('settings:sectionAppearance')}</div>
          <div className="card-sub">{t('settings:sectionAppearanceHint')}</div>
        </div>
        <div className="setting-row">
          <span className="mono" style={{ color: 'var(--muted)' }}>
            theme
          </span>
          <div style={{ minWidth: 200 }}>
            <Select value="dark" disabled aria-label="theme">
              <option value="dark">{t('settings:themeDark')}</option>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="settings-section" style={{ marginTop: 'var(--s5)' }}>
        <div>
          <div className="card-title">{t('settings:sectionAccount')}</div>
        </div>
        {session && !disabled ? (
          <div className="setting-row">
            <div>
              <div className="card-sub">{t('settings:signedInAs')}</div>
              <div className="mono" style={{ color: 'var(--ink-bright)' }}>
                {user?.email}
              </div>
            </div>
          </div>
        ) : (
          <div className="setting-row">
            <span className="card-sub">{t('settings:signedOut')}</span>
            <Link to="/login">
              <Button variant="primary" size="sm">
                {t('settings:signInCta')}
              </Button>
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
