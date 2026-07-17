import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Gamepad2 } from 'lucide-react';
import type { Game } from '@romvault/core';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SyncDataPanel } from './SyncDataPanel';

/**
 * Quick view de um jogo (modal): capa, plataformas, meta e descrição, sem
 * sair da página. Usado nos cards do catálogo, na vitrine e na estante.
 */
export function GameQuickView({
  game, open, onClose, translationBadges,
}: { game: Game; open: boolean; onClose: () => void; translationBadges?: string[] }) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <Dialog open={open} onClose={onClose} title={game.title}>
      <div className="qv">
        <div className="qv-cover">
          {game.cover_url || game.thumbnail ? (
            <img src={game.cover_url ?? game.thumbnail ?? ''} alt={game.title} />
          ) : (
            <Gamepad2 aria-hidden />
          )}
        </div>
        <div className="qv-body">
          <div className="tile-badges">
            {(game.platforms ?? []).slice(0, 4).map((p) => (
              <Badge key={p} tone="accent">{p}</Badge>
            ))}
            {(translationBadges ?? []).map((code) => (
              <span key={code} className="lang-chip" title={t('games:hasTranslations')}>
                {code}
              </span>
            ))}
          </div>
          <div className="tile-meta" style={{ marginTop: 'var(--s2)' }}>
            {game.release_date && <span>{game.release_date.slice(0, 4)}</span>}
            {game.developer && <span className="dot">{game.developer}</span>}
            {game.genres?.length ? <span className="dot">{game.genres.join(', ')}</span> : null}
          </div>
          {game.description && <p className="qv-desc">{game.description}</p>}
          {/* modal detalhado: os dados sincronizados DO usuário (horas/conquistas por conta) */}
          <SyncDataPanel gameId={game.id} compact />
          <Link to={`/games/${game.slug}`} onClick={(e) => e.stopPropagation()}>
            <Button variant="primary" size="sm">{t('games:openFull')}</Button>
          </Link>
        </div>
      </div>
    </Dialog>
  );
}
