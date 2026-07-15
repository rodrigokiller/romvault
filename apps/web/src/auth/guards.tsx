import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { LoadingPage } from '@/components/ui/feedback';

/**
 * Exige sessão para rotas de escrita.
 *
 * Regra de scaffold: quando o Supabase NÃO está configurado (`disabled`), não
 * há backend para autenticar, então liberamos a rota — assim o alicerce roda e
 * é demonstrável sem env. Com o Supabase ativo e SEM sessão, redireciona para
 * /login. O gating "de verdade" passa a valer assim que houver backend.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, disabled } = useAuth();
  const location = useLocation();
  if (disabled) return <>{children}</>;
  if (loading) return <LoadingPage />;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}
