export type NavItem = {
  label: string;
  path: string;
};

export const mainNavItems: NavItem[] = [
  { label: 'Home', path: '/' },
  { label: 'Leagues', path: '/leagues' },
  { label: 'Tournaments', path: '/tournaments' },
  { label: 'Games', path: '/games' },
  { label: 'Player Progression', path: '/player-progression' },
  { label: 'Rules', path: '/rules' },
  { label: 'Contact', path: '/contact' },
];

export const footerNavItems: NavItem[] = [
  ...mainNavItems,
  { label: 'Social Media', path: '/social-media' },
];
