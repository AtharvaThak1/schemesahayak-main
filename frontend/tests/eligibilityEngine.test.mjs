// Run with:  npm test   (uses Node's built-in test runner — no new dependencies)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEligibilityPlan,
  evaluateEligibility,
  resolveResidency,
  STATUS,
  RESULT
} from '../src/utils/eligibilityEngine.js';

// ---------------------------------------------------------------------
// Fixtures mirror the real dataset's `eligibility` shape (see
// backend/data/*.json). They are test inputs only.
// ---------------------------------------------------------------------

const baseElig = () => ({
  age: { minimum: null, maximum: null },
  gender: [],
  residency: { required: true, state: 'India' },
  income: { required: false, maximum_annual_family_income: null, currency: 'INR' },
  bank_account: { required: null, aadhaar_linked: null },
  conditions: [],
  exclusions: []
});

const scheme = (id, patch = {}) => ({
  scheme_id: id,
  scheme_name: id,
  eligibility: { ...baseElig(), ...patch }
});

// Scheme A: age + income + female-only + bank account
const SCHEME_A = scheme('SCHEME-A', {
  age: { minimum: 18, maximum: 40 },
  gender: ['Female'],
  income: { required: true, maximum_annual_family_income: 250000, currency: 'INR' },
  bank_account: { required: true, aadhaar_linked: null }
});

// Scheme B: completely different shape — only a minimum age
const SCHEME_B = scheme('SCHEME-B', { age: { minimum: 60, maximum: null } });

const fullyMatching = { age: 30, gender: 'Female', income: 200000, bank: 'yes' };

const byId = (result, id) => result.breakdown.find((b) => b.id === id);

// ---------------------------------------------------------------------
// 1. All conditions satisfied
// ---------------------------------------------------------------------

test('1. all conditions satisfied -> Potentially Eligible', () => {
  const plan = buildEligibilityPlan(SCHEME_A);
  const result = evaluateEligibility(plan, fullyMatching);

  assert.equal(result.status, STATUS.POTENTIALLY_ELIGIBLE);
  assert.equal(result.counts.matched, 4);
  assert.equal(result.counts.notMatched, 0);
  assert.equal(result.counts.unknown, 0);
  assert.match(result.explanation, /potentially eligible/i);
});

test('1b. boundary values are inclusive (age 18 and 40, income exactly at limit)', () => {
  const plan = buildEligibilityPlan(SCHEME_A);
  for (const age of [18, 40]) {
    const r = evaluateEligibility(plan, { ...fullyMatching, age, income: 250000 });
    assert.equal(r.status, STATUS.POTENTIALLY_ELIGIBLE, `age ${age}`);
  }
});

// ---------------------------------------------------------------------
// 2. One condition not satisfied
// ---------------------------------------------------------------------

test('2. one unmet condition -> Not Eligible, and only that row fails', () => {
  const plan = buildEligibilityPlan(SCHEME_A);
  const result = evaluateEligibility(plan, { ...fullyMatching, income: 250001 });

  assert.equal(result.status, STATUS.NOT_ELIGIBLE);
  assert.equal(byId(result, 'income').result, RESULT.NOT_MATCHED);
  assert.equal(byId(result, 'age').result, RESULT.MATCHED);
  assert.equal(result.counts.notMatched, 1);
});

test('2b. age outside range on either side fails', () => {
  const plan = buildEligibilityPlan(SCHEME_A);
  assert.equal(evaluateEligibility(plan, { ...fullyMatching, age: 17 }).status, STATUS.NOT_ELIGIBLE);
  assert.equal(evaluateEligibility(plan, { ...fullyMatching, age: 41 }).status, STATUS.NOT_ELIGIBLE);
});

test('2c. gender mismatch fails', () => {
  const plan = buildEligibilityPlan(SCHEME_A);
  const r = evaluateEligibility(plan, { ...fullyMatching, gender: 'Male' });
  assert.equal(r.status, STATUS.NOT_ELIGIBLE);
  assert.equal(byId(r, 'gender').result, RESULT.NOT_MATCHED);
});

