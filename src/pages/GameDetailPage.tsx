import { Link, Navigate } from 'react-router-dom';
import { GameVisual } from '../components/GameVisual';
import { PageHeader } from '../components/PageHeader';
import { SectionHeading } from '../components/SectionHeading';
import { getGameById, supportedGames, trademarkDisclaimer } from '../data/games';

type GameDetailPageProps = {
  gameId: string;
};

export function GameDetailPage({ gameId }: GameDetailPageProps) {
  const game = getGameById(gameId);

  if (!game) {
    return <Navigate to="/games" replace />;
  }

  const relatedGames = supportedGames.filter((relatedGame) => relatedGame.id !== game.id);
  const callsToAction = game.callsToAction ?? [{ label: 'View Leagues', path: '/leagues' }];

  return (
    <>
      <PageHeader
        eyebrow="Supported Games"
        title={game.heroTitle}
        description={game.heroDescription}
      />

      <section className="section game-detail-hero-section">
        <div className="container game-detail-hero">
          <GameVisual accent={game.accent} />
          <div className="game-detail-hero__content">
            <p className="eyebrow">Competition Overview</p>
            <h2>{game.shortName} inside GOATLAND</h2>
            <p>{game.overview}</p>
          </div>
        </div>
      </section>

      <section className="section home-section home-section--alt">
        <div className="container game-detail-grid">
          <article className="preview-card">
            <p className="eyebrow">Competition Options</p>
            <h2>Supported ways to compete</h2>
            <ul className="feature-list">
              {game.competitionOptions.map((option) => (
                <li key={option}>{option}</li>
              ))}
            </ul>
          </article>

          <article className="preview-card">
            <p className="eyebrow">How It Works</p>
            <h2>From signup to results</h2>
            <ol className="step-list">
              {game.howItWorks.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </article>
        </div>
      </section>

      {game.detailSummaries ? (
        <section className="section home-section">
          <div className="container game-summary-grid">
            {game.detailSummaries.map((summary) => (
              <article className="preview-card game-summary-card" key={summary.eyebrow}>
                <p className="eyebrow">{summary.eyebrow}</p>
                <h2>{summary.title}</h2>
                <ul className="feature-list">
                  {summary.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section home-section">
        <div className="container status-banner">
          <div>
            <p className="eyebrow">Launch Status</p>
            <h2>{game.statusTitle}</h2>
            <p>{game.statusText}</p>
          </div>
          <div className="status-banner__actions">
            {callsToAction.map((action) => (
              <Link
                className={`button-link${action.variant === 'secondary' ? ' button-link--secondary' : ''}`}
                key={action.path}
                to={action.path}
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section home-section home-section--alt">
        <div className="container">
          <SectionHeading
            eyebrow="More Games"
            title="Explore More GOATLAND Games"
            description="Move between supported GOATLAND competition categories as each area continues to take shape."
          />
          <div className="related-game-grid">
            {relatedGames.map((relatedGame) => (
              <Link className="related-game-card" key={relatedGame.id} to={relatedGame.path}>
                <span>{relatedGame.shortName}</span>
                <span>Explore Game</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section legal-section">
        <div className="container">
          <p>{trademarkDisclaimer}</p>
        </div>
      </section>
    </>
  );
}
