export type GameAccent = 'football' | 'college-football' | 'basketball' | 'tactical' | 'baseball';

export type GameDetailSummary = {
  eyebrow: string;
  title: string;
  items: string[];
};

export type GameCallToAction = {
  label: string;
  path: string;
  variant?: 'secondary';
};

export type GameLandingDetail = {
  label: string;
  value: string;
};

export type SupportedGame = {
  id: string;
  name: string;
  shortName: string;
  path: string;
  accent: GameAccent;
  description: string;
  tags: string[];
  heroTitle: string;
  heroDescription: string;
  overview: string;
  competitionOptions: string[];
  howItWorks: string[];
  statusTitle: string;
  statusText: string;
  landingDetails?: GameLandingDetail[];
  landingCallsToAction?: GameCallToAction[];
  detailSummaries?: GameDetailSummary[];
  callsToAction?: GameCallToAction[];
};

export const trademarkDisclaimer =
  'GOATLAND is an independent competition platform and is not affiliated with or endorsed by Electronic Arts, EA SPORTS, 2K, Activision, Major League Baseball, or their respective publishers. All game names, trademarks, and related properties belong to their respective owners.';

export const supportedGames: SupportedGame[] = [
  {
    id: 'madden',
    name: 'Madden',
    shortName: 'Madden',
    path: '/games/madden',
    accent: 'football',
    description:
      'Compete through structured Madden leagues, regular seasons, standings, playoffs, player progression, and annual tournament support.',
    tags: ['Competitive Leagues', 'Regular Seasons', 'Playoffs', 'Player Rankings'],
    heroTitle: 'Madden Competition at GOATLAND',
    heroDescription:
      'Compete in structured Madden leagues, scheduled matchups, standings, playoffs, annual tournament support, and player progression systems.',
    overview:
      'GOATLAND Madden competition is designed for players who want more than random online games. Players will compete through organized formats where every matchup contributes to standings, reputation, and postseason opportunities.',
    competitionOptions: [
      'Seasonal Madden leagues',
      'Weekly scheduled matchups',
      'Standings and playoff qualification',
      'Player history and progression',
      'Annual tournament support',
    ],
    howItWorks: [
      'Register for an available Madden competition.',
      'Receive your regular season schedule.',
      'Complete games within the required competition window.',
      'Submit or confirm results.',
      'Advance through standings, playoffs, and player progression.',
    ],
    statusTitle: 'Madden League registration is open.',
    statusText:
      'Choose an available October 2026 League Start Date on the Registration page. Payment confirmation will launch separately for submitted Registrations.',
    landingDetails: [
      { label: 'Supported Tiers', value: 'Tier 1, Tier 2, Tier 3' },
      {
        label: 'Match Format',
        value:
          'Best of 5; Games 1–4: 3 Minute Quarters; Game 5: 5 Minute Quarters; Difficulty: All-Madden',
      },
      { label: 'Annual Tournament', value: 'Super GOAT Bowl' },
    ],
    detailSummaries: [
      {
        eyebrow: 'Supported Tiers',
        title: 'Tier 1, Tier 2, and Tier 3',
        items: ['Tier 1', 'Tier 2', 'Tier 3'],
      },
      {
        eyebrow: 'League Format',
        title: 'Structured league play',
        items: ['Competitive leagues', 'Regular seasons', 'Standings', 'Playoffs'],
      },
      {
        eyebrow: 'Match Format',
        title: 'Scheduled matchups',
        items: ['Weekly matchups', 'Results contribute to standings', 'Annual tournament support'],
      },
    ],
    callsToAction: [
      { label: 'View Leagues', path: '/leagues' },
      { label: 'View Rules', path: '/rules', variant: 'secondary' },
    ],
  },
  {
    id: 'college-football',
    name: 'EA Sports College Football',
    shortName: 'College Football',
    path: '/games/college-football',
    accent: 'college-football',
    description:
      'Represent your team, compete through organized seasons, and build your reputation across the GOATLAND community.',
    tags: ['League Seasons', 'Team-Based Competition', 'Playoffs', 'Progression Tracking'],
    heroTitle: 'College Football Competition at GOATLAND',
    heroDescription:
      'Build your reputation through organized College Football leagues, regular seasons, team-based competition, annual tournament support, and progression tracking.',
    overview:
      'GOATLAND College Football competition will give players a structured place to represent their teams, compete through organized seasons, and earn recognition through performance.',
    competitionOptions: [
      'Organized league seasons',
      'Team selection rules',
      'Standings and playoff qualification',
      'Player progression and history',
      'Annual tournament support',
    ],
    howItWorks: [
      'Choose an available competition.',
      'Review team-selection and matchup rules.',
      'Complete scheduled games within the competition window.',
      'Report results through the GOATLAND system.',
      'Compete for playoff placement, progression, and recognition.',
    ],
    statusTitle: 'College Football League registration is open.',
    statusText:
      'Choose an available October 2026 League Start Date on the Registration page. Payment confirmation will launch separately for submitted Registrations.',
    landingDetails: [
      { label: 'Supported Tiers', value: 'Tier 1, Tier 2, Tier 3' },
      {
        label: 'Match Format',
        value:
          'Best of 5; Games 1–4: 3 Minute Quarters; Game 5: 5 Minute Quarters; Difficulty: Heisman',
      },
      { label: 'Annual Tournament', value: 'GOAT Bowl' },
    ],
    detailSummaries: [
      {
        eyebrow: 'Supported Tiers',
        title: 'Tier 1, Tier 2, and Tier 3',
        items: ['Tier 1', 'Tier 2', 'Tier 3'],
      },
      {
        eyebrow: 'League Format',
        title: 'Organized league seasons',
        items: ['Competitive leagues', 'Regular seasons', 'Standings', 'Playoffs'],
      },
      {
        eyebrow: 'Match Format',
        title: 'Team-based competition',
        items: ['Team selection rules', 'Scheduled games', 'Annual tournament support'],
      },
    ],
    callsToAction: [
      { label: 'View Leagues', path: '/leagues' },
      { label: 'View Rules', path: '/rules', variant: 'secondary' },
    ],
  },
  {
    id: 'nba-2k',
    name: 'NBA 2K',
    shortName: 'NBA 2K',
    path: '/games/nba-2k',
    accent: 'basketball',
    description:
      'Compete in organized NBA 2K leagues built around consistency, skill, seasonal standings, player progression, and annual tournament support.',
    tags: ['Competitive Matchups', 'Seasonal Standings', 'Playoffs', 'Player Progression'],
    heroTitle: 'NBA 2K Competition at GOATLAND',
    heroDescription:
      'Compete in organized NBA 2K leagues built around skill, consistency, standings, playoffs, annual tournament support, and player recognition.',
    overview:
      'GOATLAND NBA 2K competition will provide a structured alternative to unorganized matchups by giving players clear schedules, rules, standings, and progression opportunities.',
    competitionOptions: [
      'Competitive leagues',
      'Scheduled matchups',
      'Seasonal standings',
      'Player progression and competition history',
      'Annual tournament support',
    ],
    howItWorks: [
      'Register for an available NBA 2K competition.',
      'Review the competition format and game rules.',
      'Complete scheduled matchups.',
      'Confirm scores and results.',
      'Move through standings, playoffs, and player progression.',
    ],
    statusTitle: 'NBA 2K League registration is open.',
    statusText:
      'Choose an available October 2026 League Start Date on the Registration page. Payment confirmation will launch separately for submitted Registrations.',
    landingDetails: [
      { label: 'Supported Tiers', value: 'Tier 1, Tier 2, Tier 3' },
      {
        label: 'Match Format',
        value:
          'Best of 5; Games 1–4: 4 Minute Quarters; Game 5: 5 Minute Quarters; Difficulty: Hall of Fame',
      },
      { label: 'Annual Tournament', value: 'GOATLAND Classic' },
    ],
    detailSummaries: [
      {
        eyebrow: 'Supported Tiers',
        title: 'Tier 1, Tier 2, and Tier 3',
        items: ['Tier 1', 'Tier 2', 'Tier 3'],
      },
      {
        eyebrow: 'League Format',
        title: 'Seasonal league play',
        items: ['Competitive leagues', 'Regular seasons', 'Seasonal standings', 'Playoffs'],
      },
      {
        eyebrow: 'Match Format',
        title: 'Competitive matchups',
        items: ['Scheduled matchups', 'Confirmed results', 'Annual tournament support'],
      },
    ],
    callsToAction: [
      { label: 'View Leagues', path: '/leagues' },
      { label: 'View Rules', path: '/rules', variant: 'secondary' },
    ],
  },
  {
    id: 'call-of-duty',
    name: 'Call of Duty',
    shortName: 'Call of Duty',
    path: '/games/call-of-duty',
    accent: 'tactical',
    description:
      'Join structured Call of Duty competitions featuring team-based league formats, multi-map series, standings, playoffs, and annual tournament support.',
    tags: ['Team Competition', 'Best-of Series', 'League Standings', 'Playoffs'],
    heroTitle: 'Call of Duty Competition at GOATLAND',
    heroDescription:
      'Join structured Call of Duty competitions featuring team-based formats, multi-map series, standings, playoffs, and annual tournament support.',
    overview:
      'GOATLAND Call of Duty competition is designed around organized team play. Competition formats may include multi-map series, scheduled league matches, standings, playoff qualification, and annual tournament support.',
    competitionOptions: [
      'Team-based leagues',
      'Best-of series',
      'Multi-map competition',
      'Standings and postseason qualification',
      'Annual tournament support',
    ],
    howItWorks: [
      'Register a team or join an available competition.',
      'Review the approved modes, maps, and series format.',
      'Complete each scheduled series.',
      'Submit match and map results.',
      'Advance based on standings, series wins, playoff placement, and player progression.',
    ],
    statusTitle: 'Modes, maps, and official formats are being finalized.',
    statusText:
      'Final Call of Duty rules are coming soon and will remain clearly marked as pending until the approved format is added to the blueprint.',
    landingDetails: [
      { label: 'Supported Tiers', value: 'Tier 1, Tier 2, Tier 3' },
      {
        label: 'Match Format',
        value:
          'Best of 5; Rotation: Game 1 — Hardpoint; Game 2 — Search & Destroy; Game 3 — Control; Game 4 — Hardpoint; Game 5 — Search & Destroy; Difficulty: Official CDL Rules',
      },
      { label: 'Annual Tournament', value: 'Not Available' },
    ],
    detailSummaries: [
      {
        eyebrow: 'Supported Tiers',
        title: 'Tier 1, Tier 2, and Tier 3',
        items: ['Tier 1', 'Tier 2', 'Tier 3'],
      },
      {
        eyebrow: 'League Format',
        title: 'Team-based league play',
        items: ['Competitive leagues', 'Regular seasons', 'League standings', 'Playoffs'],
      },
      {
        eyebrow: 'Match Format',
        title: 'Best-of series',
        items: ['Team competition', 'Multi-map competition', 'Annual tournament support'],
      },
    ],
    callsToAction: [
      { label: 'View Leagues', path: '/leagues' },
      { label: 'View Rules', path: '/rules', variant: 'secondary' },
    ],
  },
  {
    id: 'mlb-27',
    name: 'MLB 27',
    shortName: 'MLB 27',
    path: '/games/mlb-27',
    accent: 'baseball',
    description:
      'Compete in MLB 27 leagues with Tier 1 and Tier 2 support, structured league play, and best-of-five match formats.',
    tags: ['Tier 1', 'Tier 2', 'Best of 5'],
    heroTitle: 'MLB 27 Competition at GOATLAND',
    heroDescription:
      'Join structured MLB 27 league play with Tier 1 and Tier 2 support, playoff qualification, and best-of-five match formats.',
    overview:
      'GOATLAND MLB 27 competition gives players structured league paths across Tier 1 and Tier 2 with a clear match format and playoff path.',
    competitionOptions: [
      'Tier 1',
      'Tier 2',
      'Best of 5',
      'Games 1–4: 7 Innings',
      'Game 5: 9 Innings',
      'Difficulty: GOAT',
    ],
    howItWorks: [
      'Choose an MLB Tier 1 or Tier 2 league.',
      'Compete through a five-week regular season with two matches per week.',
      'Play best-of-five matches during the league schedule.',
      'Finish in the top 8 to qualify for the playoffs.',
    ],
    statusTitle: 'MLB 27 supports Tier 1 and Tier 2.',
    statusText: 'Review the Leagues and Rules pages for current MLB 27 competition details.',
    landingDetails: [
      { label: 'Supported Tiers', value: 'Tier 1, Tier 2' },
      {
        label: 'Match Format',
        value: 'Best of 5; Games 1–4: 7 Innings; Game 5: 9 Innings; Difficulty: GOAT',
      },
      { label: 'Annual Tournament', value: 'Not Available' },
    ],
    landingCallsToAction: [
      { label: 'View Leagues', path: '/leagues' },
      { label: 'View Rules', path: '/rules', variant: 'secondary' },
    ],
    detailSummaries: [
      {
        eyebrow: 'Supported Tiers',
        title: 'Tier 1 and Tier 2',
        items: ['Tier 1', 'Tier 2'],
      },
      {
        eyebrow: 'League Format',
        title: '16-player season structure',
        items: [
          '16-player leagues',
          'Five-week regular season',
          'Two matches per week',
          'Playoffs',
          'Top 8 qualify',
          'Random schedule',
        ],
      },
      {
        eyebrow: 'Match Format',
        title: 'Best-of-five series play',
        items: ['Best of 5', 'Games 1–4: 7 Innings', 'Game 5: 9 Innings', 'Difficulty: GOAT'],
      },
    ],
    callsToAction: [
      { label: 'View Leagues', path: '/leagues' },
      { label: 'View Rules', path: '/rules', variant: 'secondary' },
    ],
  },
];

export function getGameById(id: string) {
  return supportedGames.find((game) => game.id === id);
}
