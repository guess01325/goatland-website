import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
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
