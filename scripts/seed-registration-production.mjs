/* global console, process */
import { initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PROJECT_ID = 'goatland-production';
const APP_NAME = 'goatland-production-registration-seed';
const WRITE_ENVIRONMENT = 'GOATLAND_PRODUCTION_SEED_WRITE';
const REGISTRATION_OPENS_AT = timestampFromEasternDate('2026-08-30', '00:00:00');
const LEAGUE_CAPACITY = 16;
const EXPECTED_COUNTS = Object.freeze({
  games: 6,
  tiers: 3,
  leagueStarts: 80,
  registrationOfferings: 80,
  leagues: 80,
  promoters: 3,
  promoCodes: 3,
});

const TIER_DATES = Object.freeze({
  'tier-1': Object.freeze([
    '2026-10-05',
    '2026-10-12',
    '2026-10-19',
    '2026-10-26',
    '2026-10-07',
    '2026-10-14',
    '2026-10-21',
    '2026-10-28',
  ]),
  'tier-2': Object.freeze([
    '2026-10-06',
    '2026-10-13',
    '2026-10-20',
    '2026-10-27',
  ]),
  'tier-3': Object.freeze([
    '2026-10-01',
    '2026-10-08',
    '2026-10-15',
    '2026-10-22',
    '2026-10-29',
  ]),
});

const GAMES = Object.freeze([
  Object.freeze({
    id: 'madden-27', name: 'Madden', slug: 'madden-27', edition: '27', status: 'active',
  }),
  Object.freeze({
    id: 'college-football-27',
    name: 'EA Sports College Football',
    slug: 'college-football-27',
    edition: '27',
    status: 'active',
  }),
  Object.freeze({
    id: 'nba-2k27', name: 'NBA 2K', slug: 'nba-2k27', edition: '2K27', status: 'active',
  }),
  Object.freeze({
    id: 'call-of-duty', name: 'Call of Duty', slug: 'call-of-duty', edition: null, status: 'active',
  }),
  Object.freeze({
    id: 'mlb-27', name: 'MLB 27', slug: 'mlb-27', edition: '27', status: 'active',
  }),
  Object.freeze({
    id: 'madden-ultimate-team',
    name: 'Madden Ultimate Team',
    slug: 'madden-ultimate-team',
    edition: '27',
    status: 'coming_soon',
  }),
]);

const TIERS = Object.freeze([
  Object.freeze({ id: 'tier-1', name: 'Tier 1', level: 1, status: 'active' }),
  Object.freeze({ id: 'tier-2', name: 'Tier 2', level: 2, status: 'active' }),
  Object.freeze({ id: 'tier-3', name: 'Tier 3', level: 3, status: 'active' }),
]);

const LAUNCH_TIERS_BY_GAME = Object.freeze({
  'madden-27': Object.freeze(['tier-1', 'tier-2', 'tier-3']),
  'college-football-27': Object.freeze(['tier-1', 'tier-2', 'tier-3']),
  'nba-2k27': Object.freeze(['tier-1', 'tier-2', 'tier-3']),
  'call-of-duty': Object.freeze(['tier-1', 'tier-2', 'tier-3']),
  'mlb-27': Object.freeze(['tier-1', 'tier-2']),
  'madden-ultimate-team': Object.freeze([]),
});

const PROMOTERS = Object.freeze([
  Object.freeze({ id: 'otis-guess', name: 'Otis Guess', status: 'active' }),
  Object.freeze({
    id: 'night-flight-basketball', name: 'Night Flight Basketball', status: 'active',
  }),
  Object.freeze({ id: 'chris76tx', name: 'Chris76TX', status: 'active' }),
]);

const PROMO_CODES = Object.freeze([
  Object.freeze({ id: 'LOCKEDIN', promoterId: 'otis-guess', status: 'active' }),
  Object.freeze({
    id: 'NFBL860', promoterId: 'night-flight-basketball', status: 'active',
  }),
  Object.freeze({ id: 'CHRIS76TX', promoterId: 'chris76tx', status: 'active' }),
]);

const SCHEMAS = Object.freeze({
  game: Object.freeze({
    fields: Object.freeze(['name', 'slug', 'edition', 'status']),
    immutable: Object.freeze(['name', 'slug', 'edition']),
    statuses: Object.freeze(['coming_soon', 'active', 'inactive', 'retired']),
  }),
  tier: Object.freeze({
    fields: Object.freeze(['name', 'level', 'status']),
    immutable: Object.freeze(['name', 'level']),
    statuses: Object.freeze(['active', 'inactive', 'retired']),
  }),
  leagueStart: Object.freeze({
    fields: Object.freeze(['gameId', 'name', 'status', 'timeZone', 'startsAt', 'endsAt']),
    immutable: Object.freeze(['gameId', 'name', 'timeZone', 'startsAt', 'endsAt']),
    statuses: Object.freeze(['draft', 'scheduled', 'active', 'completed', 'cancelled']),
  }),
  registrationOffering: Object.freeze({
    fields: Object.freeze([
      'leagueStartId',
      'tierId',
      'status',
      'registrationOpensAt',
      'registrationClosesAt',
      'entryFeeCents',
      'currency',
    ]),
    immutable: Object.freeze([
      'leagueStartId',
      'tierId',
      'registrationOpensAt',
      'registrationClosesAt',
      'entryFeeCents',
      'currency',
    ]),
    statuses: Object.freeze(['draft', 'enabled', 'disabled', 'cancelled']),
  }),
  league: Object.freeze({
    fields: Object.freeze([
      'registrationOfferingId',
      'leagueNumber',
      'capacity',
      'status',
      'confirmedCount',
      'activeHoldCount',
      'lastAssignedRegistrationOrder',
    ]),
    immutable: Object.freeze(['registrationOfferingId', 'leagueNumber', 'capacity']),
    statuses: Object.freeze(['open', 'full', 'closed', 'cancelled']),
  }),
  promoter: Object.freeze({
    fields: Object.freeze(['name', 'status']),
    immutable: Object.freeze(['name']),
    statuses: Object.freeze(['active', 'disabled', 'retired']),
  }),
  promoCode: Object.freeze({
    fields: Object.freeze(['promoterId', 'status']),
    immutable: Object.freeze(['promoterId']),
    statuses: Object.freeze(['active', 'disabled', 'retired']),
  }),
});

function requireExactEnvironment(name) {
  if (process.env[name] !== PROJECT_ID) {
    throw new Error(`${name} must be exactly ${PROJECT_ID}.`);
  }
}

function timestampFromEasternDate(date, time) {
  if (!/^2026-(08|09|10)-\d{2}$/.test(date)) {
    throw new Error(`Unsupported production seed calendar date: ${date}.`);
  }
  const milliseconds = Date.parse(`${date}T${time}-04:00`);
  if (!Number.isFinite(milliseconds)) {
    throw new Error(`Production seed timestamp is invalid: ${date} ${time}.`);
  }
  return Timestamp.fromMillis(milliseconds);
}

function previousCalendarDate(date) {
  const noonUtc = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(noonUtc)) throw new Error(`Calendar date is invalid: ${date}.`);
  return new Date(noonUtc - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getLeagueId(registrationOfferingId, leagueNumber) {
  if (
    !registrationOfferingId
    || registrationOfferingId.includes('/')
    || registrationOfferingId.includes('__league-')
    || !Number.isInteger(leagueNumber)
    || leagueNumber < 1
  ) {
    throw new Error('Production League ID inputs are invalid.');
  }
  return `${registrationOfferingId}__league-${leagueNumber}`;
}

function getEntryFeeCents(gameId, tierId) {
  if (tierId === 'tier-1') return 5_000;
  if (tierId === 'tier-3') return 50_000;
  if (tierId === 'tier-2') return gameId === 'mlb-27' ? 35_000 : 20_000;
  throw new Error(`No production entry fee exists for ${gameId}/${tierId}.`);
}

function entry(collection, id, kind, data) {
  return Object.freeze({ collection, id, kind, data: Object.freeze(data) });
}

function buildManifest() {
  const manifest = [];
  const gameById = new Map(GAMES.map((game) => [game.id, game]));
  const leagueStartPaths = new Set();

  for (const { id, ...data } of GAMES) manifest.push(entry('games', id, 'game', data));
  for (const { id, ...data } of TIERS) manifest.push(entry('tiers', id, 'tier', data));

  for (const [gameId, tierIds] of Object.entries(LAUNCH_TIERS_BY_GAME)) {
    const game = gameById.get(gameId);
    if (!game) throw new Error(`Launch manifest references unknown Game ${gameId}.`);

    for (const tierId of tierIds) {
      const dates = TIER_DATES[tierId];
      if (!dates) throw new Error(`Launch manifest references unknown Tier ${tierId}.`);

      for (const date of dates) {
        const leagueStartId = `${gameId}__${date}`;
        const offeringId = `${gameId}__${tierId}__${date}`;

        if (!leagueStartPaths.has(leagueStartId)) {
          leagueStartPaths.add(leagueStartId);
          manifest.push(entry('leagueStarts', leagueStartId, 'leagueStart', {
            gameId,
            name: `${game.name} League Start — ${date}`,
            status: 'scheduled',
            timeZone: 'America/New_York',
            startsAt: timestampFromEasternDate(date, '00:00:00'),
            endsAt: null,
          }));
        }

        manifest.push(entry('registrationOfferings', offeringId, 'registrationOffering', {
          leagueStartId,
          tierId,
          status: 'enabled',
          registrationOpensAt: REGISTRATION_OPENS_AT,
          registrationClosesAt: timestampFromEasternDate(
            previousCalendarDate(date),
            '23:59:00',
          ),
          entryFeeCents: getEntryFeeCents(gameId, tierId),
          currency: 'USD',
        }));
        manifest.push(entry('leagues', getLeagueId(offeringId, 1), 'league', {
          registrationOfferingId: offeringId,
          leagueNumber: 1,
          capacity: LEAGUE_CAPACITY,
          status: 'open',
          confirmedCount: 0,
          activeHoldCount: 0,
          lastAssignedRegistrationOrder: 0,
        }));
      }
    }
  }

  for (const { id, ...data } of PROMOTERS) {
    manifest.push(entry('promoters', id, 'promoter', data));
  }
  for (const { id, ...data } of PROMO_CODES) {
    manifest.push(entry('promoCodes', id, 'promoCode', data));
  }

  return Object.freeze(manifest);
}

function validateManifest(manifest) {
  const paths = new Set();
  const counts = Object.fromEntries(Object.keys(EXPECTED_COUNTS).map((key) => [key, 0]));
  const leagueStarts = new Map();
  const offerings = new Map();
  const games = new Set();
  const tiers = new Set();
  const leagues = new Map();
  const promoters = new Set();

  for (const item of manifest) {
    const path = `${item.collection}/${item.id}`;
    if (paths.has(path)) throw new Error(`Duplicate production manifest path: ${path}.`);
    paths.add(path);
    if (!(item.collection in counts)) {
      throw new Error(`Production manifest collection is not approved: ${item.collection}.`);
    }
    counts[item.collection] += 1;

    const schema = SCHEMAS[item.kind];
    if (!schema) throw new Error(`Unknown production manifest kind: ${item.kind}.`);
    if (Object.keys(item.data).sort().join(',') !== [...schema.fields].sort().join(',')) {
      throw new Error(`Production manifest schema is invalid at ${path}.`);
    }

    if (item.kind === 'game') games.add(item.id);
    if (item.kind === 'tier') tiers.add(item.id);
    if (item.kind === 'leagueStart') leagueStarts.set(item.id, item.data);
    if (item.kind === 'registrationOffering') offerings.set(item.id, item.data);
    if (item.kind === 'league') leagues.set(item.id, item.data);
    if (item.kind === 'promoter') promoters.add(item.id);
    if (item.kind === 'promoCode' && !promoters.has(item.data.promoterId)) {
      throw new Error(`PromoCode ${item.id} references an unapproved Promoter.`);
    }
  }

  for (const [collection, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (counts[collection] !== expected) {
      throw new Error(
        `Production manifest ${collection} count must be ${expected}; found ${counts[collection]}.`,
      );
    }
  }

  for (const [leagueStartId, leagueStart] of leagueStarts) {
    const [gameId, date, ...extraParts] = leagueStartId.split('__');
    if (
      !games.has(leagueStart.gameId)
      || gameId !== leagueStart.gameId
      || !/^2026-10-\d{2}$/.test(date ?? '')
      || extraParts.length > 0
    ) {
      throw new Error(`LeagueStart relationship is invalid: ${leagueStartId}.`);
    }
  }

  for (const [offeringId, offering] of offerings) {
    const leagueStart = leagueStarts.get(offering.leagueStartId);
    if (
      !leagueStart
      || !tiers.has(offering.tierId)
      || !offeringId.startsWith(`${leagueStart.gameId}__${offering.tierId}__`)
    ) {
      throw new Error(`RegistrationOffering relationship is invalid: ${offeringId}.`);
    }
    if (offering.registrationClosesAt.toMillis() >= leagueStart.startsAt.toMillis()) {
      throw new Error(`RegistrationOffering window does not close before start: ${offeringId}.`);
    }
    const leaguePath = `leagues/${getLeagueId(offeringId, 1)}`;
    if (!paths.has(leaguePath)) {
      throw new Error(`RegistrationOffering has no deterministic League 1: ${offeringId}.`);
    }
  }

  for (const [leagueId, league] of leagues) {
    if (
      !offerings.has(league.registrationOfferingId)
      || league.leagueNumber !== 1
      || leagueId !== getLeagueId(league.registrationOfferingId, 1)
    ) {
      throw new Error(`League relationship is invalid: ${leagueId}.`);
    }
  }

  const forbiddenFragments = [
    'madden-ultimate-team__2026-',
    'madden-ultimate-team__tier-',
    'NBAANT860',
    'E2E-REFERRAL',
    'e2e-hosted-referral-promoter',
  ];
  for (const fragment of forbiddenFragments) {
    if ([...paths].some((path) => path.includes(fragment))) {
      throw new Error(`Production manifest contains forbidden fixture data: ${fragment}.`);
    }
  }
}

function valuesEqual(actual, expected) {
  if (actual instanceof Timestamp && expected instanceof Timestamp) {
    return actual.isEqual(expected);
  }
  return actual === expected;
}

function safeStatusUpdateAllowed(kind, currentStatus, expectedStatus) {
  if (currentStatus === expectedStatus) return true;
  if (kind === 'game' && expectedStatus === 'active') {
    return currentStatus === 'coming_soon' || currentStatus === 'inactive';
  }
  if (kind === 'tier' && expectedStatus === 'active') return currentStatus === 'inactive';
  if (kind === 'leagueStart' && expectedStatus === 'scheduled') return currentStatus === 'draft';
  if (kind === 'registrationOffering' && expectedStatus === 'enabled') {
    return currentStatus === 'draft' || currentStatus === 'disabled';
  }
  if ((kind === 'promoter' || kind === 'promoCode') && expectedStatus === 'active') {
    return currentStatus === 'disabled';
  }
  return false;
}

function conflict(item, reference, reason) {
  return Object.freeze({ item, reference, action: 'CONFLICT', reason });
}

function classifyExistingDocument(item, snapshot) {
  if (!snapshot.exists) {
    return Object.freeze({ item, reference: snapshot.ref, action: 'CREATE', reason: '' });
  }

  const data = snapshot.data();
  const schema = SCHEMAS[item.kind];
  const expectedKeys = [...schema.fields, 'createdAt', 'updatedAt'].sort().join(',');
  if (Object.keys(data).sort().join(',') !== expectedKeys) {
    return conflict(item, snapshot.ref, 'schema differs from the approved manifest');
  }
  if (!(data.createdAt instanceof Timestamp) || !(data.updatedAt instanceof Timestamp)) {
    return conflict(item, snapshot.ref, 'createdAt or updatedAt is not an Admin Timestamp');
  }
  for (const field of schema.immutable) {
    if (!valuesEqual(data[field], item.data[field])) {
      return conflict(item, snapshot.ref, `immutable field ${field} differs`);
    }
  }
  if (!schema.statuses.includes(data.status)) {
    return conflict(item, snapshot.ref, `status ${String(data.status)} is invalid`);
  }

  if (item.kind === 'league') {
    for (const field of [
      'confirmedCount',
      'activeHoldCount',
      'lastAssignedRegistrationOrder',
    ]) {
      if (!Number.isInteger(data[field]) || data[field] < 0) {
        return conflict(item, snapshot.ref, `${field} is not a non-negative integer`);
      }
    }
    if (data.confirmedCount + data.activeHoldCount > data.capacity) {
      return conflict(item, snapshot.ref, 'confirmedCount plus activeHoldCount exceeds capacity');
    }
    return Object.freeze({
      item, reference: snapshot.ref, action: 'UNCHANGED', reason: '',
    });
  }

  if (data.status === item.data.status) {
    return Object.freeze({
      item, reference: snapshot.ref, action: 'UNCHANGED', reason: '',
    });
  }
  if (safeStatusUpdateAllowed(item.kind, data.status, item.data.status)) {
    return Object.freeze({
      item,
      reference: snapshot.ref,
      action: 'SAFE UPDATE',
      reason: `status ${data.status}`,
    });
  }
  return conflict(
    item,
    snapshot.ref,
    `status ${data.status} cannot safely transition to ${item.data.status}`,
  );
}

function printManifestSummary(manifest, decisions, writeMode) {
  const actionCounts = {
    CREATE: 0,
    UNCHANGED: 0,
    'SAFE UPDATE': 0,
    CONFLICT: 0,
  };
  for (const decision of decisions) actionCounts[decision.action] += 1;

  console.log(`Firebase project ID: ${PROJECT_ID}`);
  console.log(`Mode: ${writeMode ? 'WRITE' : 'PREVIEW — ZERO WRITES'}`);
  console.log('Manifest summary:');
  console.log(`- Games: ${EXPECTED_COUNTS.games}`);
  console.log(`- Tiers: ${EXPECTED_COUNTS.tiers}`);
  console.log(`- LeagueStarts: ${EXPECTED_COUNTS.leagueStarts}`);
  console.log(`- RegistrationOfferings: ${EXPECTED_COUNTS.registrationOfferings}`);
  console.log(`- Leagues: ${EXPECTED_COUNTS.leagues}`);
  console.log(`- Promoters: ${PROMOTERS.map(({ id }) => id).join(', ')}`);
  console.log(`- PromoCodes: ${PROMO_CODES.map(({ id }) => id).join(', ')}`);
  console.log('Preflight actions:');
  for (const action of ['CREATE', 'UNCHANGED', 'SAFE UPDATE', 'CONFLICT']) {
    console.log(`- ${action}: ${actionCounts[action]}`);
  }

  const conflicts = decisions.filter(({ action }) => action === 'CONFLICT');
  for (const { item, reason } of conflicts) {
    console.log(`CONFLICT ${item.collection}/${item.id}: ${reason}`);
  }

  const grouped = new Map();
  for (const { item, action } of decisions) {
    const current = grouped.get(item.collection) ?? {
      CREATE: 0, UNCHANGED: 0, 'SAFE UPDATE': 0, CONFLICT: 0,
    };
    current[action] += 1;
    grouped.set(item.collection, current);
  }
  console.log('Planned actions by collection:');
  for (const collection of Object.keys(EXPECTED_COUNTS)) {
    const counts = grouped.get(collection);
    console.log(
      `- ${collection}: CREATE ${counts.CREATE}, UNCHANGED ${counts.UNCHANGED}, `
      + `SAFE UPDATE ${counts['SAFE UPDATE']}, CONFLICT ${counts.CONFLICT}`,
    );
  }
  if (manifest.length !== decisions.length) {
    throw new Error('Preflight did not classify every production manifest document.');
  }
}

async function readExactManifestSnapshots(firestore, manifest) {
  const references = manifest.map(({ collection, id }) => firestore.collection(collection).doc(id));
  const chunks = [];
  for (let index = 0; index < references.length; index += 100) {
    chunks.push(references.slice(index, index + 100));
  }
  const snapshotChunks = await Promise.all(chunks.map((chunk) => firestore.getAll(...chunk)));
  return snapshotChunks.flat();
}

function addApprovedWrites(batch, decisions, now) {
  for (const { item, reference, action } of decisions) {
    if (action === 'CREATE') {
      batch.create(reference, {
        ...item.data,
        createdAt: now,
        updatedAt: now,
      });
    } else if (action === 'SAFE UPDATE') {
      batch.update(reference, {
        status: item.data.status,
        updatedAt: now,
      });
    }
  }
}

async function commitApprovedWrites(firestore, manifest) {
  const references = manifest.map(
    ({ collection, id }) => firestore.collection(collection).doc(id),
  );

  return firestore.runTransaction(async (transaction) => {
    const snapshots = await transaction.getAll(...references);
    const decisions = manifest.map(
      (item, index) => classifyExistingDocument(item, snapshots[index]),
    );
    if (decisions.some(({ action }) => action === 'CONFLICT')) {
      throw new Error(
        'Production state changed or conflicts during the write transaction; zero writes performed.',
      );
    }

    const writableDecisions = decisions.filter(({ action }) => (
      action === 'CREATE' || action === 'SAFE UPDATE'
    ));
    addApprovedWrites(transaction, writableDecisions, Timestamp.now());
    return writableDecisions.length;
  });
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Production registration seed accepts no CLI arguments.');
  }
  requireExactEnvironment('GCLOUD_PROJECT');
  requireExactEnvironment('GOATLAND_ALLOW_PRODUCTION_SEED');
  if (process.env.FIRESTORE_EMULATOR_HOST !== undefined) {
    throw new Error('FIRESTORE_EMULATOR_HOST must be unset for the production seed.');
  }
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== undefined) {
    throw new Error('FIREBASE_AUTH_EMULATOR_HOST must be unset for the production seed.');
  }
  if (
    process.env[WRITE_ENVIRONMENT] !== undefined
    && process.env[WRITE_ENVIRONMENT] !== PROJECT_ID
  ) {
    throw new Error(`${WRITE_ENVIRONMENT} must be exactly ${PROJECT_ID} when set.`);
  }

  const writeMode = process.env[WRITE_ENVIRONMENT] === PROJECT_ID;
  const manifest = buildManifest();
  validateManifest(manifest);

  const app = initializeApp({ projectId: PROJECT_ID }, APP_NAME);
  if (app.options.projectId !== PROJECT_ID) {
    throw new Error(`Firebase Admin project must be exactly ${PROJECT_ID}.`);
  }
  const firestore = getFirestore(app);
  const snapshots = await readExactManifestSnapshots(firestore, manifest);
  const decisions = manifest.map(
    (item, index) => classifyExistingDocument(item, snapshots[index]),
  );
  printManifestSummary(manifest, decisions, writeMode);

  if (decisions.some(({ action }) => action === 'CONFLICT')) {
    throw new Error('Production registration seed preflight found conflicts; zero writes performed.');
  }

  if (!writeMode) {
    console.log(`Set ${WRITE_ENVIRONMENT}=${PROJECT_ID} only after approving this preview.`);
    console.log('Preview completed. Zero writes performed.');
  } else {
    const writableDecisions = decisions.filter(({ action }) => (
      action === 'CREATE' || action === 'SAFE UPDATE'
    ));
    if (writableDecisions.length === 0) {
      console.log('Production registration manifest is already current. Zero writes required.');
    } else {
      const committedWrites = await commitApprovedWrites(firestore, manifest);
      console.log(
        `Production registration seed committed ${committedWrites} approved writes.`,
      );
    }
  }
}

const isDirectExecution = Boolean(
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href,
);
if (isDirectExecution) await main();

export {
  EXPECTED_COUNTS,
  PROJECT_ID,
  buildManifest,
  classifyExistingDocument,
  validateManifest,
};
