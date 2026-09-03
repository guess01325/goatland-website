import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Game, GameDocument } from '../models/Game';

const gamesCollection = collection(db, 'games');
const INDIVIDUAL_REGISTRATION_EXCLUDED_GAME_ID = 'call-of-duty';

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

  return games.filter(({ id, status }) => (
    id !== INDIVIDUAL_REGISTRATION_EXCLUDED_GAME_ID
    && (status === 'active' || status === 'coming_soon')
  ));
}
