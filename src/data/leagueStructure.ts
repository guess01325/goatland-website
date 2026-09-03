export const STANDARD_LEAGUE_STRUCTURE = {
  players: 16,
  regularSeasonWeeks: 5,
  matchesPerWeek: 2,
  playoffQualifiers: 8,
  playoffWeek: 6,
} as const;

export const standardLeagueStructureRules = [
  `${STANDARD_LEAGUE_STRUCTURE.players} players per League.`,
  `${STANDARD_LEAGUE_STRUCTURE.regularSeasonWeeks}-week regular season.`,
  `${STANDARD_LEAGUE_STRUCTURE.matchesPerWeek} League matches per week.`,
  `The top ${STANDARD_LEAGUE_STRUCTURE.playoffQualifiers} players advance to the playoffs.`,
  `Playoffs take place in Week ${STANDARD_LEAGUE_STRUCTURE.playoffWeek}.`,
] as const;
