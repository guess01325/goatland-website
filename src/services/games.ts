import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Game, GameDocument } from '../models/Game';

const gamesCollection = collection(db, 'games');
const TEAM_REGISTRATION_GAME_ID = 'call-of-duty';

export function isIndividualRegistrationGameSelectable(
  { id, status }: Pick<Game, 'id' | 'status'>,
): boolean {
  return status === 'active' && id !== TEAM_REGISTRATION_GAME_ID;
}

export async function getGame(gameId: string): Promise<Game | null> {
  const snapshot = await getDoc(doc(gamesCollection, gameId));

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...(snapshot.data() as GameDocument),
  };
}

export async function getGames(): Promise<Game[]> {
  const snapshot = await getDocs(query(gamesCollection, orderBy('name')));

  return snapshot.docs.map((gameDocument) => ({
    id: gameDocument.id,
    ...(gameDocument.data() as GameDocument),
  }));
}

export async function getRegistrationGames(): Promise<Game[]> {
  const games = await getGames();

  return games.filter(({ status }) => status === 'active' || status === 'coming_soon');
}
