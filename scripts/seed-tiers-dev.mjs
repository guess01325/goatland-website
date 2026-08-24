/* global console, process, URL */
import { readFileSync } from 'node:fs';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const tiers = [
  {
    id: 'tier-1',
    name: 'Tier 1',
    level: 1,
    status: 'active',
  },
  {
    id: 'tier-2',
    name: 'Tier 2',
    level: 2,
    status: 'active',
  },
  {
    id: 'tier-3',
    name: 'Tier 3',
    level: 3,
    status: 'active',
  },
];

function getArgument(name) {
  const argument = process.argv.find((value) => value.startsWith(`${name}=`));
  return argument?.slice(name.length + 1);
}

const firebaseConfig = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8'));
const projectId = firebaseConfig.projects?.dev;
const confirmedProjectId = getArgument('--confirm-project');

if (!projectId || typeof projectId !== 'string') {
  throw new Error('No development Firebase project is configured at projects.dev in .firebaserc.');
}

if (!/(^|[-_])(dev|development)([-_]|$)/i.test(projectId)) {
  throw new Error(`Refusing to seed project "${projectId}" because it is not clearly a development project.`);
}

console.log('GOATLAND DEVELOPMENT TIER SEED');
console.log(`Target Firebase project: ${projectId}`);
console.log(`Firestore target: ${process.env.FIRESTORE_EMULATOR_HOST ?? 'remote development project'}`);
console.log(`Documents: ${tiers.map((tier) => `tiers/${tier.id}`).join(', ')}`);

if (confirmedProjectId !== projectId) {
  throw new Error(
    `Seed not confirmed. Re-run with --confirm-project=${projectId} after verifying the target above.`,
  );
}

const app = getApps()[0] ?? initializeApp({
  credential: applicationDefault(),
  projectId,
});
const firestore = getFirestore(app);
const batch = firestore.batch();

for (const { id, ...tier } of tiers) {
  const timestamp = FieldValue.serverTimestamp();
  batch.create(firestore.collection('tiers').doc(id), {
    ...tier,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

await batch.commit();
console.log(`Seeded ${tiers.length} Tier documents in Firebase project ${projectId}.`);
