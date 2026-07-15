import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { LoadingPage } from '@/components/ui/feedback';

/**
 * O Supabase lê a sessão da URL automaticamente (detectSessionInUrl).
 * Aqui só esperamos o estado de auth assentar e então roteamos.
 */
export function AuthCallback() {
  const { t } = useTranslation();
  const { loading, session, disabled } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (disabled) {
      navigate('/login', { replace: true });
      return;
    }
    if (!loading) navigate(session ? '/' : '/login', { replace: true });
  }, [loading, session, disabled, navigate]);

  return <LoadingPage label={t('auth:callbackEntering')} />;
}
