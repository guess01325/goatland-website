import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import {
  EXPECTED_COUNTS,
  PROJECT_ID,
  buildManifest,
  classifyExistingDocument,
  validateManifest,
} from '../scripts/seed-registration-production.mjs';
import { Timestamp } from 'firebase-admin/firestore';

const manifest = buildManifest();
const byCollection = Object.groupBy(manifest, ({ collection }) => collection);
const seedSource = readFileSync(
  new URL('../scripts/seed-registration-production.mjs', import.meta.url),
  'utf8',
);

test('production seed source retains every hard project and write guard', () => {
  for (const requiredSource of [
    "const PROJECT_ID = 'goatland-production';",
    "requireExactEnvironment('GCLOUD_PROJECT');",
    "requireExactEnvironment('GOATLAND_ALLOW_PRODUCTION_SEED');",
    "const WRITE_ENVIRONMENT = 'GOATLAND_PRODUCTION_SEED_WRITE';",
    'process.env.FIRESTORE_EMULATOR_HOST !== undefined',
    'process.env.FIREBASE_AUTH_EMULATOR_HOST !== undefined',
    'initializeApp({ projectId: PROJECT_ID }, APP_NAME)',
    'app.options.projectId !== PROJECT_ID',
    'process.argv.length !== 2',
  ]) {
    assert.equal(seedSource.includes(requiredSource), true, requiredSource);
  }
  for (const forbiddenSource of ['.firebaserc', 'firebase use', '--force', 'process.argv[2]']) {
    assert.equal(seedSource.includes(forbiddenSource), false, forbiddenSource);
  }
});

test('production registration manifest has the exact audited counts', () => {
  validateManifest(manifest);
  assert.equal(PROJECT_ID, 'goatland-production');
  assert.deepEqual(
    Object.fromEntries(Object.entries(byCollection).map(([key, entries]) => [key, entries.length])),
    EXPECTED_COUNTS,
  );
  assert.equal(4 * (8 + 4 + 5) + (8 + 4), 80);
});

test('production launch Games, Tiers, and promos are exact', () => {
  assert.deepEqual(
    byCollection.games.map(({ id, data }) => ({ id, ...data })),
    [
      { id: 'madden-27', name: 'Madden', slug: 'madden-27', edition: '27', status: 'active' },
      {
        id: 'college-football-27', name: 'EA Sports College Football',
        slug: 'college-football-27', edition: '27', status: 'active',
      },
      { id: 'nba-2k27', name: 'NBA 2K', slug: 'nba-2k27', edition: '2K27', status: 'active' },
      {
        id: 'call-of-duty', name: 'Call of Duty', slug: 'call-of-duty',
        edition: null, status: 'active',
      },
      { id: 'mlb-27', name: 'MLB 27', slug: 'mlb-27', edition: '27', status: 'active' },
      {
        id: 'madden-ultimate-team', name: 'Madden Ultimate Team',
        slug: 'madden-ultimate-team', edition: '27', status: 'coming_soon',
      },
    ],
  );
  assert.deepEqual(
    byCollection.tiers.map(({ id, data }) => ({ id, ...data })),
    [
      { id: 'tier-1', name: 'Tier 1', level: 1, status: 'active' },
      { id: 'tier-2', name: 'Tier 2', level: 2, status: 'active' },
      { id: 'tier-3', name: 'Tier 3', level: 3, status: 'active' },
    ],
  );
  assert.deepEqual(byCollection.promoters.map(({ id }) => id), [
    'otis-guess', 'night-flight-basketball', 'chris76tx',
  ]);
  assert.deepEqual(byCollection.promoCodes.map(({ id }) => id), [
    'LOCKEDIN', 'NFBL860', 'CHRIS76TX',
  ]);
});

