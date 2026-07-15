import { Link } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import type { Game } from '@romvault/core';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { QuickActions } from './QuickActions';

/**
 * Card de jogo. É o formato "resumido" da entidade Game; a página completa
 * fica em GameDetail — sem duplicar a lógica de detalhe aqui.
 */
export function GameCard({ game }: { game: Game }) {
  return (
    <Link to={`/games/${game.slug}`} style={{ display: 'block' }}>
      <Card interactive padSm>
        <div className="tile">
          <div className="tile-thumb tile-cover">
            {game.cover_url || game.thumbnail ? (
              <img src={game.cover_url ?? game.thumbnail ?? ''} alt={game.title} loading="lazy" />
            ) : (
              <Gamepad2 aria-hidden />
            )}
            <QuickActions game={game} />
          </div>
          <div className="tile-body">
            <span className="tile-title">{game.title}</span>
            <div className="tile-meta">
              {game.release_date && (
                game.release_date > new Date().toISOString().slice(0, 10)
                  ? <span className="chip chip-future">{game.release_date.slice(0, 4)} ⏳</span>
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
