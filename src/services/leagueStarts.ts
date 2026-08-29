import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { LeagueStart, LeagueStartDocument } from '../models/LeagueStart';

const leagueStartsCollection = collection(db, 'leagueStarts');

export async function getLeagueStart(leagueStartId: string): Promise<LeagueStart | null> {
  const snapshot = await getDoc(doc(leagueStartsCollection, leagueStartId));

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...(snapshot.data() as LeagueStartDocument),
  };
}

export async function getLeagueStarts(): Promise<LeagueStart[]> {
  const snapshot = await getDocs(query(leagueStartsCollection, orderBy('startsAt', 'desc')));

  return snapshot.docs.map((leagueStartDocument) => ({
    id: leagueStartDocument.id,
    ...(leagueStartDocument.data() as LeagueStartDocument),
  }));
}

export async function getLeagueStartsForGame(gameId: string): Promise<LeagueStart[]> {
  const snapshot = await getDocs(
    query(leagueStartsCollection, where('gameId', '==', gameId)),
  );

  return snapshot.docs
    .map((leagueStartDocument) => ({
      id: leagueStartDocument.id,
      ...(leagueStartDocument.data() as LeagueStartDocument),
    }))
    .sort((first, second) => {
      const firstMillis = first.startsAt?.toMillis() ?? Number.POSITIVE_INFINITY;
      const secondMillis = second.startsAt?.toMillis() ?? Number.POSITIVE_INFINITY;
      return firstMillis - secondMillis;
    });
}
