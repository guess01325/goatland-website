import { PageHeader } from '../components/PageHeader';
import { SectionHeading } from '../components/SectionHeading';

type RuleGroup = { title: string; items: string[]; note?: string };
type LeagueSchedule = { tier: string; startDates: string[]; matchDays: string[]; playoffDays: string[] };
type GameSettings = {
  name: string;
  settings?: { label: string; value: string }[];
  items?: string[];
  rotation?: string[];
  note?: string;
};

const leagueFormat = [
  'Maximum 16 players per League.',
  '5-week regular season.',
  '2 League matches per week.',
  'Competitive Best-of-5 format unless a game-specific format states otherwise.',
  'The top 8 players advance to the playoffs.',
  'Playoffs are single elimination.',
  'A League champion is crowned.',
];

const teamUseRules = [
  'For games that allow selectable teams, a player may not use the same team more than once during the same Best-of-5 League matchup.',
  'Once a player uses a team, that team is unavailable to that player for the remainder of the matchup.',
  "Team availability resets for the player's next League matchup.",
  'Published game-specific exceptions may override this general rule.',
];

const generalCompetitionRules: RuleGroup[] = [
  {
    title: 'Fair Competition',
    items: [
      'Players must compete fairly and respectfully.',
      'Cheating and unauthorized exploits are prohibited.',
      'Harassment and intentional interference with competition are prohibited.',
      'Players must follow the applicable game settings.',
    ],
  },
  {
    title: 'Match Responsibilities',
    items: [
      'Players are responsible for being available for scheduled matches.',
      'Players may be required to submit screenshots or other match evidence.',
      'Failure to appear for a scheduled match may result in a forfeit.',
    ],
  },
  {
    title: 'Review and Disputes',
    items: [
      'GOATLAND administrators may review evidence and resolve competition disputes according to the published rules.',
    ],
  },
  {
    title: 'Details Being Finalized',
    items: [
      'Exact result confirmation deadline',
      'Exact dispute filing window',
      'Exact forfeit score',
      'Double-forfeit procedure',
      'Standings tiebreakers',
      'Repeated-forfeit discipline thresholds',
      'Certain game-specific procedures',
      'Exact match start windows',
    ],
  },
];

const leagueSchedules: LeagueSchedule[] = [
  {
    tier: 'Tier 1 — Monday / Wednesday',
    startDates: [
      'Monday, October 5, 2026',
      'Monday, October 12, 2026',
      'Monday, October 19, 2026',
      'Monday, October 26, 2026',
    ],
    matchDays: ['Monday', 'Wednesday'],
    playoffDays: ['Tuesday', 'Wednesday', 'Thursday'],
  },
  {
    tier: 'Tier 1 — Wednesday / Sunday',
    startDates: [
      'Wednesday, October 7, 2026',
      'Wednesday, October 14, 2026',
      'Wednesday, October 21, 2026',
      'Wednesday, October 28, 2026',
    ],
    matchDays: ['Wednesday', 'Sunday'],
    playoffDays: ['Tuesday', 'Wednesday', 'Thursday'],
  },
  {
    tier: 'Tier 2 — Tuesday / Friday',
    startDates: [
      'Tuesday, October 6, 2026',
      'Tuesday, October 13, 2026',
      'Tuesday, October 20, 2026',
      'Tuesday, October 27, 2026',
    ],
    matchDays: ['Tuesday', 'Friday'],
    playoffDays: ['Wednesday', 'Thursday', 'Friday'],
  },
  {
    tier: 'Tier 3 — Thursday / Saturday',
    startDates: [
      'Thursday, October 1, 2026',
      'Thursday, October 8, 2026',
      'Thursday, October 15, 2026',
      'Thursday, October 22, 2026',
      'Thursday, October 29, 2026',
    ],
    matchDays: ['Thursday', 'Saturday'],
    playoffDays: ['Thursday', 'Friday', 'Saturday'],
  },
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
    note: 'Mercy-rule and certain game-specific procedures are still being finalized.',
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
    note: 'Mercy-rule and certain game-specific procedures are still being finalized.',
  },
  {
    name: 'NBA 2K',
    settings: [
      { label: 'Difficulty', value: 'Hall of Fame' },
      { label: 'Series', value: 'Best of 5' },
      { label: 'Games 1-4', value: '4 Minute Quarters' },
      { label: 'Game 5', value: '5 Minute Quarters' },
      { label: 'Fatigue', value: 'On' },
    ],
    note: 'Certain game-specific procedures are still being finalized.',
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
    note: 'Certain game-specific procedures are still being finalized.',
  },
  {
    name: 'Call of Duty',
    items: ['Official competitive/CDL direction', '4v4 Competition', 'Best-of-5 Rotation'],
    rotation: ['Hardpoint', 'Search & Destroy', 'Control', 'Hardpoint', 'Search & Destroy'],
    note: 'The applicable map pool, roster, substitution, map-veto, side-selection, and other game-specific procedures are still being finalized.',
  },
];

