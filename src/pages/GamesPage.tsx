import { Link } from 'react-router-dom';
import { GameVisual } from '../components/GameVisual';
import { PageHeader } from '../components/PageHeader';
import { SectionHeading } from '../components/SectionHeading';
import { supportedGames, trademarkDisclaimer } from '../data/games';

export function GamesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Supported Games"
        title="Choose Your Game. Build Your Legacy."
        description="GOATLAND brings structured leagues, regular seasons, standings, playoffs, player progression, and competitive matchups to the games players already love."
      />

      <section className="section home-section">
        <div className="container">
          <div className="games-overview-grid">
            {supportedGames.map((game) => (
              <article className="game-overview-card" key={game.id}>
                <GameVisual accent={game.accent} />
                <div className="game-overview-card__body">
                  <h2>{game.name}</h2>
                  <p>{game.description}</p>
                  <ul className="tag-list" aria-label={`${game.shortName} competition types`}>
                    {game.tags.map((tag) => (
                      <li key={tag}>{tag}</li>
                    ))}
                  </ul>
                  {game.landingDetails ? (
                    <dl className="game-card-detail-list">
                      {game.landingDetails.map((detail) => (
                        <div key={detail.label}>
                          <dt>{detail.label}</dt>
                          <dd>{detail.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  <div className="game-card-actions">
                    <Link
                      className="button-link"
                      to={game.path}
                      aria-label={`Explore ${game.shortName}`}
                    >
                      Explore Game
                    </Link>
                    {game.landingCallsToAction?.map((action) => (
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
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section final-cta games-bottom-callout">
        <div className="container final-cta__inner">
          <SectionHeading
            eyebrow="Competition Model"
            title="Built Around Full Competitive Seasons"
            description="GOATLAND is being built around full competitive experiences, including scheduled matchups, standings, progression, playoffs, annual tournaments, and long-term player recognition."
          />
          <div className="final-cta__actions">
            <Link className="button-link" to="/leagues">
              View Leagues
            </Link>
            <Link className="button-link button-link--secondary" to="/tournaments">
              View Annual Tournaments
            </Link>
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