test('2d. a definite failure wins over unanswered questions', () => {
  const plan = buildEligibilityPlan(SCHEME_A);
  const r = evaluateEligibility(plan, { age: 10 }); // fails age, rest unanswered
  assert.equal(r.status, STATUS.NOT_ELIGIBLE);
});

// ---------------------------------------------------------------------
// 3. Some answers missing
// ---------------------------------------------------------------------

test('3. missing answers -> Additional Information Required, never "eligible"', () => {
  const plan = buildEligibilityPlan(SCHEME_A);
  const result = evaluateEligibility(plan, { age: 30, gender: 'Female' }); // no income / bank

  assert.equal(result.status, STATUS.NEEDS_INFO);
  assert.equal(byId(result, 'income').result, RESULT.UNKNOWN);
  assert.equal(byId(result, 'bank').result, RESULT.UNKNOWN);
  assert.equal(result.counts.unanswered, 2);
});

test('3b. no answers at all -> Additional Information Required', () => {
  const plan = buildEligibilityPlan(SCHEME_A);
  assert.equal(evaluateEligibility(plan, {}).status, STATUS.NEEDS_INFO);
});

test('3c. invalid / blank numeric input is Unknown, not a crash or a pass', () => {
  const plan = buildEligibilityPlan(SCHEME_A);
  const r = evaluateEligibility(plan, { ...fullyMatching, age: 'abc', income: '' });
  assert.equal(byId(r, 'age').result, RESULT.UNKNOWN);
  assert.equal(byId(r, 'income').result, RESULT.UNKNOWN);
  assert.equal(r.status, STATUS.NEEDS_INFO);
});

test('3d. out-of-range age (negative / 200) is Unknown', () => {
  const plan = buildEligibilityPlan(SCHEME_A);
  assert.equal(byId(evaluateEligibility(plan, { ...fullyMatching, age: -5 }), 'age').result, RESULT.UNKNOWN);
  assert.equal(byId(evaluateEligibility(plan, { ...fullyMatching, age: 200 }), 'age').result, RESULT.UNKNOWN);
});

// ---------------------------------------------------------------------
// 4. Incomplete scheme data
// ---------------------------------------------------------------------

test('4. scheme with no eligibility data -> Cannot Be Determined', () => {
  const empty = { scheme_id: 'EMPTY', scheme_name: 'Empty', eligibility: baseElig() };
  const plan = buildEligibilityPlan(empty);
  assert.equal(plan.hasAnyRule, false);
  assert.equal(plan.questions.length, 0);

  const r = evaluateEligibility(plan, {});
  assert.equal(r.status, STATUS.CANNOT_DETERMINE);
});

test('4b. missing / malformed eligibility block does not throw', () => {
  for (const s of [
    { scheme_id: 'X' },
    { scheme_id: 'X', eligibility: null },
    { scheme_id: 'X', eligibility: 'nonsense' },
    { scheme_id: 'X', eligibility: [] },
    null,
    undefined
  ]) {
    const plan = buildEligibilityPlan(s);
    assert.equal(evaluateEligibility(plan, {}).status, STATUS.CANNOT_DETERMINE);
  }
});

test('4c. income limit required but amount unknown -> never invented; stays Unknown', () => {
  const s = scheme('INC-UNSPECIFIED', {
    income: { required: true, maximum_annual_family_income: null, currency: 'INR' },
    age: { minimum: 18, maximum: null }
  });
  const plan = buildEligibilityPlan(s);
  // No income *question* is shown (nothing to compare against)…
  assert.equal(plan.questions.some((q) => q.id === 'income'), false);

  // …and even with a perfect age answer the result cannot become "eligible".
  const r = evaluateEligibility(plan, { age: 30 });
  assert.equal(r.status, STATUS.NEEDS_INFO);
  assert.equal(r.counts.dataGaps, 1);
  assert.equal(r.counts.unanswered, 0);
  assert.match(r.explanation, /scheme data is incomplete/i);
});

