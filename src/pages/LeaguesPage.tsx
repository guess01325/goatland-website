import { PageHeader } from '../components/PageHeader';
import { SectionHeading } from '../components/SectionHeading';
import { standardLeagueStructureRules } from '../data/leagueStructure';

type LeagueTier = {
  id: string;
  name: string;
  supportedGames: string[];
  entryFee: string;
  championPrize: string;
  playoffPayouts: {
    position: string;
    payout: string;
  }[];
  note?: string;
  qualificationCallout?: {
    title: string;
    body: string;
  };
};

const leagueTiers: LeagueTier[] = [
  {
    id: 'standard-tier-1',
    name: 'Tier 1',
    supportedGames: ['Madden', 'College Football', 'NBA 2K', 'Call of Duty', 'MLB'],
    entryFee: '$50',
    championPrize: '$400',
    playoffPayouts: [
      { position: '1st', payout: '$40' },
      { position: '2nd-3rd', payout: '$20 each' },
      { position: '4th-5th', payout: '$10 each' },
      { position: '6th-8th', payout: '$5 each' },
    ],
  },
  {
    id: 'standard-tier-2',
    name: 'Tier 2',
    supportedGames: ['Madden', 'College Football', 'NBA 2K', 'Call of Duty'],
    entryFee: '$200',
    championPrize: '$1,500',
    playoffPayouts: [
      { position: '1st', payout: '$200' },
      { position: '2nd-3rd', payout: '$100 each' },
      { position: '4th-5th', payout: '$50 each' },
      { position: '6th-8th', payout: '$20 each' },
    ],
  },
  {
    id: 'standard-tier-3',
    name: 'Tier 3',
    supportedGames: ['Madden', 'College Football', 'NBA 2K', 'Call of Duty'],
    entryFee: '$500',
    championPrize: '$4,500',
    playoffPayouts: [
      { position: '1st', payout: '$400' },
      { position: '2nd-3rd', payout: '$200 each' },
      { position: '4th-5th', payout: '$100 each' },
      { position: '6th-8th', payout: '$50 each' },
    ],
    qualificationCallout: {
      title: 'Annual Championship Qualification',
      body: 'The first 10 Tier 3 League Champions earn an automatic bid into the Annual Championship.',
    },
  },
  {
    id: 'mlb-tier-2',
    name: 'MLB Tier 2',
    supportedGames: ['MLB'],
    entryFee: '$350',
    championPrize: '$2,500',
    note: 'MLB uses the standard Tier 1 structure, but has its own Tier 2 pricing and payouts.',
    playoffPayouts: [
      { position: '1st', payout: '$250' },
      { position: '2nd-3rd', payout: '$125 each' },
      { position: '4th-5th', payout: '$60 each' },
      { position: '6th-8th', payout: '$30 each' },
    ],
  },
];

const leagueTierRules = [
  'MLB supports Tier 1 and MLB Tier 2 only.',
  'MLB does not have Tier 3.',
  'Do not apply the standard Tier 2 pricing to MLB.',
  'Do not apply MLB Tier 2 pricing to the other games.',
  'All eight playoff qualifiers receive a payout.',
  'The champion prize and playoff-position payout are displayed as separate values.',
];

function LeagueTierCard({ tier }: { tier: LeagueTier }) {
  return (
    <article className="preview-card league-tier-card" id={tier.id}>
      <p className="eyebrow">League Tier</p>
      <h2>{tier.name}</h2>
      {tier.note ? <p className="league-tier-card__note">{tier.note}</p> : null}

      <ul className="tag-list" aria-label={`${tier.name} supported games`}>
        {tier.supportedGames.map((game) => (
          <li key={`${tier.id}-${game}`}>{game}</li>
        ))}
      </ul>

      <dl className="league-tier-values">
        <div>
          <dt>Entry Fee</dt>
          <dd>{tier.entryFee}</dd>
        </div>
        <div>
          <dt>Champion Prize</dt>
          <dd>{tier.championPrize}</dd>
        </div>
      </dl>

      <div className="league-payout-panel">
        <h3>Playoff Payouts</h3>
        <dl className="league-payout-list">
          {tier.playoffPayouts.map((payout) => (
            <div key={`${tier.id}-${payout.position}`}>
              <dt>{payout.position}</dt>
              <dd>{payout.payout}</dd>
            </div>
          ))}
        </dl>
      </div>

      {tier.qualificationCallout ? (
        <div className="rule-note">
          <strong>{tier.qualificationCallout.title}</strong>
          <p>{tier.qualificationCallout.body}</p>
        </div>
      ) : null}
    </article>
  );
}

export function LeaguesPage() {
  return (
    <>
      <PageHeader
        title="Leagues"
        description="Compare GOATLAND league tiers by supported games, entry fees, champion prizes, and playoff-position payouts."
      />

      <section className="section league-tier-section">
        <div className="container">
          <SectionHeading
            eyebrow="League Format"
            title="The GOATLAND League Structure"
            description="Every standard League follows the same regular-season and playoff format."
          />
          <article className="league-important-panel">
            <ul className="feature-list">
              {standardLeagueStructureRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </article>

          <SectionHeading
            eyebrow="League Tiers"
            title="League Tiers and Payouts"
            description="Each tier keeps the champion prize separate from the playoff-position payout ladder."
          />

          <div className="league-tier-grid">
            {leagueTiers.map((tier) => (
              <LeagueTierCard key={tier.id} tier={tier} />
            ))}
          </div>
        </div>
      </section>

      <section className="section home-section home-section--alt">
        <div className="container">
          <article className="league-important-panel">
            <p className="eyebrow">Important</p>
            <h2>MLB Tier Rules</h2>
            <ul className="feature-list">
              {leagueTierRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </>
  );
}
