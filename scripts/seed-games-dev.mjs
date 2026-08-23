/* global console, process, URL */
import { readFileSync } from 'node:fs';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const games = [
  {
    id: 'madden-27',
    name: 'Madden',
    slug: 'madden-27',
    edition: '27',
    status: 'coming_soon',
  },
  {
    id: 'college-football-27',
    name: 'EA Sports College Football',
    slug: 'college-football-27',
    edition: '27',
    status: 'coming_soon',
  },
  {
    id: 'nba-2k27',
    name: 'NBA 2K',
    slug: 'nba-2k27',
    edition: '2K27',
    status: 'coming_soon',
  },
  {
    id: 'call-of-duty',
    name: 'Call of Duty',
    slug: 'call-of-duty',
    edition: null,
    status: 'coming_soon',
  },
  {
    id: 'mlb-27',
    name: 'MLB 27',
    slug: 'mlb-27',
    edition: '27',
    status: 'coming_soon',
  },
  {
    id: 'madden-ultimate-team',
    name: 'Madden Ultimate Team',
    slug: 'madden-ultimate-team',
    edition: '27',
    status: 'coming_soon',
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

console.log('GOATLAND DEVELOPMENT GAME SEED');
console.log(`Target Firebase project: ${projectId}`);
console.log(`Firestore target: ${process.env.FIRESTORE_EMULATOR_HOST ?? 'remote development project'}`);
console.log(`Documents: ${games.map((game) => `games/${game.id}`).join(', ')}`);

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

for (const { id, ...game } of games) {
  const timestamp = FieldValue.serverTimestamp();
  batch.create(firestore.collection('games').doc(id), {
    ...game,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

await batch.commit();
console.log(`Seeded ${games.length} Game documents in Firebase project ${projectId}.`);
