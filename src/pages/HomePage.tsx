import { Link } from 'react-router-dom';
import logo from '../../references/GOATLAND_Logo.png';
import { SectionHeading } from '../components/SectionHeading';
import { registrationAnnouncement } from '../data/registration';

const supportedGames = ['Madden', 'College Football', 'NBA 2K', 'Call of Duty'];

export function HomePage() {
  return (
    <>
      <section className="home-hero">
        <div className="container home-hero__inner">
          <div className="home-hero__content">
            <p className="eyebrow">Competitive Gaming</p>
            <h1>Compete inside GOATLAND</h1>
            <div className="hero-registration-notice">
              <p className="hero-registration-notice__title">
                {registrationAnnouncement.opensLabel}
              </p>
              <p>{registrationAnnouncement.heroBody}</p>
            </div>
            <p>
              GOATLAND is a premium competitive gaming destination built for players
              who want organized leagues, tournament opportunities, and a clear path
              to keep progressing.
            </p>
            <div className="hero-actions">
              <Link className="button-link" to="/leagues">
                View Leagues
              </Link>
              <Link className="button-link button-link--secondary" to="/games">
                Explore Games
              </Link>
              <Link className="button-link button-link--ghost" to="/contact">
                Learn More
              </Link>
            </div>
          </div>
          <div className="home-hero__visual" aria-label="GOATLAND brand mark">
            <img className="home-hero__logo" src={logo} alt="GOATLAND" />
          </div>
        </div>
      </section>

      <section className="section home-section home-about-section">
        <div className="container">
          <SectionHeading
            eyebrow="About GOATLAND"
            title="A competitive home for console gaming"
            description="GOATLAND brings competitive gaming into one polished public experience. This site introduces the ecosystem now, with more details announced as each area is finalized."
          />
        </div>
      </section>

      <section className="section home-section registration-section" id="registration-announcement">
        <div className="container registration-section__inner">
          <SectionHeading
            eyebrow="Registration"
            title={registrationAnnouncement.opensLabel}
            description={registrationAnnouncement.sectionBody}
          />
          <Link className="button-link" to={registrationAnnouncement.informationPath}>
            View Leagues
          </Link>
        </div>
      </section>

      <section className="section home-section home-section--alt">
        <div className="container">
          <SectionHeading
            eyebrow="Supported Games"
            title="Built around the titles players already compete in"
            description="GOATLAND is preparing around a focused lineup of competitive games. Full game details will live on the Games page as they are announced."
          />
          <div className="game-grid">
            {supportedGames.map((game) => (
              <Link className="game-card" key={game} to="/games">
                <span className="game-card__label">{game}</span>
                <span className="game-card__cta">View on Games</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section home-section">
        <div className="container preview-grid">
          <article className="preview-card preview-card--wide">
            <p className="eyebrow">Leagues</p>
            <h2>Organized competition with room to grow</h2>
            <p>
              GOATLAND leagues will give players a structured place to compete.
              League details, formats, and participation information will be announced
              on the Leagues page.
            </p>
            <Link className="button-link" to="/leagues">
              Visit Leagues
            </Link>
          </article>

          <article className="preview-card">
            <p className="eyebrow">Tournaments</p>
            <h2>Focused events for competitive players</h2>
            <p>
              Tournament information will be introduced as it is finalized, keeping
              this preview high-level until official structures are ready.
            </p>
            <Link className="text-link" to="/tournaments">
              Explore Tournaments
            </Link>
          </article>

          <article className="preview-card">
            <p className="eyebrow">Player Progression</p>
            <h2>A path through the GOATLAND ecosystem</h2>
            <p>
              Players will be able to progress through GOATLAND over time. Specific
              progression mechanics will be announced on the dedicated page.
            </p>
            <Link className="text-link" to="/player-progression">
              View Progression
            </Link>
          </article>
        </div>
      </section>

      <section className="section final-cta">
        <div className="container final-cta__inner">
          <SectionHeading
            eyebrow="Next Step"
            title="Choose where you want to explore first"
            description="Start with leagues, review the supported games, or reach out through the contact page as GOATLAND continues to take shape."
          />
          <div className="final-cta__actions">
            <Link className="button-link" to="/leagues">
              Leagues
            </Link>
            <Link className="button-link button-link--secondary" to="/games">
              Games
            </Link>
            <Link className="button-link button-link--ghost" to="/contact">
              Contact
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
