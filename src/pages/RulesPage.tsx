import { PageHeader } from '../components/PageHeader';
import { SectionHeading } from '../components/SectionHeading';

type RuleGroup = {
  title: string;
  items: string[];
  note?: string;
};

type GameSettings = {
  name: string;
  settings?: { label: string; value: string }[];
  items?: string[];
  rotation?: string[];
  note?: string;
};

type Faq = {
  question: string;
  answer:
    | string
    | {
        intro: string;
        items: string[];
      };
};

const competitionRules: RuleGroup[] = [
  {
    title: 'League Structure',
    items: [
      '16 Players Per League',
      '7 Week Regular Season',
      'Top 8 Advance to the Playoffs',
      'Single Elimination Playoffs',
      'League standings determine playoff seeding',
    ],
  },
  {
    title: 'Team Selection',
    items: [
      'Players may use any official team during a Best-of-5 series.',
      'The same player cannot use the same team more than once within the same series.',
      'Team selections reset for each new weekly series.',
      'If both players want to use the same team for a game, the home player has first choice. The away player must select a different team.',
    ],
  },
  {
    title: 'Sportsmanship',
    items: [
      'Respect all opponents.',
      'No cheating or exploiting game mechanics.',
      'Unsportsmanlike conduct may result in league removal.',
      'GOATLAND administrators have final authority on league disputes.',
    ],
  },
  {
    title: 'Match Reporting',
    items: [
      'Players are responsible for completing matches on time.',
      'Match results must be reported promptly.',
      'League administrators may request proof of results.',
    ],
  },
  {
    title: 'Forfeits',
    items: ['Missed scheduled matches may result in a forfeit.', 'Forfeits count toward league standings.'],
    note: 'Repeated-forfeit suspension policy will be finalized before league launch.',
  },
];

const regularSeasonAllocation = [
  { game: 'Registration positions 1–8', assignment: '4 home series and 3 away series' },
  { game: 'Registration positions 9–16', assignment: '3 home series and 4 away series' },
];

const leagueSchedule = [
  {
    tier: 'Tier 1',
    regularSeason: ['Regular Season: 7 Weeks', 'League Nights: Monday or Tuesday'],
    playoffs: ['Monday — Round 1', 'Tuesday — Final Four', 'Wednesday — Championship'],
  },
  {
    tier: 'Tier 2',
    regularSeason: ['Regular Season: 7 Weeks', 'League Night: Thursday'],
    playoffs: ['Wednesday — Round 1', 'Thursday — Final Four', 'Friday — Championship'],
  },
  {
    tier: 'Tier 3 (Main Event)',
    regularSeason: ['Regular Season: 7 Weeks', 'League Night: Saturday'],
    playoffs: ['Thursday — Round 1', 'Friday — Final Four', 'Saturday — Championship'],
  },
];

const matchTimeRequirements = [
  'League match windows begin at 6:00 PM ET.',
  'Players may begin their scheduled Best-of-5 series any time after 6:00 PM ET.',
  'The weekly Best-of-5 series must begin by 9:00 PM ET.',
  'If a player is unavailable and the series has not begun by 9:00 PM ET, that player will receive a forfeit.',
];

const playoffSeeding = [
  'Seeds 1–8 are finalized immediately after the completion of Week 7.',
  'The playoff bracket is generated from the final regular-season standings.',
  'League prizes are awarded after the championship according to the published payout structure.',
];

