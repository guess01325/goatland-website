import { Link } from 'react-router-dom';
import logo from '../../references/GOATLAND_Logo.png';
import { SectionHeading } from '../components/SectionHeading';
import { supportedGames as gameList } from '../data/games';
import { registrationAnnouncement } from '../data/registration';

const championshipPrizes = [
  { name: 'GOAT Bowl', game: 'EA Sports College Football 27', prize: '$25,000' },
  { name: 'Super GOAT Bowl', game: 'Madden 27', prize: '$25,000' },
  { name: 'GOATLAND Classic', game: 'NBA 2K27', prize: '$25,000' },
  { name: 'MUT GOATLAND', game: 'Madden Ultimate Team', prize: '$10,000' },
];

const playerBenefits = [
  'Compete in structured five-week regular seasons',
  'Reach the top-eight playoffs',
  'Earn cash payouts',
  'Win league championships',
  'Qualify for annual tournaments',
  'Climb the GOATLAND progression ranks',
];

const arenaLabels: Record<string, string[]> = {
  madden: ['Weekly League Competition', 'Best-of-5 Series', 'Cash Payouts', 'Championship Path'],
  'college-football': ['Weekly League Competition', 'Best-of-5 Series', 'Cash Payouts', 'Championship Path'],
  'nba-2k': ['Weekly League Competition', 'Best-of-5 Series', 'Cash Payouts', 'Championship Path'],
  'mlb-27': ['Tier 1 and Tier 2', 'Best-of-5 Series', 'Cash Payouts', 'League Play'],
  'call-of-duty': ['Weekly League Competition', 'CDL Rules', 'Cash Payouts', 'Championship Path'],
};

const howItWorks = [
  {
    title: 'Choose Your Game',
    text: 'Pick the arena where you want to build your record.',
  },
  {
    title: 'Enter a League',
    text: 'Join a structured competition built for serious players.',
  },
  {
    title: 'Compete for Five Weeks',
    text: 'Play two matches per week, protect your spot, and chase the standings.',
  },
  {
    title: 'Reach the Playoffs',
    text: 'Finish in the top eight and fight through the bracket.',
  },
  {
    title: 'Win and Rise Through the Ranks',
    text: 'Claim your title, earn payouts, and move toward GOAT status.',
  },
];

const progressionRanks = ['Starting', 'Amateur', 'Baby Boy', 'Veteran', 'King', 'GOAT'];

export function HomePage() {
  return (
    <>
      <section className="home-hero home-hero--competitive">
        <div className="container home-hero__inner home-hero__inner--competitive">
          <div className="home-hero__content home-hero__content--competitive">
            <p className="eyebrow">Competitive Gaming</p>
            <h1>Compete. Win. Become a GOAT.</h1>
            <p className="home-hero__lead">
              Enter competitive gaming leagues, battle through the season, earn championship
              recognition, and compete for major cash prizes.
            </p>

            <div className="hero-prize-callout" aria-label="Up to $25,000 Annual Championship Prize">
              <span>Up to</span>
              <strong>$25,000</strong>
              <p>Annual Championship Prize</p>
            </div>

            <div className="hero-actions">
              <Link className="button-link" to="/leagues">
                Explore Leagues
              </Link>
              <Link className="button-link button-link--secondary" to="/tournaments">
                View Annual Championships
              </Link>
            </div>

            <div className="hero-registration-notice hero-registration-notice--compact">
              <p className="hero-registration-notice__title">
                {registrationAnnouncement.opensLabel}
              </p>
            </div>
          </div>

          <div className="home-hero__visual home-hero__visual--competitive" aria-label="GOATLAND brand mark">
            <img className="home-hero__logo" src={logo} alt="GOATLAND" />
            <div className="hero-arena-stats" aria-label="Supported GOATLAND games">
              <span>Madden</span>
              <span>College Football</span>
              <span>NBA 2K</span>
              <span>MLB</span>
              <span>Call of Duty</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section home-section registration-section" id="registration-announcement">
        <div className="container registration-section__inner">
          <SectionHeading
            eyebrow="Registration"
            title={registrationAnnouncement.opensLabel}
            description={registrationAnnouncement.sectionBody}
          />
          <Link className="button-link" to="/register">
            Register Now
          </Link>
        </div>
      </section>

      <section className="section home-section home-prize-section">
        <div className="container">
          <SectionHeading
            eyebrow="Championship Prizes"
            title="Compete for Championship Prizes"
            description="GOATLAND’s annual championships bring together top competitors for major cash prizes and championship recognition."
          />

          <div className="championship-prize-grid">
            {championshipPrizes.map((championship) => (
              <article className="championship-prize-card" key={championship.name}>
                <p className="eyebrow">Annual Championship</p>
                <header className="championship-prize-card__heading">
                  <h2>{championship.name}</h2>
                  <p>{championship.game}</p>
                </header>
                <div>
                  <span>Champion Prize</span>
                  <strong>{championship.prize}</strong>
                </div>
                <p>Final Four payouts available</p>
              </article>
            ))}
          </div>

          <Link className="text-link home-section-link" to="/tournaments">
            View Annual Championships
          </Link>
        </div>
      </section>

      <section className="section home-section home-section--alt">
        <div className="container split-section">
          <SectionHeading
            eyebrow="Player Path"
            title="This Is Your Road to GOAT Status"
            description="Build your record, win your series, reach the playoffs, claim your title, and rise through the ranks."
          />

          <ul className="player-benefit-grid">
            {playerBenefits.map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section home-section">
        <div className="container">
          <SectionHeading
            eyebrow="Games"
            title="Choose Your Arena"
            description="Pick your title and step into structured competition built around seasons, playoffs, payouts, and progression."
          />

          <div className="arena-grid">
            {gameList.map((game) => (
              <Link className="arena-card" key={game.id} to={game.path}>
                <span className="arena-card__game">{game.shortName}</span>
                <ul>
                  {(arenaLabels[game.id] ?? ['Competitive League Play']).map((label) => (
                    <li key={`${game.id}-${label}`}>{label}</li>
                  ))}
                </ul>
                <span className="arena-card__cta">Enter Arena</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section home-section home-section--alt">
        <div className="container">
          <SectionHeading
            eyebrow="How It Works"
            title="Win the Week. Chase the Title."
            description="GOATLAND keeps the path direct: choose your game, enter the season, and fight for the postseason."
          />

          <ol className="home-step-grid">
            {howItWorks.map((step) => (
              <li key={step.title}>
                <span>{step.title}</span>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section home-section progression-preview-section">
        <div className="container">
          <SectionHeading
            eyebrow="Player Progression"
            title="Rise Through the Ranks"
            description="Every eligible league, championship, and annual tournament moves you closer to GOAT status."
          />

          <ol className="home-rank-path">
            {progressionRanks.map((rank) => (
              <li key={rank}>
                <span>{rank}</span>
              </li>
            ))}
          </ol>

          <Link className="text-link home-section-link" to="/player-progression">
            View Player Progression
          </Link>
        </div>
      </section>

      <section className="section final-cta home-community-section">
        <div className="container final-cta__inner">
          <SectionHeading
            eyebrow="Community"
            title="Enter the GOATLAND Community"
            description="Stay connected for league announcements, tournament updates, rankings, highlights, and future registration news."
          />
          <div className="final-cta__actions">
            <a
              className="button-link"
              href="https://discord.gg/psWSKyrPw"
              target="_blank"
              rel="noopener noreferrer"
            >
              Join the Discord
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
