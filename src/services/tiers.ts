import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Tier, TierDocument } from '../models/Tier';

const tiersCollection = collection(db, 'tiers');

export async function getTier(tierId: string): Promise<Tier | null> {
  const snapshot = await getDoc(doc(tiersCollection, tierId));

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...(snapshot.data() as TierDocument),
  };
}

export async function getTiers(): Promise<Tier[]> {
  const snapshot = await getDocs(query(tiersCollection, orderBy('level')));

  return snapshot.docs.map((tierDocument) => ({
    id: tierDocument.id,
    ...(tierDocument.data() as TierDocument),
  }));
}
