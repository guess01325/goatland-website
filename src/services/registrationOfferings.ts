import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  RegistrationOffering,
  RegistrationOfferingDocument,
} from '../models/RegistrationOffering';

const registrationOfferingsCollection = collection(db, 'registrationOfferings');

export async function getRegistrationOffering(
  offeringId: string,
): Promise<RegistrationOffering | null> {
  const snapshot = await getDoc(doc(registrationOfferingsCollection, offeringId));

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...(snapshot.data() as RegistrationOfferingDocument),
  };
}

export async function getRegistrationOfferings(): Promise<RegistrationOffering[]> {
  const snapshot = await getDocs(
    query(registrationOfferingsCollection, orderBy('registrationOpensAt', 'desc')),
  );

  return snapshot.docs.map((offeringDocument) => ({
    id: offeringDocument.id,
    ...(offeringDocument.data() as RegistrationOfferingDocument),
  }));
}

export async function getRegistrationOfferingsForLeagueStartAndTier(
  leagueStartId: string,
  tierId: string,
): Promise<RegistrationOffering[]> {
  const snapshot = await getDocs(
    query(registrationOfferingsCollection, where('leagueStartId', '==', leagueStartId)),
  );

  return snapshot.docs
    .map((offeringDocument) => ({
      id: offeringDocument.id,
      ...(offeringDocument.data() as RegistrationOfferingDocument),
    }))
    .filter((offering) => offering.tierId === tierId);
}
