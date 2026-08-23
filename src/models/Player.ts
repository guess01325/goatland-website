import type { Timestamp } from 'firebase/firestore';

export type Player = {
  displayName: string;
  email: string;
  dateOfBirth: string;
  state: string;
  accountStatus: 'active';
  profileComplete: true;
  rulesVersionAccepted: string;
  rulesAcceptedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type CreatePlayerInput = Pick<Player, 'displayName' | 'dateOfBirth' | 'state'>;
