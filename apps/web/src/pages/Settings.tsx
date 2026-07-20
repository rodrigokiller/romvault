import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Key, Copy, Trash2, Plus, BookOpen, RefreshCw, Gamepad2, Trophy, Gamepad, HelpCircle, LogIn, ExternalLink, type LucideIcon } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { invokeFn } from '@/lib/invokeFn';
import { Dialog } from '@/components/ui/Dialog';
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

      {session && !disabled && <InviteSection />}
      {session && !disabled && <PrivacySection />}
      {session && !disabled && <AccountLinksSection />}
      {session && !disabled && <SyncHealthSection />}
      {session && !disabled && <ApiKeysSection />}
    </div>
  );
}

/**
 * Contas vinculadas (estilo PlayTracker): cada plataforma numa linha, com
 * status de vínculo e sync. Steam e RetroAchievements funcionam; as demais
 * são moldes honestos até termos as APIs (PSN/Xbox/Nintendo = não-oficiais).
 */
/** Redireciona pro login OpenID da Steam (volta pra /settings com os params). */
function steamLoginRedirect() {
  const q = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': `${window.location.origin}/settings`,
    'openid.realm': window.location.origin,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  window.location.href = `https://steamcommunity.com/openid/login?${q.toString()}`;
}

/**
 * Saúde do sync POR CONTA: jogos trazidos, quantos casaram com o IGDB e
 * quantos ficaram sem vínculo — tira a sensação de caixa-preta do sync.
 */
