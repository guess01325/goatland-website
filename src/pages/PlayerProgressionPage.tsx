import { PageHeader } from '../components/PageHeader';
import { SectionHeading } from '../components/SectionHeading';

type ProgressionStep = {
  from: string;
  to: string;
  requirements: string[];
  rewards?: string[];
};

const progressionLevels = ['Starting', 'Amateur', 'Baby Boy', 'Veteran', 'King', 'GOAT'];

const progressionSteps: ProgressionStep[] = [
  {
    from: 'Starting',
    to: 'Amateur',
    requirements: ['Enter at least 10 leagues'],
  },
  {
    from: 'Amateur',
    to: 'Baby Boy',
    requirements: [
      'Enter at least 20 leagues',
      'Enter at least one Tier 2 league',
      'Win at least one league championship',
    ],
  },
  {
    from: 'Baby Boy',
    to: 'Veteran',
    requirements: [
      'Enter at least 30 leagues',
      'Enter at least one annual tournament',
      'Enter at least three Tier 2 leagues',
      'Win at least two league championships',
    ],
    rewards: ['$1,000 Cash', 'One Year GOATLAND Subscription'],
  },
  {
    from: 'Veteran',
    to: 'King',
    requirements: [
      'Enter at least 50 leagues',
      'Enter at least five Tier 2 leagues',
      'Enter at least five annual tournaments',
      'Win at least six league championships',
    ],
    rewards: ['$5,000 Cash', 'Five Year GOATLAND Subscription'],
  },
  {
    from: 'King',
    to: 'GOAT',
    requirements: [
      'Enter at least 100 leagues',
      'Enter at least ten Tier 2 leagues',
      'Win at least ten league championships',
      'Enter at least seven annual tournaments',
    ],
    rewards: ['Lifetime GOATLAND Subscription', '$1,000 every year on your birthday for life'],
  },
];

const progressionDrivers = [
  'Participating in leagues',
  'Winning league championships',
  'Entering Tier 2 leagues',
  'Competing in annual tournaments',
];

const faqs = [
  {
    question: 'Does my progression reset each season?',
    answer: 'No. Progression represents lifetime GOATLAND accomplishments.',
  },
  {
    question: 'Can I earn progression in multiple games?',
    answer: 'Yes. Eligible GOATLAND competitions contribute toward player progression.',
  },
  {
    question: 'Do annual tournaments count?',
    answer: 'Yes. Annual tournament participation is required for higher progression ranks.',
  },
  {
    question: 'How do I become a GOAT player?',
    answer: 'Players must complete every requirement listed in the King → GOAT progression level.',
  },
];

function RankCard({ step }: { step: ProgressionStep }) {
  return (
    <article className="preview-card progression-rank-card">
      <p className="eyebrow">{`${step.from} → ${step.to}`}</p>
      <h2>{`${step.from} to ${step.to}`}</h2>

      <div className="progression-card-section">
        <h3>Requirements</h3>
        <ul className="feature-list">
          {step.requirements.map((requirement) => (
            <li key={requirement}>{requirement}</li>
          ))}
        </ul>
      </div>

      {step.rewards ? (
        <div className="progression-card-section progression-rewards">
          <h3>Rewards</h3>
          <ul>
            {step.rewards.map((reward) => (
              <li key={reward}>{reward}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

export function PlayerProgressionPage() {
  return (
    <>
      <PageHeader
        title="Player Progression"
        description="Every GOATLAND player begins at the Starting rank and progresses by competing in leagues, winning championships, and participating in annual tournaments. Each milestone recognizes long-term commitment and achievement within the GOATLAND community."
      />

      <section className="section home-section progression-roadmap-section">
        <div className="container">
          <SectionHeading
            eyebrow="Section 1"
            title="Progression Roadmap"
            description="Follow the GOATLAND ladder from your first league entries to the highest lifetime achievement rank."
          />

          <ol className="progression-roadmap" aria-label="GOATLAND progression ladder">
            {progressionLevels.map((level) => (
              <li key={level}>
                <span>{level}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section home-section home-section--alt progression-page-section">
        <div className="container">
          <SectionHeading
            eyebrow="Section 2"
            title="Rank Requirements"
            description="Each card shows the next rank, the exact requirements to reach it, and any confirmed rewards attached to that milestone."
          />

          <div className="progression-rank-grid">
            {progressionSteps.map((step) => (
              <RankCard key={`${step.from}-${step.to}`} step={step} />
            ))}
          </div>
        </div>
      </section>

      <section className="section home-section progression-page-section">
        <div className="container progression-work-grid">
          <div>
            <SectionHeading
              eyebrow="Section 3"
              title="How Progression Works"
              description="Player progression represents lifetime accomplishments across GOATLAND competition."
            />
            <p className="progression-work-summary">
              Progression is designed to reward long-term dedication to GOATLAND.
            </p>
          </div>

          <article className="preview-card progression-driver-card">
            <p className="eyebrow">Players Earn Progression By</p>
            <ul className="progression-driver-list">
              {progressionDrivers.map((driver) => (
                <li key={driver}>{driver}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="section home-section home-section--alt progression-page-section">
        <div className="container">
          <SectionHeading
            eyebrow="Section 4"
            title="Frequently Asked Questions"
            description="Quick answers for how lifetime GOATLAND progression is counted."
          />

          <div className="faq-list">
            {faqs.map((faq) => (
              <details className="faq-item" key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>

          <p className="progression-info-notice">
            Player Progression rewards are earned by completing every requirement for each
            progression level. Progression represents long-term participation and achievement
            throughout GOATLAND competition.
          </p>
        </div>
      </section>
    </>
  );
}
