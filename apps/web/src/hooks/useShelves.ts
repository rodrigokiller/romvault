import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useAuth } from '@/auth/AuthProvider';

const db = () => getSupabase() as unknown as SupabaseClient;

/**
 * Ordem manual das views da vitrine, persistida em shelves/shelf_items.
 * view = 'all' usa a estante especial kind='custom' name='TODOS';
 * view = plataforma usa kind='platform' platform=<view>.
 */
function shelfQuery(userId: string, view: string) {
  const q = db().from('shelves').select('id').eq('user_id', userId);
  return view === 'all'
    ? q.eq('kind', 'custom').eq('name', 'TODOS')
    : q.eq('kind', 'platform').eq('platform', view);
}

/** Ordem salva (lista de game_ids) de uma view da vitrine de um usuário. */
export function useShelfOrder(userId: string | undefined, view: string) {
  return useQuery({
    queryKey: ['shelfOrder', userId, view],
    enabled: env.configured && Boolean(userId),
    queryFn: async (): Promise<string[]> => {
      const { data: shelf, error } = await shelfQuery(userId as string, view).maybeSingle();
      if (error) throw error;
      if (!shelf) return [];
      const { data: items, error: e2 } = await db()
        .from('shelf_items').select('game_id, position')
        .eq('shelf_id', shelf.id)
        .order('position', { ascending: true })
        .range(0, 4999);
      if (e2) throw e2;
      return (items ?? []).map((i) => i.game_id as string);
    },
  });
}

/** Salva a ordem manual de uma view (cria a estante na 1ª vez). */
export function useSaveShelfOrder(view: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (gameIds: string[]) => {
      const uid = user?.id;
      if (!uid) throw new Error('Não autenticado.');
      const { data: existing, error } = await shelfQuery(uid, view).maybeSingle();
      if (error) throw error;
      let shelfId = existing?.id as string | undefined;
      if (!shelfId) {
        const { data: created, error: insErr } = await db().from('shelves')
          .insert(view === 'all'
            ? { user_id: uid, kind: 'custom', name: 'TODOS' }
            : { user_id: uid, kind: 'platform', platform: view, name: view })
          .select('id').single();
        if (insErr) throw insErr;
        shelfId = created.id as string;
      }
      // regrava a ordem inteira (posições compactas 0..n)
      const { error: delErr } = await db().from('shelf_items').delete().eq('shelf_id', shelfId);
      if (delErr) throw delErr;
      const { error: itemsErr } = await db().from('shelf_items')
        .insert(gameIds.map((game_id, position) => ({ shelf_id: shelfId, game_id, position })));
      if (itemsErr) throw itemsErr;
    },
    onSuccess: (_d, _v) => {
      void qc.invalidateQueries({ queryKey: ['shelfOrder'] });
    },
  });
}
