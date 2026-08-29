import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { League, LeagueDocument } from '../models/League';

const leaguesCollection = collection(db, 'leagues');
const LEAGUE_ID_SEPARATOR = '__league-';

export function getLeagueId(registrationOfferingId: string, leagueNumber: number): string {
  if (
    !registrationOfferingId
    || registrationOfferingId.includes('/')
    || registrationOfferingId.includes(LEAGUE_ID_SEPARATOR)
  ) {
    throw new Error('registrationOfferingId cannot be used in a League document ID.');
  }

  if (!Number.isInteger(leagueNumber) || leagueNumber < 1) {
    throw new Error('leagueNumber must be a positive integer.');
  }

  return `${registrationOfferingId}${LEAGUE_ID_SEPARATOR}${leagueNumber}`;
}

export async function getLeague(leagueId: string): Promise<League | null> {
  const snapshot = await getDoc(doc(leaguesCollection, leagueId));

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...(snapshot.data() as LeagueDocument),
  };
}

export async function getLeagues(): Promise<League[]> {
  const snapshot = await getDocs(query(leaguesCollection, orderBy('leagueNumber')));

  return snapshot.docs.map((leagueDocument) => ({
    id: leagueDocument.id,
    ...(leagueDocument.data() as LeagueDocument),
  }));
}

export async function getLeaguesByRegistrationOffering(
  registrationOfferingId: string,
): Promise<League[]> {
  const snapshot = await getDocs(
    query(leaguesCollection, where('registrationOfferingId', '==', registrationOfferingId)),
  );

  return snapshot.docs
    .map((leagueDocument) => ({
      id: leagueDocument.id,
      ...(leagueDocument.data() as LeagueDocument),
    }))
    .sort((firstLeague, secondLeague) => firstLeague.leagueNumber - secondLeague.leagueNumber);
}