const gameSettings: GameSettings[] = [
  {
    name: 'Madden',
    settings: [
      { label: 'Difficulty', value: 'All-Madden' },
      { label: 'Series', value: 'Best of 5' },
      { label: 'Games 1-4', value: '3 Minute Quarters' },
      { label: 'Game 5', value: '5 Minute Quarters' },
      { label: 'Fatigue', value: 'On' },
      { label: 'Injuries', value: 'Off' },
      { label: 'Weather', value: 'Neutral' },
      { label: 'Custom Playbooks', value: 'Not Allowed' },
      { label: 'Custom Rosters', value: 'Not Allowed' },
    ],
    note: 'Mercy Rule will be finalized before league launch.',
  },
  {
    name: 'College Football',
    settings: [
      { label: 'Difficulty', value: 'Heisman' },
      { label: 'Series', value: 'Best of 5' },
      { label: 'Games 1-4', value: '3 Minute Quarters' },
      { label: 'Game 5', value: '5 Minute Quarters' },
      { label: 'Fatigue', value: 'On' },
      { label: 'Injuries', value: 'Off' },
      { label: 'Weather', value: 'Neutral' },
      { label: 'Custom Playbooks', value: 'Not Allowed' },
      { label: 'Custom Rosters', value: 'Not Allowed' },
      { label: 'Wear & Tear', value: 'On' },
    ],
    note: 'Mercy Rule will be finalized before league launch.',
  },
  {
    name: 'NBA 2K',
    settings: [
      { label: 'Difficulty', value: 'Hall of Fame' },
      { label: 'Series', value: 'Best of 5' },
      { label: 'Games 1-4', value: '4 Minute Quarters' },
      { label: 'Game 5', value: '5 Minute Quarters' },
      { label: 'Fatigue', value: 'On' },
      { label: 'Classic Teams', value: 'Allowed during tournaments' },
    ],
  },
  {
    name: 'MLB',
    settings: [
      { label: 'Difficulty', value: 'GOAT' },
      { label: 'Series', value: 'Best of 5' },
      { label: 'Games 1-4', value: '7 Innings' },
      { label: 'Game 5', value: '9 Innings' },
      { label: 'Guess Pitch', value: 'Off' },
      { label: 'Quick Counts', value: 'Off' },
      { label: 'Pitching Stamina', value: 'On' },
      { label: 'Created Stadiums', value: 'Not Allowed' },
      { label: 'Mercy Rule', value: 'None' },
    ],
  },
  {
    name: 'Call of Duty',
    items: [
      'Official CDL Rules',
      'Official CDL Game Modes',
      'Official CDL Map Pool',
      '4v4 Competition',
      'Best-of-5 Rotation',
    ],
    rotation: [
      'Hardpoint',
      'Search & Destroy',
      'Control',
      'Hardpoint',
      'Search & Destroy (if necessary)',
    ],
  },
];

const faqs: Faq[] = [
  {
    question: 'What happens if my opponent does not show?',
    answer: 'Missed scheduled matches may result in a forfeit.',
  },
  {
    question: 'How are playoff seeds determined?',
    answer: 'League standings determine playoff seeding.',
  },
  {
    question: 'How do forfeits work?',
    answer: 'Forfeits count toward league standings.',
  },
  {
    question: 'Can I change teams after joining a league?',
    answer: {
      intro: 'Yes, but there are restrictions.',
      items: [
        'During the regular season, players may choose a different team for each new weekly matchup.',
        'Once a Best-of-5 series begins, you must use the same team for the entire series. Teams cannot be changed during an active series.',
        'During annual tournaments, players must use the same team throughout the entire tournament and may not switch teams after the tournament begins.',
      ],
    },
  },
];

