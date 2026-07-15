import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';

interface AuthCtx {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** true quando o Supabase não está configurado (auth desativada, app roda). */
  disabled: boolean;
  signInWithEmail: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

const NOT_CONFIGURED = new Error(
  'Supabase não configurado — autenticação indisponível.',
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // Sem env não há sessão a carregar: começa já resolvido.
  const [loading, setLoading] = useState(env.configured);

  useEffect(() => {
    if (!env.configured) return;
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthCtx>(() => {
    const redirectTo = `${window.location.origin}/auth/callback`;
    return {
      session,
      user: session?.user ?? null,
      loading,
      disabled: !env.configured,
      signInWithEmail: async (email) => {
        if (!env.configured) throw NOT_CONFIGURED;
        const { error } = await getSupabase().auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
      },
      signInWithGoogle: async () => {
        if (!env.configured) throw NOT_CONFIGURED;
        const { error } = await getSupabase().auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo },
        });
        if (error) throw error;
      },
      signOut: async () => {
        if (!env.configured) return;
        await getSupabase().auth.signOut();
      },
    };
  }, [session, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
