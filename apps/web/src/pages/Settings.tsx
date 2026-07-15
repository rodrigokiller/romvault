import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Key, Copy, Trash2, Plus, BookOpen } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/hooks/useApiKeys';
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

      {session && !disabled && <ApiKeysSection />}
    </div>
  );
}

/** Gerenciamento de API keys do usuário (hash no cliente; texto plano só 1x). */
function ApiKeysSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: keys = [] } = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);

  async function onCreate() {
    try {
      const key = await create.mutateAsync(name);
      setFresh(key);
      setName('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('settings:apiCopied'));
    } catch {
      toast.error(t('forms:submitError'));
    }
  }

  return (
    <Card className="settings-section" style={{ marginTop: 'var(--s5)' }}>
      <div>
        <div className="card-title">{t('settings:apiTitle')}</div>
        <div className="card-sub">{t('settings:apiHint')}</div>
      </div>

      {fresh && (
        <div className="api-fresh">
          <span className="card-sub">{t('settings:apiCreated')}</span>
          <div className="api-fresh-row">
            <code className="api-key-plain">{fresh}</code>
            <Button size="sm" variant="secondary" onClick={() => void copy(fresh)}>
              <Copy /> {t('settings:apiCopy')}
            </Button>
          </div>
        </div>
      )}

      <div className="api-create">
        <Field label={t('settings:apiName')}>
          {(id) => (
            <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('settings:apiNamePh')} />
          )}
        </Field>
        <Button variant="primary" onClick={() => void onCreate()} disabled={create.isPending}>
          <Plus /> {t('settings:apiCreate')}
        </Button>
      </div>

      {keys.length > 0 && (
        <div className="api-list">
          {keys.map((k) => (
            <div key={k.id} className="api-row">
              <Key aria-hidden className="api-row-icon" />
              <div className="api-row-body">
                <span className="api-row-name">{k.name}</span>
                <span className="api-row-meta mono">
                  {k.key_prefix}…· {k.usage_count} {t('settings:apiUsed')}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { if (window.confirm(t('settings:apiRevokeConfirm'))) void revoke.mutate(k.id); }}
              >
                <Trash2 /> {t('settings:apiRevoke')}
              </Button>
            </div>
          ))}
        </div>
      )}

      <Link to="/api" className="section-link">
        <BookOpen aria-hidden style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 4 }} />
        {t('settings:apiDocsLink')}
      </Link>
    </Card>
  );
}
