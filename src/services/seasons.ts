import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Season, SeasonDocument } from '../models/Season';

const seasonsCollection = collection(db, 'seasons');

export async function getSeason(seasonId: string): Promise<Season | null> {
  const snapshot = await getDoc(doc(seasonsCollection, seasonId));

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...(snapshot.data() as SeasonDocument),
  };
}

export async function getSeasons(): Promise<Season[]> {
  const snapshot = await getDocs(query(seasonsCollection, orderBy('startsAt', 'desc')));

  return snapshot.docs.map((seasonDocument) => ({
    id: seasonDocument.id,
    ...(seasonDocument.data() as SeasonDocument),
  }));
}