const refundRules: RuleGroup[] = [
  {
    title: 'Before League Start',
    items: [
      'If a registered player voluntarily withdraws before their League begins, the player is eligible for a 50% refund.',
      "The boundary is the actual start of that player's League.",
    ],
  },
  {
    title: 'After League Start',
    items: [
      'Once a League has begun, there are no refunds for voluntarily quitting, missing games, no-shows, or otherwise being unable to continue participating.',
    ],
  },
  {
    title: 'Player-Side Technical Issues',
    items: [
      'Refunds are not provided for player-side technical issues, including internet service, console issues, game access, EA / 2K / Activision account issues, equipment, or similar player-side technical failures.',
    ],
  },
  {
    title: 'Rule Violations',
    items: ['A player removed or banned because of a rules violation is not eligible for a refund.'],
  },
  {
    title: 'Normal Schedule Changes',
    items: ['Normal League scheduling or date adjustments do not automatically create a refund right.'],
  },
  {
    title: 'GOATLAND Cancellation or League Move',
    items: [
      "If GOATLAND must cancel or move a player's League, the registration is transferred to the next applicable League or League Start Date.",
      'The player has 24 hours after notification to decline the transfer.',
      'If the player declines within the 24-hour period, the player is eligible for a full refund.',
      'If the player does not decline within the 24-hour period, the registration remains transferred.',
    ],
  },
  {
    title: 'League Does Not Fill',
    items: [
      'There is no automatic refund solely because a League did not fill.',
      "The player's registration is moved to the next applicable League.",
    ],
  },
];

