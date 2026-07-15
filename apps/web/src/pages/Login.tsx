import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MailCheck } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/feedback';

export function Login() {
  const { t } = useTranslation();
  const { session, loading, disabled, signInWithEmail, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && session) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signInWithEmail(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div>
        <span className="kicker">// {t('nav:login')}</span>
        <h1 style={{ fontSize: '1.6rem', marginTop: 'var(--s2)' }}>{t('auth:loginTitle')}</h1>
        <p className="page-sub">{t('auth:loginSubtitle')}</p>
      </div>

      {disabled && (
        <div className="auth-sent" style={{ borderLeftColor: 'var(--amber)' }}>
          <span>{t('auth:notConfigured')}</span>
        </div>
      )}

      {sent ? (
        <div className="auth-sent">
          <MailCheck style={{ width: 26, height: 26, color: 'var(--accent)' }} />
          <h2 style={{ fontSize: '1.05rem' }}>{t('auth:sentTitle')}</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            {t('auth:sentText', { email })}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setSent(false)}>
            {t('auth:other')}
          </Button>
        </div>
      ) : (
        <>
          <form className="auth-form" onSubmit={submit}>
            <Field label={t('auth:email')} error={error ?? undefined}>
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  required
                  autoComplete="email"
                  placeholder={t('auth:emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={disabled}
                />
              )}
            </Field>
            <Button type="submit" variant="primary" block disabled={busy || disabled}>
              {busy ? <Spinner /> : t('auth:magic')}
            </Button>
          </form>

          <div className="auth-divider">{t('auth:or')}</div>

          <Button
            variant="secondary"
            block
            disabled={disabled}
            onClick={() => {
              setError(null);
              void signInWithGoogle().catch((err) =>
                setError(err instanceof Error ? err.message : 'Erro'),
              );
            }}
          >
            {t('auth:google')}
          </Button>
        </>
      )}
    </div>
  );
}