function FaqAnswer({ answer }: { answer: Faq['answer'] }) {
  if (typeof answer === 'string') {
    return <p>{answer}</p>;
  }

  return (
    <div className="faq-answer">
      <p>{answer.intro}</p>
      <ul>
        {answer.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function RulesPage() {
  return (
    <>
      <PageHeader
        title="GOATLAND Competition Rules"
        description="Review the official rules and competition settings that govern every GOATLAND league and annual tournament."
      />

      <section className="section rules-section">
        <div className="container">
          <SectionHeading
            eyebrow="Section 1"
            title="General Competition Rules"
            description="The league rule foundation for structure, conduct, match reporting, and forfeits."
          />

          <div className="rules-card-grid">
            {competitionRules.map((ruleGroup) => (
              <article className="preview-card rule-card" key={ruleGroup.title}>
                <h2>{ruleGroup.title}</h2>
                <ul className="feature-list">
                  {ruleGroup.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {ruleGroup.note ? <p className="rule-note">{ruleGroup.note}</p> : null}
              </article>
            ))}
          </div>

        </div>
      </section>

      <section className="section rules-section">
        <div className="container">
          <SectionHeading
            eyebrow="League Rules"
            title="League Schedule & Match Times"
            description="Official league schedules, match times, and playoff seeding requirements."
          />

          <div className="faq-list">
            {leagueSchedule.map((schedule) => (
              <article className="preview-card rule-card" key={schedule.tier}>
                <h2>{schedule.tier}</h2>
                <ul className="feature-list">
                  {schedule.regularSeason.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p
                  className="eyebrow"
                  style={{ margin: 'var(--space-5) 0 0', paddingLeft: 'calc(1.25rem + var(--space-2))' }}
                >
                  Week 8 Playoffs
                </p>
                <ul className="feature-list" style={{ marginTop: 'var(--space-3)' }}>
                  {schedule.playoffs.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}

            <article className="preview-card rule-card">
              <h2>Match Time Requirements</h2>
              <ul className="feature-list">
                {matchTimeRequirements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>

            <article className="preview-card rule-card">
              <h2>Playoff Seeding</h2>
              <ul className="feature-list">
                {playoffSeeding.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="section home-section home-section--alt home-advantage-section">
        <div className="container">
          <SectionHeading
            eyebrow="Section 2"
            title="Home Advantage"
            description="GOATLAND uses different home advantage formats for league play and annual tournaments."
          />

          <article className="preview-card rule-card">
            <p className="eyebrow">Regular Season Leagues</p>
            <h2>Early Registration Advantage</h2>
            <p>Registration order determines each player's regular-season home series allocation.</p>
            <ul className="feature-list">
              {regularSeasonAllocation.map((step) => (
                <li key={step.game}>
                  {step.game} receive {step.assignment}.
                </li>
              ))}
            </ul>
          </article>

          <SectionHeading
            eyebrow="League Playoffs"
            title="League Playoff Home Advantage"
            description="League playoff series use a 2-2-1 home advantage format based on the final regular season standings."
          />

          <article className="preview-card rule-card">
            <p>Home advantage is determined by the final regular season standings.</p>
          </article>

          <SectionHeading
            eyebrow="Annual Championships"
            title="Annual Championship Home Advantage"
            description="Annual Championship series use two different home advantage formats depending on the round."
          />

          <article className="preview-card rule-card">
            <p>Early Rounds — 1-1-1 Format</p>
            <p>Elite 8 and Beyond — 2-2-1 Format</p>
          </article>

          <p className="rule-note rule-note--standalone">
            Call of Duty does not use a traditional home/away format. Official CDL map rotation,
            side selection, and match procedures are used instead.
          </p>
        </div>
      </section>

      <section className="section rules-section">
        <div className="container">
          <SectionHeading
            eyebrow="Section 3"
            title="Game Specific Settings"
            description="Official competition settings for each supported GOATLAND game."
          />

          <div className="game-settings-grid">
            {gameSettings.map((game) => (
              <article className="preview-card game-settings-card" key={game.name}>
                <p className="eyebrow">{game.name}</p>
                <h2>{game.name}</h2>

                {game.settings ? (
                  <dl className="settings-list">
                    {game.settings.map((setting) => (
                      <div key={setting.label}>
                        <dt>{setting.label}</dt>
                        <dd>{setting.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}

                {game.items ? (
                  <ul className="feature-list">
                    {game.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}

                {game.rotation ? (
                  <ol className="cod-rotation-list" aria-label="Call of Duty Best-of-5 rotation">
                    {game.rotation.map((mode) => (
                      <li key={mode}>{mode}</li>
                    ))}
                  </ol>
                ) : null}

                {game.note ? <p className="rule-note">{game.note}</p> : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section home-section home-section--alt">
        <div className="container tournament-rules">
          <SectionHeading
            eyebrow="Section 4"
            title="Annual Tournaments"
            description="Annual tournaments follow separate qualification rules from league play."
          />
          <p className="rule-note rule-note--standalone">
            Tournament qualification details will be published before tournament registration opens.
          </p>
        </div>
      </section>

      <section className="section rules-section">
        <div className="container">
          <SectionHeading
            eyebrow="Section 5"
            title="FAQ"
            description="Quick answers using the currently confirmed GOATLAND rules."
          />

          <div className="faq-list">
            {faqs.map((faq) => (
              <details className="faq-item" key={faq.question}>
                <summary>{faq.question}</summary>
                <FaqAnswer answer={faq.answer} />
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
