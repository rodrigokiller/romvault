import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Key, Copy, Trash2, Plus, BookOpen, RefreshCw } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { Spinner } from '@/components/ui/feedback';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/hooks/useApiKeys';
import { useMyProfile, useUpdateProfile } from '@/hooks/useProfile';
import { useMyAccounts, useLinkAccount, useUnlinkAccount, type Provider, type LinkedAccount } from '@/hooks/useAccounts';
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

      {session && !disabled && <PrivacySection />}
      {session && !disabled && <AccountLinksSection />}
      {session && !disabled && <ApiKeysSection />}
    </div>
  );
}

/**
 * Contas vinculadas (estilo PlayTracker): cada plataforma numa linha, com
 * status de vínculo e sync. Steam e RetroAchievements funcionam; as demais
 * são moldes honestos até termos as APIs (PSN/Xbox/Nintendo = não-oficiais).
 */
function AccountLinksSection() {
  const { t } = useTranslation();
  const { data: accounts = [] } = useMyAccounts();
  const linked = (p: Provider) => accounts.find((a) => a.provider === p);

  return (
    <Card className="settings-section" style={{ marginTop: 'var(--s5)' }}>
      <div>
        <div className="card-title">{t('settings:accountsTitle')}</div>
        <div className="card-sub">{t('settings:accountsHint')}</div>
      </div>
      <SyncAccountRow
        provider="steam"
        title="Steam"
        hint={t('settings:steamIdHint')}
        placeholder="76561198... ou vanity"
        linked={linked('steam')}
        invoke={async (id) => {
          const { data, error } = await getSupabase().functions.invoke('steam-import', { body: { steamid: id } });
          if (error) throw error;
          const d = data as { error?: string; steam_games?: number; tracks_added?: number; games_created?: number };
          if (d?.error) throw new Error(d.error);
          return t('settings:steamDone', {
            games: d?.steam_games ?? 0, tracks: d?.tracks_added ?? 0, created: d?.games_created ?? 0,
          });
        }}
      />
      <SyncAccountRow
        provider="retroachievements"
        title="RetroAchievements"
        hint={t('settings:raHint')}
        placeholder={t('settings:raUserPh')}
        linked={linked('retroachievements')}
        invoke={async (id) => {
          const { data, error } = await getSupabase().functions.invoke('ra-import', { body: { ra_user: id } });
          if (error) throw error;
          const d = data as { error?: string; ra_games?: number; matched?: number; tracks_added?: number; tracks_updated?: number };
          if (d?.error) throw new Error(d.error);
          return t('settings:raDone', {
            total: d?.ra_games ?? 0, matched: d?.matched ?? 0, tracks: d?.tracks_added ?? 0,
          });
        }}
      />
      <SyncAccountRow
        provider="psn"
        title="PlayStation"
        hint={t('settings:psnHint')}
        placeholder={t('settings:psnUserPh')}
        linked={linked('psn')}
        invoke={async (id) => {
          const { data, error } = await getSupabase().functions.invoke('psn-import', { body: { psn_user: id } });
          if (error) throw error;
          const d = data as { error?: string; psn_games?: number; matched?: number; tracks_added?: number };
          if (d?.error) throw new Error(d.error);
          return t('settings:psnDone', {
            total: d?.psn_games ?? 0, matched: d?.matched ?? 0, tracks: d?.tracks_added ?? 0,
          });
        }}
      />
      {(['xbox', 'nintendo', 'gog', 'epic'] as const).map((p) => (
        <div key={p} className="account-row account-row-soon">
          <div className="account-row-head">
            <span className="account-name">{{ xbox: 'Xbox', nintendo: 'Nintendo', gog: 'GOG', epic: 'Epic' }[p]}</span>
            <span className="chip">{t('settings:accountsSoon')}</span>
          </div>
        </div>
      ))}
    </Card>
  );
}

