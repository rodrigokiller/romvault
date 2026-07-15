import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import type { MaterialKind } from './useMaterials';

const db = () => getSupabase() as unknown as SupabaseClient;

/** Nome de arquivo seguro para o Storage. */
function safeName(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot > -1 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : '';
  const base = (dot > -1 ? name.slice(0, dot) : name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'file'}${ext}`;
}

/**
 * Faz upload de um arquivo para o bucket `uploads`, na pasta do usuário
 * (`<uid>/<folder>/...`, exigido pela RLS do Storage). Retorna a URL pública.
 */
export function useUploadFile() {
  const { user } = useAuth();
  return async (file: File, folder: string, seed = 0): Promise<string> => {
    const uid = user?.id;
    if (!uid) throw new Error('Não autenticado.');
    // sem Date.now aleatório no server; aqui no cliente é ok, mas usamos um seed
    // do chamador quando houver, para nomes estáveis por sessão.
    const stamp = seed || Date.now();
    const path = `${uid}/${folder}/${stamp}-${safeName(file.name)}`;
    const sb = getSupabase();
    const { error } = await sb.storage.from('uploads').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw error;
    return sb.storage.from('uploads').getPublicUrl(path).data.publicUrl;
  };
}

/** Cria um material (romhack/tradução/documento/ferramenta) do usuário logado. */
export function useCreateMaterial(kind: MaterialKind) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const uid = user?.id;
      if (!uid) throw new Error('Não autenticado.');
      const row = { ...values, submitted_by: uid };
      const { data, error } = await db().from(kind).insert(row).select('id').single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [kind] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

/** Remoção (admin) de qualquer material/jogo/artigo. */
export function useDeleteEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ table, id }: { table: string; id: string }) => {
      const { error } = await db().from(table).delete().eq('id', id);
      if (error) throw error;
      return { table, id };
    },
    onSuccess: ({ table }) => {
      void qc.invalidateQueries({ queryKey: [table] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
      void qc.invalidateQueries({ queryKey: ['trending'] });
    },
  });
}

export type DownloadSubject = 'game' | 'romhack' | 'translation' | 'tool' | 'document';

/** Registra um evento de download (best-effort; ignora erro). Alimenta o trending. */
export async function trackDownload(subjectType: DownloadSubject, subjectId: string) {
  try {
    await db().from('download_events').insert({ subject_type: subjectType, subject_id: subjectId });
  } catch {
    /* silencioso — telemetria não deve quebrar o download */
  }
}
