/* global URL */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [registrationGames, registrationPage, publicGames] = await Promise.all([
  readFile(new URL('../src/services/games.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/RegistrationPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/data/games.ts', import.meta.url), 'utf8'),
]);

test('individual registration excludes only Call of Duty from otherwise eligible Games', () => {
  assert.match(
    registrationGames,
    /const INDIVIDUAL_REGISTRATION_EXCLUDED_GAME_ID = 'call-of-duty';/,
  );
  assert.match(
    registrationGames,
    /games\.filter\(\(\{ id, status \}\) => \(\s*id !== INDIVIDUAL_REGISTRATION_EXCLUDED_GAME_ID\s*&& \(status === 'active' \|\| status === 'coming_soon'\)\s*\)\)/,
  );
});

test('invalid or excluded Game query state cannot advance individual registration', () => {
  assert.match(
    registrationPage,
    /const selectedGame = games\.find\(\(game\) => game\.id === gameId && game\.status === 'active'\) \?\? null;/,
  );
  assert.match(
    registrationPage,
    /if \(gameId && !selectedGame\) \{\s*setPickerParams\(\{ game: null, tier: null, start: null \}\);\s*return;/,
  );
});

test('Call of Duty remains in the public supported-game catalog', () => {
  assert.match(
    publicGames,
    /id: 'call-of-duty',\s*name: 'Call of Duty',\s*shortName: 'Call of Duty',\s*path: '\/games\/call-of-duty',/,
  );
});