function RuleCards({ groups }: { groups: RuleGroup[] }) {
  return (
    <div className="rules-card-grid">
      {groups.map((group) => (
        <article className="preview-card rule-card" key={group.title}>
          <h2>{group.title}</h2>
          <ul className="feature-list">
            {group.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
          {group.note ? <p className="rule-note">{group.note}</p> : null}
        </article>
      ))}
    </div>
  );
}

export function RulesPage() {
  return (
    <>
      <PageHeader
        title="GOATLAND Preliminary Competition Rules"
        description="Current competition format, October 2026 League schedules, approved rules to date, and refund information."
      />

      <section className="section rules-section">
        <div className="container">
          <article className="preview-card rule-card">
            <p className="eyebrow">Preliminary Rules Notice</p>
            <h2>October 2026 League Launch</h2>
            <p>GOATLAND is currently finalizing portions of its competition rules for the October 2026 League launch.</p>
            <p>The information on this page reflects the current competition format and rules approved to date. Certain operational details, including specific reporting deadlines, dispute procedures, tiebreakers, forfeit scoring, and certain game-specific rules, may be clarified before League play begins.</p>
            <p>Before completing a paid registration, each player will be shown the applicable League Start Date, schedule, competition rules, and refund policy. The version of the competition rules and refund policy accepted during registration will be recorded with that registration.</p>
            <p>GOATLAND may make reasonable corrections, clarifications, or operational updates before competition begins. Registered players will be notified of any material change affecting their League.</p>
          </article>
        </div>
      </section>

      <section className="section rules-section">
        <div className="container">
          <SectionHeading eyebrow="Section 1" title="League Format and Registration" description="The approved structure for October 2026 League competition." />
          <RuleCards groups={[
            { title: 'League Format', items: leagueFormat },
            {
              title: 'Registration Path',
              items: ['Game → Tier → League Start Date → Available League'],
              note: 'Players choose their League Start Date and then an available League. If registration order is used, it is established only after successful payment confirmation; players do not select a registration-order number.',
            },
            { title: 'Team Use', items: teamUseRules },
            {
              title: 'Playoff Seeding',
              items: [
                'Final regular-season standings determine playoff seeding.',
                'League playoff series use a 2-2-1 home format based on final standings.',
              ],
              note: 'Regular-season home and away allocation details are still being finalized.',
            },
          ]} />
        </div>
      </section>

      <section className="section home-section home-section--alt rules-section">
        <div className="container">
          <SectionHeading eyebrow="Section 2" title="October 2026 League Schedules" description="Choose a League Start Date during registration. The selected date determines the applicable regular-season schedule." />
          <p className="rule-note rule-note--standalone">For Tier 1, the selected League Start Date determines whether regular-season matches are played Monday/Wednesday or Wednesday/Sunday.</p>
          <div className="rules-card-grid">
            {leagueSchedules.map((schedule) => (
              <article className="preview-card rule-card" key={schedule.tier}>
                <h2>{schedule.tier}</h2>
                <p className="eyebrow">League Start Dates</p>
                <ul className="feature-list">{schedule.startDates.map((date) => <li key={date}>{date}</li>)}</ul>
                <p className="eyebrow">Regular-Season Match Days</p>
                <ul className="feature-list">{schedule.matchDays.map((day) => <li key={day}>{day}</li>)}</ul>
                <p className="eyebrow">Playoff Days</p>
                <ul className="feature-list">{schedule.playoffDays.map((day) => <li key={day}>{day}</li>)}</ul>
              </article>
            ))}
          </div>
          <p className="rule-note rule-note--standalone">Specific playoff-round assignments and dates will be included in the final League schedule.</p>
        </div>
      </section>

      <section className="section rules-section">
        <div className="container">
          <SectionHeading eyebrow="Section 3" title="General Competition Rules" description="Approved standards for player conduct, match responsibilities, evidence, and review." />
          <RuleCards groups={generalCompetitionRules} />
        </div>
      </section>

      <section className="section home-section home-section--alt rules-section">
        <div className="container">
          <SectionHeading eyebrow="Section 4" title="League Game-Specific Settings" description="Current concrete settings for each supported GOATLAND game. Identified operational details remain preliminary." />
          <p>These settings apply to GOATLAND League play unless separate tournament rules state otherwise.</p>
          <div className="game-settings-grid">
            {gameSettings.map((game) => (
              <article className="preview-card game-settings-card" key={game.name}>
                <p className="eyebrow">{game.name}</p><h2>{game.name}</h2>
                {game.settings ? <dl className="settings-list">{game.settings.map((setting) => <div key={setting.label}><dt>{setting.label}</dt><dd>{setting.value}</dd></div>)}</dl> : null}
                {game.items ? <ul className="feature-list">{game.items.map((item) => <li key={item}>{item}</li>)}</ul> : null}
                {game.rotation ? <ol className="cod-rotation-list" aria-label="Call of Duty Best-of-5 rotation">{game.rotation.map((mode, index) => <li key={`${index}-${mode}`}>{mode}</li>)}</ol> : null}
                {game.note ? <p className="rule-note">{game.note}</p> : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section rules-section">
        <div className="container">
          <SectionHeading eyebrow="Section 5" title="Refund Policy" description="Current refund rules for League registrations. Refund processing is handled separately from this public explanation." />
          <RuleCards groups={refundRules} />
        </div>
      </section>

      <section className="section home-section home-section--alt">
        <div className="container tournament-rules">
          <SectionHeading eyebrow="Section 6" title="Annual Tournaments" description="Annual tournaments follow separate qualification and competition rules from League play." />
          <p className="rule-note rule-note--standalone">Applicable tournament qualification and competition details will be published before tournament registration opens.</p>
        </div>
      </section>

      <footer className="section legal-section">
        <div className="container">
          <p><strong>Last Updated: August 29, 2026</strong></p>
          <p>These preliminary rules will be replaced by the applicable finalized competition rules and refund policy presented during registration. Registered players should retain the rules and policies applicable to their registration.</p>
        </div>
      </footer>
    </>
  );
}
