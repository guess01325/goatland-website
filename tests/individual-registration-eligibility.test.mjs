/* global URL */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [registrationGames, registrationPage, publicGames] = await Promise.all([
  readFile(new URL('../src/services/games.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/RegistrationPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/data/games.ts', import.meta.url), 'utf8'),
]);

test('individual registration keeps active and coming-soon Games visible', () => {
  assert.match(
    registrationGames,
    /return games\.filter\(\(\{ status \}\) => status === 'active' \|\| status === 'coming_soon'\);/,
  );
});

test('Call of Duty is not selectable for individual registration', () => {
  assert.match(
    registrationGames,
    /const TEAM_REGISTRATION_GAME_ID = 'call-of-duty';/,
  );
  assert.match(
    registrationGames,
    /return status === 'active' && id !== TEAM_REGISTRATION_GAME_ID;/,
  );
  assert.match(
    registrationPage,
    /game\.id === gameId && isIndividualRegistrationGameSelectable\(game\)/,
  );
});

test('invalid or excluded Game query state cannot advance individual registration', () => {
  assert.match(
    registrationPage,
    /if \(gameId && !selectedGame\) \{\s*setPickerParams\(\{ game: null, tier: null, start: null \}\);\s*return;/,
  );
});

test('Call of Duty uses the existing disabled card with team-registration copy', () => {
  assert.match(
    registrationPage,
    /teamRegistrationGames\.map\(\(game\) => \([\s\S]*?description="Squad and roster registration is being finalized\."[\s\S]*?badge="Team Registration Coming Soon"[\s\S]*?disabled/,
  );
});

test('other active Games remain selectable and MUT keeps its Coming Soon treatment', () => {
  assert.match(
    registrationPage,
    /const activeGames = useMemo\(\s*\(\) => games\.filter\(isIndividualRegistrationGameSelectable\)/,
  );
  assert.match(
    registrationPage,
    /comingSoonGames\.map\(\(game\) => \([\s\S]*?badge="Coming Soon"[\s\S]*?disabled/,
  );
});

test('Call of Duty remains in the public supported-game catalog', () => {
  assert.match(
    publicGames,
    /id: 'call-of-duty',\s*name: 'Call of Duty',\s*shortName: 'Call of Duty',\s*path: '\/games\/call-of-duty',/,
  );
});
