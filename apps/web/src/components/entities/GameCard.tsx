import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Gamepad2, CalendarClock, Languages } from 'lucide-react';
import type { Game } from '@romvault/core';
import { Card } from '@/components/ui/Card';
import { FadeImg } from '@/components/ui/FadeImg';
import { Badge } from '@/components/ui/Badge';
import { uiLangCode } from '@/hooks/useTranslationLangs';
import { QuickActions } from './QuickActions';

/**
 * Card de jogo. É o formato "resumido" da entidade Game; a página completa
 * fica em GameDetail — sem duplicar a lógica de detalhe aqui.
 * `translationBadges`: bandeiras dos idiomas de tradução disponíveis (🇧🇷…),
 * vindas em lote da página (useTranslationLangs) — não por card.
 */
export function GameCard({ game, translationBadges }: { game: Game; translationBadges?: string[] }) {
  const { t, i18n } = useTranslation();
  // selinho SO quando ha traducao no idioma DA INTERFACE (pt-BR -> BR)
  const uiCode = uiLangCode(i18n.language || 'pt-BR');
  const hasUiLang = translationBadges?.includes(uiCode) ?? false;
  return (
    <Link to={`/games/${game.slug}`} style={{ display: 'block' }}>
      <Card interactive padSm>
        <div className="tile">
          <div className="tile-thumb tile-cover">
            {game.cover_url || game.thumbnail ? (
              <FadeImg src={game.cover_url ?? game.thumbnail ?? ''} alt={game.title} />
            ) : (
              <Gamepad2 aria-hidden />
            )}
            <QuickActions game={game} translationBadges={translationBadges} />
            {hasUiLang && (
              <span className="tile-langs" title={t('games:hasTranslations')}>
                <Languages aria-hidden /> {uiCode}
              </span>
            )}
          </div>
          <div className="tile-body">
            <span className="tile-title">{game.title}</span>
            <div className="tile-meta">
              {game.release_date && (
                game.release_date > new Date().toISOString().slice(0, 10)
                  ? (
                    <span className="chip chip-future">
                      <CalendarClock aria-hidden /> {game.release_date.slice(0, 4)}
                    </span>
                  )
                  : <span>{game.release_date.slice(0, 4)}</span>
              )}
              {game.developer && <span className="dot">{game.developer}</span>}
            </div>
            {game.platforms && game.platforms.length > 0 && (
              <div className="tile-badges">
                {game.platforms.slice(0, 3).map((p) => (
                  <Badge key={p} tone="accent">
                    {p}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