test('4d. unresolvable residency text is Unknown rather than guessed', () => {
  const s = scheme('ODD-RES', { residency: { required: true, state: 'Tribal blocks notified by the Ministry' } });
  const plan = buildEligibilityPlan(s);
  const r = evaluateEligibility(plan, {});
  assert.equal(r.status, STATUS.NEEDS_INFO);
  assert.equal(r.counts.dataGaps, 1);
});

// ---------------------------------------------------------------------
// 5. Different schemes -> different questions
// ---------------------------------------------------------------------

test('5. different schemes produce different, relevant questions only', () => {
  const planA = buildEligibilityPlan(SCHEME_A);
  const planB = buildEligibilityPlan(SCHEME_B);

  assert.deepEqual(planA.questions.map((q) => q.id), ['age', 'gender', 'income', 'bank']);
  assert.deepEqual(planB.questions.map((q) => q.id), ['age']);

  // B has no gender/income/bank rules, so those are never asked or reported.
  const r = evaluateEligibility(planB, { age: 65 });
  assert.equal(r.breakdown.length, 1);
  assert.equal(r.status, STATUS.POTENTIALLY_ELIGIBLE);
  assert.equal(evaluateEligibility(planB, { age: 59 }).status, STATUS.NOT_ELIGIBLE);
});

test('5b. gender question appears only for gender-restricted schemes', () => {
  assert.equal(buildEligibilityPlan(SCHEME_B).questions.some((q) => q.id === 'gender'), false);
  assert.equal(
    buildEligibilityPlan(scheme('ALL', { gender: ['All'] })).questions.some((q) => q.id === 'gender'),
    false
  );
});

test('5c. nationwide residency adds no state question, only a note', () => {
  const plan = buildEligibilityPlan(SCHEME_B);
  assert.equal(plan.questions.some((q) => q.id === 'state'), false);
  assert.ok(plan.notes.some((n) => /across India/i.test(n)));
});

test('5d. region-specific scheme asks for state and checks region membership', () => {
  const ne = scheme('NE', { residency: { required: true, state: 'North Eastern Region' } });
  const plan = buildEligibilityPlan(ne);
  assert.ok(plan.questions.some((q) => q.id === 'state'));
  assert.equal(evaluateEligibility(plan, { state: 'Assam' }).status, STATUS.POTENTIALLY_ELIGIBLE);
  assert.equal(evaluateEligibility(plan, { state: 'Kerala' }).status, STATUS.NOT_ELIGIBLE);

  const jk = buildEligibilityPlan(
    scheme('JK', { residency: { required: true, state: 'Jammu and Kashmir / Ladakh' } })
  );
  assert.equal(evaluateEligibility(jk, { state: 'Ladakh' }).status, STATUS.POTENTIALLY_ELIGIBLE);
  assert.equal(evaluateEligibility(jk, { state: 'Punjab' }).status, STATUS.NOT_ELIGIBLE);

  const mh = buildEligibilityPlan(scheme('MH', { residency: { required: true, state: 'Maharashtra' } }));
  assert.equal(evaluateEligibility(mh, { state: 'maharashtra' }).status, STATUS.POTENTIALLY_ELIGIBLE);
});

test('5e. free-text conditions become self-declared questions', () => {
  const s = scheme('COND', { conditions: ['Must be a landholding farmer family.'] });
  const plan = buildEligibilityPlan(s);
  assert.equal(plan.questions.length, 1);
  assert.equal(plan.questions[0].kind, 'tri');

  assert.equal(evaluateEligibility(plan, { condition_0: 'yes' }).status, STATUS.POTENTIALLY_ELIGIBLE);
  assert.equal(evaluateEligibility(plan, { condition_0: 'no' }).status, STATUS.NOT_ELIGIBLE);
  assert.equal(evaluateEligibility(plan, { condition_0: 'unsure' }).status, STATUS.NEEDS_INFO);
  assert.equal(evaluateEligibility(plan, {}).status, STATUS.NEEDS_INFO);
});

