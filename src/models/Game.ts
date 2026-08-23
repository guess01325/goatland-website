import type { Timestamp } from 'firebase/firestore';

export const GAME_STATUSES = ['coming_soon', 'active', 'inactive', 'retired'] as const;

export type GameStatus = (typeof GAME_STATUSES)[number];

export type Game = {
  id: string;
  name: string;
  slug: string;
  edition: string | null;
  status: GameStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type GameDocument = Omit<Game, 'id'>;
