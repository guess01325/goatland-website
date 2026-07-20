import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { SectionHeading } from '../components/SectionHeading';

type TournamentRound = {
  name: string;
  players: string;
  date: string;
  series: 'Best of 3' | 'Best of 5';
};

type Tournament = {
  id: string;
  name: string;
  game: string;
  difficulty: string;
  entryFee: string;
  playerCount: string;
  championPrize: string;
  finalFourPrize: string;
  qualification: string;
  format: string[];
  rules: string[];
  rounds: TournamentRound[];
};

const tournaments: Tournament[] = [
  {
    id: 'goat-bowl',
    name: 'GOAT Bowl',
    game: 'EA Sports College Football 27',
    difficulty: 'Heisman',
    entryFee: '$1,000',
    playerCount: '64',
    championPrize: '$25,000',
    finalFourPrize: '$2,000 each',
    qualification: '10 automatic bids',
    format: [
      '64-player tournament',
      'Best of 3 through the Round of 16',
      'Best of 5 beginning with the Elite 8',
    ],
    rules: [
      'Same Team',
      'Any official in-game offensive playbook may be used.',
      'Any official in-game defensive playbook may be used.',
      'Custom playbooks are not permitted.',
    ],
    rounds: [
      { name: 'Round of 64', players: '64', date: 'Jan 8, 2027', series: 'Best of 3' },
      { name: 'Round of 32', players: '32', date: 'Jan 10', series: 'Best of 3' },
      { name: 'Round of 16', players: '16', date: 'Jan 15', series: 'Best of 3' },
      { name: 'Round of 8', players: '8', date: 'Jan 17', series: 'Best of 5' },
      { name: 'Final Four', players: '4', date: 'Jan 23', series: 'Best of 5' },
      { name: 'Championship', players: '2', date: 'Jan 24', series: 'Best of 5' },
    ],
  },
  {
    id: 'super-goat-bowl',
    name: 'Super GOAT Bowl',
    game: 'Madden 27',
    difficulty: 'All-Madden',
    entryFee: '$1,000',
    playerCount: '64',
    championPrize: '$25,000',
    finalFourPrize: '$2,000 each',
    qualification: '10 automatic bids',
    format: [
      '64-player tournament',
      'Best of 3 through the Round of 16',
      'Best of 5 beginning with the Elite 8',
    ],
    rules: [
      'Same Team',
      'Any official in-game offensive playbook may be used.',
      'Any official in-game defensive playbook may be used.',
      'Custom playbooks are not permitted.',
    ],
    rounds: [
      { name: 'Round of 64', players: '64', date: 'Jan 28', series: 'Best of 3' },
      { name: 'Round of 32', players: '32', date: 'Jan 30', series: 'Best of 3' },
      { name: 'Round of 16', players: '16', date: 'Feb 4', series: 'Best of 3' },
      { name: 'Round of 8', players: '8', date: 'Feb 6', series: 'Best of 5' },
      { name: 'Final Four', players: '4', date: 'Feb 12', series: 'Best of 5' },
      { name: 'Championship', players: '2', date: 'Feb 13', series: 'Best of 5' },
    ],
  },
  {
    id: 'goatland-classic',
    name: 'GOATLAND Classic',
    game: 'NBA 2K27',
    difficulty: 'Hall of Fame',
    entryFee: '$1,000',
    playerCount: '64',
    championPrize: '$25,000',
    finalFourPrize: '$2,000 each',
    qualification: '10 automatic bids',
    format: [
      '64-player tournament',
      'Best of 3 through the Round of 16',
      'Best of 5 beginning with the Elite 8',
    ],
    rules: ['Same Team'],
    rounds: [
      { name: 'Round of 64', players: '64', date: 'Feb 4', series: 'Best of 3' },
      { name: 'Round of 32', players: '32', date: 'Feb 7', series: 'Best of 3' },
      { name: 'Round of 16', players: '16', date: 'Feb 11', series: 'Best of 3' },
      { name: 'Round of 8', players: '8', date: 'Feb 14', series: 'Best of 5' },
      { name: 'Final Four', players: '4', date: 'Feb 19', series: 'Best of 5' },
      { name: 'Championship', players: '2', date: 'Feb 20', series: 'Best of 5' },
    ],
  },
  {
    id: 'mut-goatland',
    name: 'MUT GOATLAND',
    game: 'Madden Ultimate Team',
    difficulty: 'Hall of Fame',
    entryFee: '$750',
    playerCount: '32',
    championPrize: '$10,000',
    finalFourPrize: '$1,000 each',
    qualification: 'N/A',
    format: [
      '32-player tournament',
      'Begins with the Round of 32',
      'Best of 3 through the Round of 16',
      'Best of 5 beginning with the Elite 8',
    ],
    rules: ['Use your own playbook.', '4-minute quarters.'],
    rounds: [
      { name: 'Round of 32', players: '32', date: 'Dec 10', series: 'Best of 3' },
      { name: 'Round of 16', players: '16', date: 'Dec 13', series: 'Best of 3' },
      { name: 'Round of 8', players: '8', date: 'Dec 18', series: 'Best of 5' },
      { name: 'Final Four', players: '4', date: 'Dec 21', series: 'Best of 5' },
      { name: 'Championship', players: '2', date: 'Dec 23', series: 'Best of 5' },
    ],
  },
];

