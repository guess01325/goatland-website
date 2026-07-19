import type { GameAccent } from '../data/games';

type GameVisualProps = {
  accent: GameAccent;
};

export function GameVisual({ accent }: GameVisualProps) {
  return (
    <div className={`game-visual game-visual--${accent}`} aria-hidden="true">
      <span className="game-visual__mark" />
      <span className="game-visual__line game-visual__line--one" />
      <span className="game-visual__line game-visual__line--two" />
    </div>
  );
}
