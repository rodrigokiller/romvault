import { getSupabase } from '@/lib/supabase';

/**
 * functions.invoke com ERRO LEGÍVEL: quando a edge function responde não-2xx,
 * o supabase-js esconde o corpo ("Edge Function returned a non-2xx status
 * code"). Aqui lemos o JSON da resposta e devolvemos a mensagem real
 * ("Perfil privado na PSN", "Vanity URL não encontrada"...).
 */
export async function invokeFn<T = Record<string, unknown>>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke(name, { body });
  if (error) {
    // FunctionsHttpError carrega a Response original em .context
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const payload = await ctx.json() as { error?: string };
        if (payload?.error) throw new Error(payload.error);
      } catch (e) {
        if (e instanceof Error && e.message && !/json/i.test(e.message)) throw e;
      }
    }
    throw error;
  }
  const d = data as T & { error?: string };
  if (d?.error) throw new Error(d.error);
  return d;
}
