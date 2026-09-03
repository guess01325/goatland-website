/* global URL */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const EXPECTED_COMPETITION = 'competition-rules-2026-08-29-v1';
const EXPECTED_REFUND = 'refund-policy-2026-08-29-v1';

const [frontend, rules, functionsConfig] = await Promise.all([
  readFile(new URL('../src/data/registrationPolicies.ts', import.meta.url), 'utf8'),
  readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
  readFile(new URL('../functions/src/config.ts', import.meta.url), 'utf8'),
]);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripComments(source) {
  let result = '';
  let quote = null;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (quote) {
      result += character;
      if (character === '\\') {
        index += 1;
        result += source[index] ?? '';
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      result += character;
      continue;
    }

    if (character === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      result += '\n';
      continue;
    }

    if (character === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        if (source[index] === '\n') result += '\n';
        index += 1;
      }
      index += 1;
      continue;
    }

    result += character;
  }

  return result;
}

function hasActiveDeclaration(source, constantName, expectedVersion) {
  const activeSource = stripComments(source);
  return new RegExp(
    `^\\s*export\\s+const\\s+${constantName}\\s*=\\s*'${escapeRegex(expectedVersion)}'\\s*;`,
    'm',
  ).test(activeSource);
}

function deniesDirectRegistrationCreate(source) {
  const activeSource = stripComments(source);
  return /match\s+\/registrations\/\{registrationId\}\s*\{[\s\S]*?allow\s+create:\s*if\s+false\s*;/.test(activeSource);
}

test('frontend and Functions declare the exact current registration policy versions', () => {
  for (const [label, source] of [
    ['frontend', frontend],
    ['Functions', functionsConfig],
  ]) {
    assert.equal(
      hasActiveDeclaration(source, 'CURRENT_COMPETITION_RULES_VERSION', EXPECTED_COMPETITION),
      true,
      `${label} Competition declaration`,
    );
    assert.equal(
      hasActiveDeclaration(source, 'CURRENT_REFUND_POLICY_VERSION', EXPECTED_REFUND),
      true,
      `${label} Refund declaration`,
    );
  }
});

test('Firestore Rules deny direct Registration creation so Functions enforce policy versions', () => {
  assert.equal(deniesDirectRegistrationCreate(rules), true);
});

test('a commented frontend declaration does not satisfy the authority matcher', () => {
  const source = `// export const CURRENT_COMPETITION_RULES_VERSION = '${EXPECTED_COMPETITION}';`;
  assert.equal(
    hasActiveDeclaration(source, 'CURRENT_COMPETITION_RULES_VERSION', EXPECTED_COMPETITION),
    false,
  );
});

test('a commented Functions declaration does not satisfy the trusted authority matcher', () => {
  const source = `/* export const CURRENT_REFUND_POLICY_VERSION = '${EXPECTED_REFUND}'; */`;
  assert.equal(
    hasActiveDeclaration(source, 'CURRENT_REFUND_POLICY_VERSION', EXPECTED_REFUND),
    false,
  );
});

test('a commented Firestore create denial does not satisfy the Rules authority matcher', () => {
  const source = '// allow create: if false;';
  assert.equal(deniesDirectRegistrationCreate(source), false);
});

test('an unrelated version string does not satisfy any authority matcher', () => {
  const source = `const releaseNote = '${EXPECTED_COMPETITION}';`;
  assert.equal(
    hasActiveDeclaration(source, 'CURRENT_COMPETITION_RULES_VERSION', EXPECTED_COMPETITION),
    false,
  );
});
