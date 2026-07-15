import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { useIsFavorite, useToggleFavorite, type FavoriteSubject } from '@/hooks/useFavorites';

/** Botão de favoritar (coração). Fora do ar quando o Supabase não está configurado. */
export function FavoriteButton({
  subjectType,
  subjectId,
}: {
  subjectType: FavoriteSubject;
  subjectId: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { user, disabled } = useAuth();
  const { data: isFav = false } = useIsFavorite(subjectType, subjectId);
  const toggle = useToggleFavorite(subjectType, subjectId);

  if (disabled) return null;

  async function onClick() {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      await toggle.mutateAsync(isFav);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

  return (
    <Button
      variant={isFav ? 'primary' : 'secondary'}
      onClick={() => void onClick()}
      disabled={toggle.isPending}
      aria-pressed={isFav}
    >
      <Heart aria-hidden style={{ fill: isFav ? 'currentColor' : 'none' }} />
      {isFav ? t('community:favorited') : t('community:favorite')}
    </Button>
  );
}
