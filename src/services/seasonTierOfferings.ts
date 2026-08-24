import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  SeasonTierOffering,
  SeasonTierOfferingDocument,
} from '../models/SeasonTierOffering';

const seasonTierOfferingsCollection = collection(db, 'seasonTierOfferings');

export async function getSeasonTierOffering(
  offeringId: string,
): Promise<SeasonTierOffering | null> {
  const snapshot = await getDoc(doc(seasonTierOfferingsCollection, offeringId));

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...(snapshot.data() as SeasonTierOfferingDocument),
  };
}

export async function getSeasonTierOfferings(): Promise<SeasonTierOffering[]> {
  const snapshot = await getDocs(
    query(seasonTierOfferingsCollection, orderBy('registrationOpensAt', 'desc')),
  );

  return snapshot.docs.map((offeringDocument) => ({
    id: offeringDocument.id,
    ...(offeringDocument.data() as SeasonTierOfferingDocument),
  }));
}