test('LeagueStarts and offerings are Game/date isolated with exact prices and windows', () => {
  const leagueStarts = new Map(byCollection.leagueStarts.map((item) => [item.id, item.data]));
  const offeringCounts = new Map();
  const expectedPriceByTier = {
    'tier-1': 5_000,
    'tier-2': 20_000,
    'tier-3': 50_000,
  };

  for (const { id, data } of byCollection.registrationOfferings) {
    const [gameId, tierId, date] = id.split('__');
    const leagueStart = leagueStarts.get(`${gameId}__${date}`);
    assert.ok(leagueStart);
    assert.equal(data.leagueStartId, `${gameId}__${date}`);
    assert.equal(data.tierId, tierId);
    assert.equal(data.status, 'enabled');
    assert.equal(data.currency, 'USD');
    assert.equal(data.entryFeeCents, gameId === 'mlb-27' && tierId === 'tier-2'
      ? 35_000
      : expectedPriceByTier[tierId]);
    assert.equal(leagueStart.gameId, gameId);
    assert.equal(leagueStart.timeZone, 'America/New_York');
    assert.equal(leagueStart.endsAt, null);
    assert.equal(leagueStart.startsAt.toMillis(), Date.parse(`${date}T00:00:00-04:00`));
    assert.equal(data.registrationOpensAt.toMillis(), Date.parse('2026-08-30T00:00:00-04:00'));
    const previousDate = new Date(
      Date.parse(`${date}T12:00:00Z`) - 24 * 60 * 60 * 1000,
    ).toISOString().slice(0, 10);
    assert.equal(
      data.registrationClosesAt.toMillis(),
      Date.parse(`${previousDate}T23:59:00-04:00`),
    );
    const key = `${gameId}/${tierId}`;
    offeringCounts.set(key, (offeringCounts.get(key) ?? 0) + 1);
  }

  for (const gameId of ['madden-27', 'college-football-27', 'nba-2k27', 'call-of-duty']) {
    assert.deepEqual(
      [offeringCounts.get(`${gameId}/tier-1`), offeringCounts.get(`${gameId}/tier-2`),
        offeringCounts.get(`${gameId}/tier-3`)],
      [8, 4, 5],
    );
  }
  assert.deepEqual(
    [offeringCounts.get('mlb-27/tier-1'), offeringCounts.get('mlb-27/tier-2')],
    [8, 4],
  );
  assert.equal([...offeringCounts.keys()].some((key) => key.startsWith('madden-ultimate-team/')), false);
});

test('every offering has exactly one deterministic open League 1 and no League 2', () => {
  const offeringIds = new Set(byCollection.registrationOfferings.map(({ id }) => id));
  assert.equal(byCollection.leagues.length, offeringIds.size);
  for (const { id, data } of byCollection.leagues) {
    assert.equal(id, `${data.registrationOfferingId}__league-1`);
    assert.equal(offeringIds.has(data.registrationOfferingId), true);
    assert.deepEqual(data, {
      registrationOfferingId: data.registrationOfferingId,
      leagueNumber: 1,
      capacity: 16,
      status: 'open',
      confirmedCount: 0,
      activeHoldCount: 0,
      lastAssignedRegistrationOrder: 0,
    });
    assert.equal(id.endsWith('__league-2'), false);
  }
});

test('manifest touches only approved top-level collections and excludes test fixtures', () => {
  assert.deepEqual(Object.keys(byCollection).sort(), [
    'games',
    'leagueStarts',
    'leagues',
    'promoCodes',
    'promoters',
    'registrationOfferings',
    'tiers',
  ]);
  const paths = manifest.map(({ collection, id }) => `${collection}/${id}`).join('\n');
  for (const forbidden of [
    'NBAANT860',
    'E2E-REFERRAL',
    'e2e-hosted-referral-promoter',
    'madden-ultimate-team__2026-',
    'madden-ultimate-team__tier-',
  ]) {
    assert.equal(paths.includes(forbidden), false);
  }
});

test('preflight classifications preserve approved data and fail closed on conflicts', () => {
  const item = byCollection.games.find(({ id }) => id === 'madden-27');
  const now = Timestamp.now();
  const reference = { path: 'games/madden-27' };
  const snapshot = (data) => ({
    exists: data !== null,
    ref: reference,
    data: () => data,
  });
  const approved = { ...item.data, createdAt: now, updatedAt: now };

  assert.equal(classifyExistingDocument(item, snapshot(null)).action, 'CREATE');
  assert.equal(classifyExistingDocument(item, snapshot(approved)).action, 'UNCHANGED');
  assert.equal(
    classifyExistingDocument(item, snapshot({ ...approved, status: 'coming_soon' })).action,
    'SAFE UPDATE',
  );
  assert.equal(
    classifyExistingDocument(item, snapshot({ ...approved, slug: 'conflicting-slug' })).action,
    'CONFLICT',
  );

  const leagueItem = byCollection.leagues[0];
  const existingFullLeague = {
    ...leagueItem.data,
    status: 'full',
    confirmedCount: 15,
    activeHoldCount: 1,
    lastAssignedRegistrationOrder: 15,
    createdAt: now,
    updatedAt: now,
  };
  assert.equal(
    classifyExistingDocument(leagueItem, snapshot(existingFullLeague)).action,
    'UNCHANGED',
  );
  assert.equal(
    classifyExistingDocument(
      leagueItem,
      snapshot({ ...existingFullLeague, activeHoldCount: 2 }),
    ).action,
    'CONFLICT',
  );
  assert.deepEqual(existingFullLeague, {
    ...leagueItem.data,
    status: 'full',
    confirmedCount: 15,
    activeHoldCount: 1,
    lastAssignedRegistrationOrder: 15,
    createdAt: now,
    updatedAt: now,
  });
});