const anchorLinks = [
  { label: 'Championships', href: '#championships' },
  { label: 'Qualification', href: '#qualification' },
  { label: 'Seeding', href: '#seeding' },
  { label: 'Rules', href: '#rules' },
  { label: 'FAQ', href: '#faq' },
];

const seedingSteps = [
  'Registration is first come, first served.',
  'Players choose their bracket position in the order they complete registration.',
  'The first registered player may choose any available seed.',
  'Each following player chooses from the remaining available bracket positions.',
  'Once a bracket position is selected, it becomes locked.',
  'The bracket is finalized once registration closes.',
];

const faqs = [
  {
    question: 'How do players qualify for a tournament?',
    answer:
      'The first 10 Tier 3 League Champions receive automatic bids to the eligible 64-player tournaments. The remaining 54 positions are filled through registration. MUT GOATLAND does not offer automatic bids, and all 32 positions are filled through registration.',
  },
  {
    question: 'How are tournament seeds selected?',
    answer:
      'Players select their available bracket position in the order they complete registration. Once a position is selected, it becomes locked.',
  },
  {
    question: 'Can players still register after automatic bids are awarded?',
    answer:
      'Yes. Automatic bids fill the first 10 qualifying positions in eligible 64-player tournaments, while the remaining 54 positions are filled through registration.',
  },
  {
    question: 'Does MUT GOATLAND offer automatic bids?',
    answer: 'No. All 32 MUT GOATLAND positions are filled through registration.',
  },
];

function getTournamentDates(tournament: Tournament) {
  return tournament.rounds.map((round) => round.date).join(', ');
}

