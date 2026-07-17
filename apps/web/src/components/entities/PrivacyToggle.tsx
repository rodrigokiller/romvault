import { useTranslation } from 'react-i18next';
import { Lock, LockOpen } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { useMyTrack, useSetGamePrivacy } from '@/hooks/useTracks';

/**
 * Cadeado do jogo (estilo Steam): privado = só você vê na sua biblioteca e
 * vitrine; some das versões públicas do seu perfil (garantido pela RLS).
 * Só aparece quando o jogo está na sua biblioteca.
 */
export function PrivacyToggle({ gameId }: { gameId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user, disabled } = useAuth();
  const { data: track } = useMyTrack(gameId);
  const setPrivacy = useSetGamePrivacy();

  if (disabled || !user || !track) return null;
  const isPrivate = Boolean(track.is_private);

  async function toggle() {
    try {
      await setPrivacy.mutateAsync({ gameId, isPrivate: !isPrivate });
      toast.success(isPrivate ? t('library:privacyOff') : t('library:privacyOn'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

  return (
    <Button
      variant={isPrivate ? 'primary' : 'ghost'}
      size="sm"
      onClick={() => void toggle()}
      disabled={setPrivacy.isPending}
      title={isPrivate ? t('library:privacyHintOn') : t('library:privacyHintOff')}
    >
      {isPrivate ? <Lock /> : <LockOpen />} {isPrivate ? t('library:privateBadge') : t('library:privacyBtn')}
    </Button>
  );
}
