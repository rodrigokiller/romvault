import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import type { Kind } from '@/components/entities/kinds';

const db = () => getSupabase() as unknown as SupabaseClient;

export interface Collection {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  position: number;
}

type Subject = 'game' | 'romhack' | 'translation' | 'tool' | 'document';
const SUBJECT_TABLE: Record<Subject, string> = {
  game: 'games', romhack: 'romhacks', translation: 'translations', tool: 'tools', document: 'documents',
};
const SUBJECT_KIND: Record<Subject, Kind> = {
  game: 'game', romhack: 'romhack', translation: 'translation', tool: 'tool', document: 'doc',
};

export interface CollectionItem {
  kind: Kind;
  note: string | null;
  item: Record<string, unknown>;
}

/** Coleções publicadas (mais bem posicionadas primeiro). */
export function useCollections(limit?: number) {
  return useQuery({
    queryKey: ['collections', limit ?? 0],
    enabled: env.configured,
    staleTime: 60_000,
    queryFn: async (): Promise<Collection[]> => {
      let q = db().from('collections').select('id, slug, title, description, cover_url, position')
        .eq('is_published', true)
        .order('position', { ascending: true });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Collection[];
    },
  });
}

/** Uma coleção com os itens resolvidos (em lote por tipo, na ordem definida). */
export function useCollection(slug: string | undefined) {
  return useQuery({
    queryKey: ['collections', 'detail', slug],
    enabled: env.configured && Boolean(slug),
    queryFn: async (): Promise<{ collection: Collection; items: CollectionItem[] } | null> => {
      const { data: col, error } = await db()
        .from('collections').select('*').eq('slug', slug as string).maybeSingle();
      if (error) throw error;
      if (!col) return null;

      const { data: rows } = await db()
        .from('collection_items')
        .select('subject_type, subject_id, position, note')
        .eq('collection_id', col.id)
        .order('position', { ascending: true });
      const list = (rows ?? []) as { subject_type: Subject; subject_id: string; position: number; note: string | null }[];

      // resolve em lote por tipo
      const byType = new Map<Subject, string[]>();
      for (const r of list) byType.set(r.subject_type, [...(byType.get(r.subject_type) ?? []), r.subject_id]);
      const resolved = new Map<string, Record<string, unknown>>();
      await Promise.all(
        [...byType.entries()].map(async ([type, ids]) => {
          const { data } = await db().from(SUBJECT_TABLE[type]).select('*').in('id', ids);
          for (const it of data ?? []) resolved.set(String((it as Record<string, unknown>).id), it as Record<string, unknown>);
        }),
      );

      const items: CollectionItem[] = [];
      for (const r of list) {
        const item = resolved.get(r.subject_id);
        if (item) items.push({ kind: SUBJECT_KIND[r.subject_type], note: r.note, item });
      }
      return { collection: col as unknown as Collection, items };
    },
  });
}