test('5f. exclusions: "yes" (applies) excludes, "no" passes', () => {
  const s = scheme('EXC', { exclusions: ['Institutional land holders'] });
  const plan = buildEligibilityPlan(s);
  assert.equal(evaluateEligibility(plan, { exclusion_0: 'no' }).status, STATUS.POTENTIALLY_ELIGIBLE);
  assert.equal(evaluateEligibility(plan, { exclusion_0: 'yes' }).status, STATUS.NOT_ELIGIBLE);
  assert.equal(evaluateEligibility(plan, {}).status, STATUS.NEEDS_INFO);
});

test('5g. Aadhaar question appears only when aadhaar_linked is true', () => {
  const s = scheme('AAD', { bank_account: { required: true, aadhaar_linked: true } });
  const plan = buildEligibilityPlan(s);
  assert.deepEqual(plan.questions.map((q) => q.id), ['bank', 'aadhaar']);
  assert.equal(
    evaluateEligibility(plan, { bank: 'yes', aadhaar: 'no' }).status,
    STATUS.NOT_ELIGIBLE
  );
});

test('5h. Gemini-adapted shapes (string gender / string residency) do not crash', () => {
  const s = {
    scheme_id: 'GEM',
    scheme_name: 'Gemini scheme',
    eligibility: {
      age: { minimum: 18, maximum: 35 },
      gender: 'Female',
      residency: 'India',
      income: { maximum_annual_family_income: 300000, currency: 'INR', required: true },
      bank_account: null,
      conditions: [],
      exclusions: []
    }
  };
  const plan = buildEligibilityPlan(s);
  assert.deepEqual(plan.questions.map((q) => q.id), ['age', 'gender', 'income']);
  assert.equal(
    evaluateEligibility(plan, { age: 25, gender: 'Female', income: 100000 }).status,
    STATUS.POTENTIALLY_ELIGIBLE
  );
});

// ---------------------------------------------------------------------
// 6. Reset and re-check — engine must be stateless
// ---------------------------------------------------------------------

test('6. re-evaluating after a reset gives an independent result (no hidden state)', () => {
  const plan = buildEligibilityPlan(SCHEME_A);

  const first = evaluateEligibility(plan, { ...fullyMatching, income: 999999 });
  assert.equal(first.status, STATUS.NOT_ELIGIBLE);

  const afterReset = evaluateEligibility(plan, {}); // answers cleared
  assert.equal(afterReset.status, STATUS.NEEDS_INFO);

  const second = evaluateEligibility(plan, fullyMatching);
  assert.equal(second.status, STATUS.POTENTIALLY_ELIGIBLE);

  // evaluating must not mutate the plan or the answers
  const answers = { ...fullyMatching };
  const snapshot = JSON.stringify([plan, answers]);
  evaluateEligibility(plan, answers);
  assert.equal(JSON.stringify([plan, answers]), snapshot);
});

// ---------------------------------------------------------------------
// Residency resolver
// ---------------------------------------------------------------------

test('resolveResidency handles the formats found in the data', () => {
  assert.equal(resolveResidency('India').kind, 'nationwide');
  assert.equal(resolveResidency({ required: true, state: 'India' }).kind, 'nationwide');
  assert.equal(resolveResidency(null).kind, 'none');
  assert.equal(resolveResidency({ required: true, state: null }).kind, 'none');
  assert.equal(resolveResidency('Something unmappable').kind, 'unresolved');
  assert.deepEqual(
    resolveResidency('Jammu and Kashmir / Ladakh').states.sort(),
    ['Jammu and Kashmir', 'Ladakh']
  );
  assert.equal(resolveResidency('North Eastern Region').states.length, 8);
});
