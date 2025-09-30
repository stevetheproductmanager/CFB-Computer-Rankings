
export const ENDPOINTS = [
  { slug: 'conferences', candidates: ['/conferences'] },
  { slug: 'divisions', candidates: ['/divisions'] },
  { slug: 'venues', candidates: ['/venues'] },

  { slug: 'teams', candidates: ['/teams?year={year}', '/teams?season={year}'] },
  { slug: 'teams-fbs', candidates: ['/teams/fbs?year={year}', '/teams?season={year}&classification=fbs'] },

  { slug: 'games-regular', candidates: ['/games?year={year}&seasonType=regular', '/games?season={year}&seasonType=regular'] },
  { slug: 'games-postseason', candidates: ['/games?year={year}&seasonType=postseason', '/games?season={year}&seasonType=postseason'] },

  { slug: 'games-lines', candidates: ['/lines?year={year}', '/betting/lines?season={year}'] },
  { slug: 'games-spreads', candidates: ['/lines/spreads?year={year}', '/betting/lines/spreads?season={year}'] },
  { slug: 'games-totals', candidates: ['/lines/totals?year={year}', '/betting/lines/totals?season={year}'] },

  { slug: 'polls-rankings', candidates: ['/rankings?year={year}', '/rankings?season={year}'] },
  { slug: 'records', candidates: ['/records?year={year}', '/records?season={year}'] },

  { slug: 'stats-team-season', candidates: ['/stats/season?year={year}', '/stats/season?season={year}'] },
  { slug: 'stats-player-season', candidates: ['/stats/player/season?year={year}', '/stats/player/season?season={year}'] },

  { slug: 'recruiting-players', candidates: ['/recruiting/players?year={year}', '/recruiting/players?season={year}'] },
  { slug: 'recruiting-teams', candidates: ['/recruiting/teams?year={year}', '/recruiting/teams?season={year}'] },

  { slug: 'elo-ratings', candidates: ['/ratings/elo?year={year}', '/ratings/elo?season={year}'] },
  { slug: 'sp-ratings', candidates: ['/ratings/sp?year={year}', '/ratings/sp?season={year}'] }
];
