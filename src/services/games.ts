import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Game, GameDocument } from '../models/Game';

const gamesCollection = collection(db, 'games');

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