function SyncHealthSection() {
  const { t } = useTranslation();
  const { data: me } = useMyProfile();
  const { data: rows = [] } = useQuery({
    queryKey: ['syncHealth', me?.id],
    enabled: env.configured && Boolean(me?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const sb = getSupabase() as unknown as SupabaseClient;
      // jogos sincronizados do usuário + se o jogo tem igdb_id (embed)
      const { data } = await sb.from('game_sync_data')
        .select('provider, game:games(igdb_id)')
        .eq('user_id', me!.id)
        .range(0, 9999);
      const agg = new Map<string, { total: number; matched: number }>();
      for (const r of (data ?? []) as unknown as { provider: string; game: { igdb_id: number | null } | null }[]) {
        const a = agg.get(r.provider) ?? { total: 0, matched: 0 };
        a.total += 1;
        if (r.game?.igdb_id != null) a.matched += 1;
        agg.set(r.provider, a);
      }
      return [...agg.entries()].map(([provider, a]) => ({ provider, ...a, unmatched: a.total - a.matched }));
    },
  });
  if (rows.length === 0) return null;
  return (
    <Card className="settings-section" style={{ marginTop: 'var(--s5)' }}>
      <div>
        <div className="card-title">{t('settings:syncHealthTitle')}</div>
        <div className="card-sub">{t('settings:syncHealthHint')}</div>
      </div>
      <ul className="integ-list">
        {rows.map((r) => {
          const pct = r.total > 0 ? Math.round((r.matched / r.total) * 100) : 0;
          return (
            <li key={r.provider} className={`integ-item mono ${r.unmatched > 0 ? 'integ-stale' : ''}`}>
              <span className="integ-name">{r.provider === 'retroachievements' ? 'RA' : r.provider}</span>
              <span className="integ-meta" style={{ flex: 1 }}>
                {t('settings:syncHealthLine', { matched: r.matched, total: r.total, pct })}
              </span>
              {r.unmatched > 0 && (
                <span className="integ-state integ-stale">{t('settings:syncHealthUnmatched', { count: r.unmatched })}</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="field-hint">{t('settings:syncHealthFoot')}</p>
    </Card>
  );
}

function AccountLinksSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const link = useLinkAccount();
  const { data: accounts = [] } = useMyAccounts();
  const linked = (p: Provider) => accounts.find((a) => a.provider === p);
  const [openidBusy, setOpenidBusy] = useState(false);

  // volta do "Entrar com a Steam": verifica a assinatura e sincroniza sozinho
  useEffect(() => {
    const search = window.location.search;
    if (!search.includes('openid.mode=id_res') || openidBusy) return;
    setOpenidBusy(true);
    window.history.replaceState({}, '', '/settings'); // limpa a URL feia
    toast.success(t('settings:steamVerifying'));
    (async () => {
      try {
        const { steamid } = await invokeFn<{ steamid: string }>('steam-openid', { query: search });
        const d = await invokeFn<{ steam_games?: number; tracks_added?: number; games_created?: number }>(
          'steam-import', { steamid },
        );
        await link.mutateAsync({ provider: 'steam', accountId: steamid, synced: true });
        toast.success(t('settings:steamDone', {
          games: d?.steam_games ?? 0, tracks: d?.tracks_added ?? 0, created: d?.games_created ?? 0,
        }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('forms:submitError'));
      } finally {
        setOpenidBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card className="settings-section" style={{ marginTop: 'var(--s5)' }}>
      <div>
        <div className="card-title">{t('settings:accountsTitle')}</div>
        <div className="card-sub">{t('settings:accountsHint')}</div>
      </div>
      <SyncAccountRow
        provider="steam"
        icon={Gamepad2}
        title="Steam"
        hint={t('settings:steamIdHint')}
        placeholder="76561198... ou vanity"
        linked={linked('steam')}
        help={{
          steps: [t('settings:help_steam_1'), t('settings:help_steam_2'), t('settings:help_steam_3')],
          links: [
            { label: 'store.steampowered.com/account', url: 'https://store.steampowered.com/account/' },
            { label: t('settings:help_steam_privacy'), url: 'https://steamcommunity.com/my/edit/settings' },
          ],
        }}
        extra={
          <Button variant="secondary" size="sm" onClick={steamLoginRedirect}>
            <LogIn /> {t('settings:steamLogin')}
          </Button>
        }
        invoke={async (id) => {
          const d = await invokeFn<{ steam_games?: number; tracks_added?: number; games_created?: number }>(
            'steam-import', { steamid: id },
          );
          return t('settings:steamDone', {
            games: d?.steam_games ?? 0, tracks: d?.tracks_added ?? 0, created: d?.games_created ?? 0,
          });
        }}
      />
      <SyncAccountRow
        provider="retroachievements"
        icon={Trophy}
        title="RetroAchievements"
        hint={t('settings:raHint')}
        placeholder={t('settings:raUserPh')}
        linked={linked('retroachievements')}
        help={{
          steps: [t('settings:help_ra_1'), t('settings:help_ra_2')],
          links: [{ label: 'retroachievements.org', url: 'https://retroachievements.org/' }],
        }}
        invoke={async (id) => {
          const d = await invokeFn<{ ra_games?: number; matched?: number; tracks_added?: number; note?: string; unmatched?: number; sample_misses?: string[] }>(
            'ra-import', { ra_user: id },
          );
          return {
            message: d?.note ?? t('settings:raDone', {
              total: d?.ra_games ?? 0, matched: d?.matched ?? 0, tracks: d?.tracks_added ?? 0,
            }),
            unmatched: d?.unmatched, misses: d?.sample_misses,
          };
        }}
      />
      <SyncAccountRow
        provider="psn"
        icon={Gamepad}
        title="PlayStation"
        hint={t('settings:psnHint')}
        placeholder={t('settings:psnUserPh')}
        linked={linked('psn')}
        help={{
          steps: [t('settings:help_psn_1'), t('settings:help_psn_2')],
          links: [{ label: t('settings:help_psn_privacy'), url: 'https://www.playstation.com/acct/privacy' }],
        }}
        invoke={async (id) => {
          const d = await invokeFn<{ psn_games?: number; matched?: number; tracks_added?: number; note?: string; unmatched?: number; sample_misses?: string[] }>(
            'psn-import', { psn_user: id },
          );
          return {
            message: d?.note ?? t('settings:psnDone', {
              total: d?.psn_games ?? 0, matched: d?.matched ?? 0, tracks: d?.tracks_added ?? 0,
            }),
            unmatched: d?.unmatched, misses: d?.sample_misses,
          };
        }}
      />
      <SyncAccountRow
        provider="xbox"
        icon={Gamepad2}
        title="Xbox"
        hint={t('settings:xboxHint')}
        placeholder={t('settings:xboxUserPh')}
        linked={linked('xbox')}
        help={{
          steps: [t('settings:help_xbox_1'), t('settings:help_xbox_2')],
          links: [{ label: 'xbox.com', url: 'https://www.xbox.com/' }],
        }}
        invoke={async (id) => {
          const d = await invokeFn<{ xbox_games?: number; matched?: number; tracks_added?: number; note?: string; unmatched?: number; sample_misses?: string[] }>(
            'xbox-import', { gamertag: id },
          );
          return {
            message: d?.note ?? t('settings:xboxDone', {
              total: d?.xbox_games ?? 0, matched: d?.matched ?? 0, tracks: d?.tracks_added ?? 0,
            }),
            unmatched: d?.unmatched, misses: d?.sample_misses,
          };
        }}
      />
      <SyncAccountRow
        provider="gog"
        icon={Gamepad}
        title="GOG"
        hint={t('settings:gogHint')}
        placeholder={t('settings:gogUserPh')}
        linked={linked('gog')}
        help={{
          steps: [t('settings:help_gog_1'), t('settings:help_gog_2')],
          links: [{ label: t('settings:help_gog_privacy'), url: 'https://www.gog.com/account/settings/privacy' }],
        }}
        invoke={async (id) => {
          const d = await invokeFn<{ gog_games?: number; matched?: number; tracks_added?: number; note?: string; unmatched?: number; sample_misses?: string[] }>(
            'gog-import', { gog_user: id },
          );
          return {
            message: d?.note ?? t('settings:gogDone', {
              total: d?.gog_games ?? 0, matched: d?.matched ?? 0, tracks: d?.tracks_added ?? 0,
            }),
            unmatched: d?.unmatched, misses: d?.sample_misses,
          };
        }}
      />
      <SyncAccountRow
        provider="nintendo"
        icon={Gamepad2}
        title="Nintendo"
        beta
        hint={t('settings:nintendoHint')}
        placeholder="SW-1234-5678-9012"
        linked={linked('nintendo')}
        help={{
          steps: [t('settings:help_nintendo_1'), t('settings:help_nintendo_2'), t('settings:help_nintendo_3')],
          links: [],
        }}
        invoke={async (id) => {
          const d = await invokeFn<{ pending?: boolean; message?: string; nsa_id?: string; accumulated?: string }>(
            'nintendo-import', { friend_code: id },
          );
          return {
            message: d?.pending ? (d.message ?? '') : t('settings:nintendoDone', { game: d?.accumulated ?? '?' }),
            accountId: d?.nsa_id,
          };
        }}
      />
      {(['Epic', 'EA', 'Battle.net', 'Riot', 'Ubisoft'] as const).map((name) => (
        <div key={name} className="account-row account-row-soon">
          <div className="account-row-head">
            <span className="account-name">
              <Gamepad2 aria-hidden className="account-icon" />
              {name}
            </span>
            <span className="chip">{t('settings:accountsSoon')}</span>
          </div>
        </div>
      ))}
    </Card>
  );
}

/** Linha de provedor FUNCIONAL: input + sync + ajuda + estado do vínculo. */
function SyncAccountRow({
  provider, icon: Icon, title, hint, placeholder, linked, invoke, beta = false, help, extra,
}: {
  provider: Provider;
  icon: LucideIcon;
  title: string;
  hint: string;
  placeholder: string;
  linked?: LinkedAccount;
  /** retorna a mensagem de sucesso; accountId opcional sobrepõe o input no
   *  vínculo (ex.: nsaId da Nintendo); misses = jogos sem vínculo no catálogo */
  invoke: (accountId: string) => Promise<string | { message: string; accountId?: string; misses?: string[]; unmatched?: number }>;
  beta?: boolean;
  /** tutorial inline (modal): passos + links diretos (estilo PlayTracker) */
  help?: { steps: string[]; links: { label: string; url: string }[] };
  /** ação extra ao lado do sync (ex.: Entrar com a Steam) */
  extra?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const link = useLinkAccount();
  const unlink = useUnlinkAccount();
  const [value, setValue] = useState(linked?.account_id ?? '');
  const [touched, setTouched] = useState(false);
  const [running, setRunning] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // retorno do último sync: jogos que NÃO casaram com o catálogo (visíveis,
  // não escondidos num toast que some)
  const [lastMisses, setLastMisses] = useState<{ total: number; sample: string[] } | null>(null);

  // contas chegam async: preenche o input quando o vínculo carregar
  useEffect(() => {
    if (!touched && linked?.account_id) setValue(linked.account_id);
  }, [linked?.account_id, touched]);

  // cooldown anti-spam: re-sync manual só depois de 30min (o cron cobre o resto)
  const COOLDOWN_MS = 30 * 60_000;
  const sinceSync = linked?.last_sync ? Date.now() - new Date(linked.last_sync).getTime() : Infinity;
  const cooling = Boolean(linked) && sinceSync < COOLDOWN_MS;
  const coolMin = cooling ? Math.ceil((COOLDOWN_MS - sinceSync) / 60_000) : 0;

  async function run() {
    const id = value.trim();
    if (!id) return;
    setRunning(true);
    try {
      const result = await invoke(id);
      const msg = typeof result === 'string' ? result : result.message;
      const accountId = typeof result === 'string' ? id : (result.accountId ?? id);
      if (typeof result !== 'string' && (result.unmatched ?? 0) > 0) {
        setLastMisses({ total: result.unmatched ?? 0, sample: result.misses ?? [] });
      } else {
        setLastMisses(null);
      }
      await link.mutateAsync({ provider, accountId, synced: true });
      toast.success(msg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      const notDeployed = /failed to send|fetch|networkerror/i.test(msg);
      toast.error(notDeployed ? t('settings:fnNotDeployed', { fn: `${provider}-import` }) : (msg || t('forms:submitError')));
    } finally {
      setRunning(false);
    }
  }

  async function doUnlink() {
    try {
      await unlink.mutateAsync(provider);
      setTouched(false);
      setValue('');
    } catch {
      toast.error(t('forms:submitError'));
    }
  }

  return (
    <div className="account-row">
      <div className="account-row-head">
        <span className="account-name">
          <Icon aria-hidden className="account-icon" />{title}
          {beta && <span className="chip" style={{ marginLeft: 'var(--s2)' }}>beta</span>}
          {help && (
            <button
              type="button" className="account-help" title={t('settings:accountsHelp')}
              onClick={() => setHelpOpen(true)}
            >
              <HelpCircle aria-hidden />
            </button>
          )}
        </span>
        {running ? (
          <span className="account-status mono account-status-busy">
            <Spinner /> {t('settings:accountsSyncing')}
          </span>
        ) : linked ? (
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
          {(id) => (
            <span className={provider === 'nintendo' ? 'input-prefixed' : undefined}>
              {provider === 'nintendo' && <span className="input-prefix mono">SW-</span>}
              <Input
                id={id} value={value}
                onChange={(e) => { setTouched(true); setValue(e.target.value); }}
                placeholder={provider === 'nintendo' ? '1234-5678-9012' : placeholder}
                disabled={running || Boolean(linked)}
              />
            </span>
          )}
        </Field>
        <Button
          variant="primary"
          onClick={() => void run()}
          disabled={running || !value.trim() || cooling}
          title={cooling ? t('settings:accountsCooldown', { min: coolMin }) : undefined}
        >
          {running
            ? <Spinner />
            : <><RefreshCw /> {linked ? t('settings:accountsSync') : t('settings:accountsLinkBtn')}</>}
        </Button>
        {extra}
        {linked && (
          <Button variant="ghost" disabled={running} onClick={() => void doUnlink()}>
            <Trash2 /> {t('settings:accountsUnlink')}
          </Button>
        )}
      </div>
      {cooling && (
        <span className="field-hint">{t('settings:accountsCooldown', { min: coolMin })}</span>
      )}
      {lastMisses && (
        <details className="sync-misses">
          <summary className="mono">{t('settings:syncMisses', { count: lastMisses.total })}</summary>
          <ul>
            {lastMisses.sample.map((m) => <li key={m} className="mono">{m}</li>)}
            {lastMisses.total > lastMisses.sample.length && (
              <li className="mono muted-text">… +{lastMisses.total - lastMisses.sample.length}</li>
            )}
          </ul>
          <p className="field-hint">{t('settings:syncMissesHint')}</p>
        </details>
      )}
      {helpOpen && help && (
        <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title={`${title} — ${t('settings:accountsHelp')}`}>
          <ol className="help-steps">
            {help.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          {help.links.length > 0 && (
            <div className="help-links">
              {help.links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="section-link">
                  <ExternalLink aria-hidden style={{ width: 13, height: 13, verticalAlign: '-2px', marginRight: 4 }} />
                  {l.label}
                </a>
              ))}
            </div>
          )}
          {linked && (
            <p className="field-hint">
              {t('settings:accountsLinked', { id: linked.account_id })}
              {linked.last_sync ? ` · ${t('settings:helpLastSync')} ${new Date(linked.last_sync).toLocaleString()}` : ''}
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}

/** Resgate de convite: grava o padrinho no perfil ("convidado por @x"). */
function InviteSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: me, refetch } = useMyProfile();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const invitedBy = (me as unknown as { invited_by?: string | null } | null)?.invited_by;
  if (invitedBy) return null; // já resgatou: nada a mostrar aqui

  async function redeem() {
    setBusy(true);
    try {
      const { data, error } = await (getSupabase() as unknown as SupabaseClient)
        .rpc('redeem_invite', { invite_code: code.trim().toUpperCase() });
      if (error) throw new Error(error.message.replace(/^.*?: /, ''));
      toast.success(t('settings:inviteRedeemed', { user: String(data ?? '') }));
      setCode('');
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="settings-section" style={{ marginTop: 'var(--s5)' }}>
      <div>
        <div className="card-title">{t('settings:inviteTitle')}</div>
        <div className="card-sub">{t('settings:inviteHint')}</div>
      </div>
      <div className="api-create">
        <Field label={t('settings:inviteCode')}>
          {(id) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value)} placeholder="RV-XXXX-XXXX" />}
        </Field>
        <Button variant="primary" disabled={busy || !code.trim()} onClick={() => void redeem()}>
          {busy ? <Spinner /> : t('settings:inviteRedeem')}
        </Button>
      </div>
    </Card>
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
  const showAdult = (me as unknown as { show_adult?: boolean } | null)?.show_adult ?? false;

  async function setAdult(value: boolean) {
    try {
      await update.mutateAsync({ show_adult: value });
      toast.success(t('settings:privacySaved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

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
          {t('settings:adultLabel')}
        </span>
        <div style={{ minWidth: 200 }}>
          <Select
            value={showAdult ? 'show' : 'hide'}
            onChange={(e) => void setAdult(e.target.value === 'show')}
            disabled={update.isPending}
            aria-label={t('settings:adultLabel')}
          >
            <option value="hide">{t('settings:adultHide')}</option>
            <option value="show">{t('settings:adultShow')}</option>
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
