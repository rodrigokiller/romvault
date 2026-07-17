import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { KeyRound } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { useMyProfile } from '@/hooks/useProfile';

/**
 * PORTÃO DO BETA (opcional): com VITE_REQUIRE_INVITE=1, quem loga sem ter
 * resgatado convite vê esta tela até resgatar. Admins passam direto.
 * Desligado (padrão), não renderiza nada. Visitantes deslogados navegam
 * normalmente (o portão é pra CONTA, não pra leitura).
 */
export function InviteGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { session, disabled } = useAuth();
  const { data: me, isLoading, refetch } = useMyProfile();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const required = import.meta.env.VITE_REQUIRE_INVITE === '1';
  const invitedBy = (me as unknown as { invited_by?: string | null } | null)?.invited_by;
  const isAdmin = Boolean(me?.is_admin);

  const gated = required && !disabled && Boolean(session) && !isLoading && Boolean(me) && !invitedBy && !isAdmin;
  if (!gated) return <>{children}</>;

  async function redeem() {
    setBusy(true);
    try {
      const { error } = await (getSupabase() as unknown as SupabaseClient)
        .rpc('redeem_invite', { invite_code: code.trim().toUpperCase() });
      if (error) throw new Error(error.message.replace(/^.*?: /, ''));
      toast.success(t('gate:ok'));
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="gate">
        <KeyRound aria-hidden className="gate-icon" />
        <span className="kicker">// {t('gate:kicker')}</span>
        <h1>{t('gate:title')}</h1>
        <p className="page-sub">{t('gate:text')}</p>
        <div className="gate-form">
          <Input
            value={code} onChange={(e) => setCode(e.target.value)}
            placeholder="RV-XXXX-XXXX" aria-label={t('settings:inviteCode')}
            onKeyDown={(e) => { if (e.key === 'Enter' && code.trim()) void redeem(); }}
          />
          <Button variant="primary" disabled={busy || !code.trim()} onClick={() => void redeem()}>
            {busy ? <Spinner /> : t('settings:inviteRedeem')}
          </Button>
        </div>
      </div>
    </div>
  );
}