/** Linha de provedor FUNCIONAL: input + sync + estado do vínculo. */
function SyncAccountRow({
  provider, title, hint, placeholder, linked, invoke,
}: {
  provider: Provider;
  title: string;
  hint: string;
  placeholder: string;
  linked?: LinkedAccount;
  invoke: (accountId: string) => Promise<string>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const link = useLinkAccount();
  const unlink = useUnlinkAccount();
  const [value, setValue] = useState(linked?.account_id ?? '');
  const [touched, setTouched] = useState(false);
  const [running, setRunning] = useState(false);

  // contas chegam async: preenche o input quando o vínculo carregar
  useEffect(() => {
    if (!touched && linked?.account_id) setValue(linked.account_id);
  }, [linked?.account_id, touched]);

  async function run() {
    const id = value.trim();
    if (!id) return;
    setRunning(true);
    try {
      const msg = await invoke(id);
      await link.mutateAsync({ provider, accountId: id, synced: true });
      toast.success(msg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      const notDeployed = /failed to send|fetch|networkerror/i.test(msg);
      toast.error(notDeployed ? t('settings:fnNotDeployed', { fn: `${provider}-import` }) : (msg || t('forms:submitError')));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="account-row">
      <div className="account-row-head">
        <span className="account-name">{title}</span>
        {linked ? (
          <span className="account-status mono">
            {t('settings:accountsLinked', { id: linked.account_id })}
            {linked.last_sync ? ` · ${new Date(linked.last_sync).toLocaleDateString()}` : ''}
          </span>
        ) : (
          <span className="account-status mono account-status-off">{t('settings:accountsNotLinked')}</span>
        )}
      </div>
      <div className="api-create">
        <Field label={title} hint={hint}>
          {(id) => <Input id={id} value={value} onChange={(e) => { setTouched(true); setValue(e.target.value); }} placeholder={placeholder} />}
        </Field>
        <Button variant="primary" onClick={() => void run()} disabled={running || !value.trim()}>
          {running ? <Spinner /> : <><RefreshCw /> {t('settings:accountsSync')}</>}
        </Button>
        {linked && (
          <Button variant="ghost" onClick={() => void unlink.mutateAsync(provider).catch(() => toast.error(t('forms:submitError')))}>
            <Trash2 /> {t('settings:accountsUnlink')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Privacidade: biblioteca + vitrine + zeradas públicas ou só pra você. */
function PrivacySection() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: me } = useMyProfile();
  const update = useUpdateProfile();
  const isPublic = (me as unknown as { library_public?: boolean } | null)?.library_public ?? true;
  const emailDigest = (me as unknown as { email_digest?: boolean } | null)?.email_digest ?? false;

  async function setPublic(value: boolean) {
    try {
      await update.mutateAsync({ library_public: value });
      toast.success(t('settings:privacySaved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

  async function setDigest(value: boolean) {
    try {
      await update.mutateAsync({ email_digest: value });
      toast.success(t('settings:privacySaved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

  return (
    <Card className="settings-section" style={{ marginTop: 'var(--s5)' }}>
      <div>
        <div className="card-title">{t('settings:sectionPrivacy')}</div>
        <div className="card-sub">{t('settings:sectionPrivacyHint')}</div>
      </div>
      <div className="setting-row">
        <span className="mono" style={{ color: 'var(--muted)' }}>
          {t('settings:privacyLabel')}
        </span>
        <div style={{ minWidth: 200 }}>
          <Select
            value={isPublic ? 'public' : 'private'}
            onChange={(e) => void setPublic(e.target.value === 'public')}
            disabled={update.isPending}
            aria-label={t('settings:privacyLabel')}
          >
            <option value="public">{t('settings:privacyPublic')}</option>
            <option value="private">{t('settings:privacyPrivate')}</option>
          </Select>
        </div>
      </div>
      <div className="setting-row">
        <span className="mono" style={{ color: 'var(--muted)' }}>
          {t('settings:emailDigestLabel')}
        </span>
        <div style={{ minWidth: 200 }}>
          <Select
            value={emailDigest ? 'on' : 'off'}
            onChange={(e) => void setDigest(e.target.value === 'on')}
            disabled={update.isPending}
            aria-label={t('settings:emailDigestLabel')}
          >
            <option value="off">{t('settings:emailDigestOff')}</option>
            <option value="on">{t('settings:emailDigestOn')}</option>
          </Select>
        </div>
      </div>
    </Card>
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
