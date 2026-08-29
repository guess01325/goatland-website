export const CURRENT_COMPETITION_RULES_VERSION = 'competition-rules-2026-08-29-v1';
export const CURRENT_REFUND_POLICY_VERSION = 'refund-policy-2026-08-29-v1';
export const REGISTRATION_POLICIES_EFFECTIVE_DATE = 'August 29, 2026';
export const COMPETITION_RULES_ANCHOR = 'competition-rules';
export const REFUND_POLICY_ANCHOR = 'refund-policy';

export type PolicySection = {
  title: string;
  items: readonly string[];
  note?: string;
};

export const competitionPolicySections: readonly PolicySection[] = [
  {
    title: 'League Structure',
    items: [
      'Maximum 16 players per League.',
      'Five-week regular season.',
      'Two League matches per week.',
      'Matchups are best-of-five unless applicable game-specific rules establish a different format.',
      'The top eight players advance to the playoffs.',
      'Playoffs are single elimination.',
      'A League champion is crowned.',
    ],
  },
  {
    title: 'Registration',
    items: [
      'Players choose a Game, Tier, League Start Date, and League.',
      "Successful payment confirms the player's Registration.",
      'Registration order is assigned only after successful payment confirmation.',
      'Players do not manually choose their registration-order number.',
    ],
  },
  {
    title: 'Team Use',
    items: [
      'Within a best-of-five matchup, a player may not reuse the same selectable team.',
      'Once used, that team remains unavailable to that player for the remainder of that matchup.',
      "Team availability resets for the player's next matchup.",
      'Applicable published game-specific rules may establish an exception where necessary for that game.',
    ],
  },
  {
    title: 'Fair Competition',
    items: [
      'Players must compete fairly and respectfully.',
      'Cheating and unauthorized exploits are prohibited.',
      'Harassment and intentional interference with competition are prohibited.',
      'Players must follow applicable published game-specific settings.',
    ],
  },
  {
    title: 'Match Responsibilities and Review',
    items: [
      'Players are responsible for participating in scheduled matches.',
      'Players may be required to submit screenshots or other match evidence.',
      'Failure to appear for a scheduled match may result in a forfeit.',
      'GOATLAND administrators may review submitted evidence and resolve matters according to the applicable published rules.',
    ],
  },
  {
    title: 'Supplemental Rules',
    items: [
      "GOATLAND may publish additional game-specific, scheduling, match-reporting, dispute, forfeit, tiebreaker, and other competition procedures before a player's League begins.",
      'Registered players will be notified when supplemental rules applicable to their League are published.',
      'Once published, those supplemental rules become part of the rules governing that League.',
      'Supplemental rules do not retroactively alter a completed match or previously decided result.',
      'Routine supplemental rules do not silently make material changes to the entry fee, Refund Policy, prize terms, eligibility requirements, or the basic five-week, two-match-per-week, playoff League structure.',
    ],
  },
  {
    title: 'Rule Sources',
    items: [
      'The Base League Competition Rules govern the approved League structure and general competition standards.',
      'Applicable published game-specific and supplemental rules govern their identified game or operational subjects.',
      'The published League schedule governs applicable League dates and match days.',
    ],
  },
];

export const refundPolicySections: readonly PolicySection[] = [
  {
    title: 'Voluntary Withdrawal Before League Start',
    items: [
      "If a player voluntarily withdraws before that player's League begins, the player is eligible for a 50% refund.",
    ],
  },
  {
    title: 'After League Start',
    items: [
      'After the League begins, there is no refund when a player quits, misses games, no-shows, cannot continue participating, or otherwise backs out.',
    ],
  },
  {
    title: 'Player-Side Technical Problems',
    items: [
      'Refunds are not provided for player-side technical problems, including internet, console, game access, account, equipment, or similar player-side issues.',
    ],
  },
  {
    title: 'Rule Violation or Ban',
    items: ['A player removed or banned for a rules violation is not eligible for a refund.'],
  },
  {
    title: 'Normal Schedule Changes',
    items: ['A normal League schedule or date adjustment does not automatically create a refund right.'],
  },
  {
    title: 'GOATLAND Cancellation or League Move',
    items: [
      "If GOATLAND cancels or moves the applicable League, the player's Registration is transferred to the next applicable League or League Start Date.",
      'The player has 24 hours after notification to decline the transfer.',
      'A player who declines within 24 hours is eligible for a full refund.',
      'If the player does not decline within 24 hours, the transfer remains.',
    ],
  },
  {
    title: 'League Does Not Fill',
    items: [
      'A League failing to fill does not automatically result in a refund.',
      "The player's Registration moves to the next applicable League or League Start Date.",
    ],
  },
];

export type PublishedLeagueSchedule = {
  tier: string;
  startDates: readonly string[];
  matchDays: readonly string[];
  playoffDays: readonly string[];
};

export const october2026LeagueSchedules: readonly PublishedLeagueSchedule[] = [
  {
    tier: 'Tier 1 — Monday / Wednesday',
    startDates: ['Monday, October 5, 2026', 'Monday, October 12, 2026', 'Monday, October 19, 2026', 'Monday, October 26, 2026'],
    matchDays: ['Monday', 'Wednesday'],
    playoffDays: ['Tuesday', 'Wednesday', 'Thursday'],
  },
  {
    tier: 'Tier 1 — Wednesday / Sunday',
    startDates: ['Wednesday, October 7, 2026', 'Wednesday, October 14, 2026', 'Wednesday, October 21, 2026', 'Wednesday, October 28, 2026'],
    matchDays: ['Wednesday', 'Sunday'],
    playoffDays: ['Tuesday', 'Wednesday', 'Thursday'],
  },
  {
    tier: 'Tier 2 — Tuesday / Friday',
    startDates: ['Tuesday, October 6, 2026', 'Tuesday, October 13, 2026', 'Tuesday, October 20, 2026', 'Tuesday, October 27, 2026'],
    matchDays: ['Tuesday', 'Friday'],
    playoffDays: ['Wednesday', 'Thursday', 'Friday'],
  },
  {
    tier: 'Tier 3 — Thursday / Saturday',
    startDates: ['Thursday, October 1, 2026', 'Thursday, October 8, 2026', 'Thursday, October 15, 2026', 'Thursday, October 22, 2026', 'Thursday, October 29, 2026'],
    matchDays: ['Thursday', 'Saturday'],
    playoffDays: ['Thursday', 'Friday', 'Saturday'],
  },
];