function TournamentCard({ tournament }: { tournament: Tournament }) {
  const fields = [
    { label: 'Game', value: tournament.game },
    { label: 'Difficulty', value: tournament.difficulty },
    { label: 'Entry Fee', value: tournament.entryFee },
    { label: 'Player Count', value: tournament.playerCount },
    { label: 'Tournament Dates', value: getTournamentDates(tournament) },
    { label: 'Final Four Prize', value: tournament.finalFourPrize },
  ];

  return (
    <article className="preview-card tournament-card" id={tournament.id}>
      <p className="eyebrow">{tournament.playerCount} Players</p>
      <h2>{tournament.name}</h2>
      <div className="tournament-card__prize">
        <span>Champion Prize</span>
        <strong>{tournament.championPrize}</strong>
      </div>
      <dl className="tournament-fact-list">
        {fields.map((field) => (
          <div key={field.label}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
        <div>
          <dt>Format</dt>
          <dd>
            <ul className="tournament-format-list">
              {tournament.format.map((item) => (
                <li key={`${tournament.id}-${item}`}>{item}</li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
    </article>
  );
}

function InfoNotice({ children }: { children: React.ReactNode }) {
  return <p className="tournament-info-notice">{children}</p>;
}

export function TournamentsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Annual Championships"
        title="GOATLAND Annual Championships"
        description="GOATLAND hosts four annual championship tournaments where competitors battle for championship titles, major cash prizes, and recognition among the best players in the league."
      />

      <section className="section tournament-intro-section">
        <div className="container">
          <nav className="anchor-nav" aria-label="Tournament page sections">
            {anchorLinks.map((link) => (
              <a href={link.href} key={link.href}>
                {link.label}
              </a>
            ))}
          </nav>

          <div className="tournament-intro-grid">
            <article className="preview-card tournament-intro-card">
              <p>
                GOATLAND has four annual championship tournaments. Each tournament has its
                own format, entry requirements, prize structure, and competition settings.
              </p>
            </article>
            <article className="preview-card tournament-intro-card">
              <p>
                League performance may provide automatic qualification for eligible tournaments.
                These championships are annual events, not daily or one-day open events.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section home-section home-section--alt tournament-page-section" id="championships">
        <div className="container">
          <SectionHeading
            eyebrow="Featured Tournaments"
            title="Annual Championship Lineup"
            description="Four official GOATLAND championship tournaments, each with its own game, player count, entry fee, schedule, and prize structure."
          />

          <div className="tournament-card-grid">
            {tournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
          </div>
        </div>
      </section>

      <section className="section tournament-page-section" id="qualification">
        <div className="container">
          <SectionHeading
            eyebrow="Qualification"
            title="Tournament Qualification"
            description="Eligible 64-player tournaments reserve automatic bids for Tier 3 League Champions, while MUT GOATLAND uses registration for every spot."
          />

          <div className="qualification-grid">
            <article className="preview-card qualification-card">
              <p className="eyebrow">64-Player Tournaments</p>
              <h2>GOAT Bowl, Super GOAT Bowl, GOATLAND Classic</h2>
              <dl className="qualification-counts">
                <div>
                  <dt>Automatic Bids</dt>
                  <dd>10</dd>
                </div>
                <div>
                  <dt>Registration Spots</dt>
                  <dd>54</dd>
                </div>
                <div>
                  <dt>Total Spots</dt>
                  <dd>64</dd>
                </div>
              </dl>
              <p>The first 10 Tier 3 League Champions receive automatic bids.</p>
              <p>The remaining 54 tournament spots are filled through registration.</p>
            </article>

            <article className="preview-card qualification-card">
              <p className="eyebrow">MUT GOATLAND</p>
              <h2>All Spots Filled Through Registration</h2>
              <dl className="qualification-counts">
                <div>
                  <dt>Automatic Bids</dt>
                  <dd>0</dd>
                </div>
                <div>
                  <dt>Registration Spots</dt>
                  <dd>32</dd>
                </div>
                <div>
                  <dt>Total Spots</dt>
                  <dd>32</dd>
                </div>
              </dl>
              <p>There are no automatic bids.</p>
              <p>All 32 tournament spots are filled through registration.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section home-section home-section--alt tournament-page-section" id="seeding">
        <div className="container">
          <SectionHeading
            eyebrow="Bracket Order"
            title="Tournament Seeding"
            description="Tournament seeding is selected by players in registration order."
          />

          <ol className="seeding-step-grid">
            {seedingSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section tournament-page-section" id="rules">
        <div className="container">
          <SectionHeading
            eyebrow="Rules"
            title="Tournament Rules"
            description="Tournament-specific rules are listed here. General competition settings remain on the Rules page."
          />

          <div className="tournament-rules-grid">
            {tournaments.map((tournament) => (
              <article className="preview-card tournament-rule-card" key={`${tournament.id}-rules`}>
                <p className="eyebrow">{tournament.name}</p>
                <h2>{tournament.name}</h2>
                <ul className="feature-list">
                  {tournament.rules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <InfoNotice>
            For general competition settings, review the <Link to="/rules">GOATLAND Competition Rules</Link>.
          </InfoNotice>
        </div>
      </section>

      <section className="section tournament-page-section" id="faq">
        <div className="container">
          <SectionHeading
            eyebrow="FAQ"
            title="Frequently Asked Questions"
            description="Quick answers based on confirmed tournament qualification and seeding details."
          />

          <div className="faq-list">
            {faqs.map((faq) => (
              <details className="faq-item" key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>

          <InfoNotice>
            Tournament details, including dates, prize amounts, formats, and competition settings,
            are subject to official GOATLAND updates before registration opens. Any approved changes
            will be announced through GOATLAND's official channels.
          </InfoNotice>
        </div>
      </section>
    </>
  );
}
