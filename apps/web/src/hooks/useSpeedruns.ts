import { useQuery } from '@tanstack/react-query';
import { invokeFn } from '@/lib/invokeFn';
import { env } from '@/lib/env';

export interface SpeedrunRow {
  category: string;
  runner: string | null;
  time_seconds: number | null;
  video_url: string | null;
  run_url: string | null;
}

/**
 * Recordes de speedrun do jogo (read-through): chama a edge speedrun-sync, que
 * devolve o cache e só re-busca no speedrun.com se passou de 7 dias. Roda só
 * quando a aba Speedruns está aberta (enabled), então não pesa em todo pageview.
 */
export function useSpeedruns(gameId: string | undefined) {
  return useQuery({
    queryKey: ['speedruns', gameId],
    enabled: env.configured && Boolean(gameId),
    staleTime: 60 * 60_000,
    retry: false,
    queryFn: async (): Promise<SpeedrunRow[]> => {
      const d = await invokeFn<{ runs?: SpeedrunRow[] }>('speedrun-sync', { game_id: gameId });
      return d.runs ?? [];
    },
  });
}
