// =====================================================================
// ELIGIBILITY ENGINE
// =====================================================================
//
// Pure, deterministic, rule-based logic. No React, no DOM, no network,
// no AI. It only reads the `eligibility` block that already exists on
// a scheme (database shape or the Gemini-adapted shape) and compares it
// with the answers a citizen types in.
//
// Two steps:
//
//   1. buildEligibilityPlan(scheme)
//        -> which criteria does THIS scheme actually define, and which
//           questions are needed to evaluate them?
//
//   2. evaluateEligibility(plan, answers)
//        -> per-criterion result (matched / not_matched / unknown) and
//           an overall status.
//
// Nothing is invented: a criterion exists only when the scheme data
// contains it. Free-text `conditions` / `exclusions` cannot be machine
// evaluated, so they become explicit self-declaration questions and are
// labelled as such.
// =====================================================================

export const RESULT = Object.freeze({
  MATCHED: 'matched',
  NOT_MATCHED: 'not_matched',
  UNKNOWN: 'unknown'
});

export const STATUS = Object.freeze({
  POTENTIALLY_ELIGIBLE: 'potentially_eligible',
  NOT_ELIGIBLE: 'not_eligible',
  NEEDS_INFO: 'needs_info',
  CANNOT_DETERMINE: 'cannot_determine'
});

export const STATUS_LABEL = Object.freeze({
  [STATUS.POTENTIALLY_ELIGIBLE]: 'Potentially Eligible',
  [STATUS.NOT_ELIGIBLE]: 'Not Eligible',
  [STATUS.NEEDS_INFO]: 'Additional Information Required',
  [STATUS.CANNOT_DETERMINE]: 'Cannot Be Determined'
});

export const RESULT_LABEL = Object.freeze({
  [RESULT.MATCHED]: 'Matched',
  [RESULT.NOT_MATCHED]: 'Not Matched',
  [RESULT.UNKNOWN]: 'Unknown'
});

// ---------------------------------------------------------------------
// Static reference data (geography only — not eligibility rules)
// ---------------------------------------------------------------------

export const INDIAN_STATES_AND_UTS = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry'
];

// Named regions that appear in scheme data, expanded to their member
// states / UTs. The North Eastern Region is the 8 states administered
// by the Ministry of DoNER.
const REGIONS = {
  'north eastern region': [
    'Arunachal Pradesh',
    'Assam',
    'Manipur',
    'Meghalaya',
    'Mizoram',
    'Nagaland',
    'Sikkim',
    'Tripura'
  ],
  'north east': [
    'Arunachal Pradesh',
    'Assam',
    'Manipur',
    'Meghalaya',
    'Mizoram',
    'Nagaland',
    'Sikkim',
    'Tripura'
  ],
  'north eastern states': [
    'Arunachal Pradesh',
    'Assam',
    'Manipur',
    'Meghalaya',
    'Mizoram',
    'Nagaland',
    'Sikkim',
    'Tripura'
  ]
};

const NATIONWIDE = new Set([
  'india',
  'all india',
  'pan india',
  'nationwide',
  'national',
  'indian',
  'all states',
  'all states and uts',
  'all states and union territories'
]);

const GENDER_UNRESTRICTED = new Set(['all', 'any', 'both', 'everyone', 'any gender']);

export const GENDER_OPTIONS = ['Male', 'Female', 'Other / Transgender'];

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

const norm = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const isBlank = (value) =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && value.trim() === '');

function toNumber(value) {
  if (isBlank(value)) return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function toStringList(value) {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

const formatRupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

// Expands a scheme's residency text into the set of states it covers.
// Returns:
//   { kind: 'nationwide' }
//   { kind: 'states', states: [...] }      (resolvable)
//   { kind: 'unresolved', raw }            (text we cannot map to states)
export function resolveResidency(rawResidency) {
  let raw = null;

  if (typeof rawResidency === 'string') {
    raw = rawResidency;
  } else if (rawResidency && typeof rawResidency === 'object') {
    raw = typeof rawResidency.state === 'string' ? rawResidency.state : null;
  }

  if (isBlank(raw)) return { kind: 'none' };

  const text = norm(raw);
  if (NATIONWIDE.has(text)) return { kind: 'nationwide' };

  // Split on real separators only. " and " is NOT a separator at this
  // level because it is part of names such as "Jammu and Kashmir".
  const parts = String(raw)
    .split(/\s*(?:\/|,|;|&)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  const states = new Set();
  let allResolved = parts.length > 0;

  // The whole string may itself be a region ("North Eastern Region").
  if (REGIONS[text]) {
    REGIONS[text].forEach((s) => states.add(s));
    return { kind: 'states', states: [...states], label: String(raw).trim() };
  }

  // Resolves one fragment to a list of states, or null if unknown.
  const resolvePart = (fragment) => {
    const key = norm(fragment);
    if (REGIONS[key]) return REGIONS[key];
    const exact = INDIAN_STATES_AND_UTS.find((s) => norm(s) === key);
    if (exact) return [exact];
    return null;
  };

  for (const part of parts) {
    let resolved = resolvePart(part);

    // Fallback: "Assam and Manipur" -> only split on " and " when the
    // whole fragment is not itself a known state / region name.
    if (!resolved && /\sand\s/i.test(part)) {
      const pieces = part.split(/\s+and\s+/i).map((p) => p.trim()).filter(Boolean);
      const sub = pieces.map(resolvePart);
      if (sub.length > 1 && sub.every(Boolean)) resolved = sub.flat();
    }

    if (resolved) {
      resolved.forEach((s) => states.add(s));
    } else {
      allResolved = false;
    }
  }

  if (allResolved && states.size > 0) {
    return { kind: 'states', states: [...states], label: String(raw).trim() };
  }

  return { kind: 'unresolved', raw: String(raw).trim() };
}

function normaliseGenderRule(rawGender) {
  const list = toStringList(rawGender);
  if (list.length === 0) return null;
  const lowered = list.map(norm);
  if (lowered.some((g) => GENDER_UNRESTRICTED.has(g))) return null;
  return list;
}

// ---------------------------------------------------------------------
// STEP 1 — BUILD THE PLAN
// ---------------------------------------------------------------------
//
// plan = {
//   schemeId, schemeName,
//   criteria:  [ { id, type, label, requirement, questionId?, params } ],
//   questions: [ { id, kind, label, help?, options?, ... } ],
//   notes:     [ string ]   // things deliberately not checked
//   hasAnyRule: boolean
// }

export function buildEligibilityPlan(scheme) {
  const plan = {
    schemeId: scheme?.scheme_id ?? null,
    schemeName: scheme?.scheme_name ?? 'this scheme',
    criteria: [],
    questions: [],
    notes: [],
    hasAnyRule: false
  };

  if (!scheme || typeof scheme !== 'object') return plan;

  const e =
    scheme.eligibility && typeof scheme.eligibility === 'object' && !Array.isArray(scheme.eligibility)
      ? scheme.eligibility
      : {};

  // ---- AGE -----------------------------------------------------------
  const age = e.age && typeof e.age === 'object' ? e.age : null;
  const minAge = toNumber(age?.minimum);
  const maxAge = toNumber(age?.maximum);

  if (minAge !== null || maxAge !== null) {
    let requirement;
    if (minAge !== null && maxAge !== null) requirement = `Age between ${minAge} and ${maxAge} years`;
    else if (minAge !== null) requirement = `Age ${minAge} years or above`;
    else requirement = `Age up to ${maxAge} years`;

    plan.criteria.push({
      id: 'age',
      type: 'age',
      label: 'Age',
      requirement,
      questionId: 'age',
      params: { min: minAge, max: maxAge }
    });
    plan.questions.push({
      id: 'age',
      kind: 'number',
      label: 'What is your age?',
      help: 'Age of the person who would receive the benefit, in completed years.',
      unit: 'years',
      min: 0,
      max: 120
    });
  }

  // ---- GENDER --------------------------------------------------------
  const allowedGenders = normaliseGenderRule(e.gender);
  if (allowedGenders) {
    plan.criteria.push({
      id: 'gender',
      type: 'gender',
      label: 'Gender',
      requirement: `Open to: ${allowedGenders.join(', ')}`,
      questionId: 'gender',
      params: { allowed: allowedGenders }
    });
    plan.questions.push({
      id: 'gender',
      kind: 'select',
      label: 'What is your gender?',
      help: 'Asked only because this scheme specifies a gender requirement.',
      options: GENDER_OPTIONS
    });
  }

  // ---- RESIDENCY / STATE --------------------------------------------
  const residency = resolveResidency(e.residency);

  if (residency.kind === 'nationwide') {
    plan.notes.push('Residency: this scheme is available across India, so no state check was needed.');
  } else if (residency.kind === 'states') {
    plan.criteria.push({
      id: 'state',
      type: 'state',
      label: 'State / Region of residence',
      requirement: `Residents of ${residency.label}`,
      questionId: 'state',
      params: { states: residency.states }
    });
    plan.questions.push({
      id: 'state',
      kind: 'select',
      label: 'Which State / Union Territory do you live in?',
      help: 'Asked only because this scheme is limited to a specific region.',
      options: INDIAN_STATES_AND_UTS
    });
  } else if (residency.kind === 'unresolved') {
    plan.criteria.push({
      id: 'state_unresolved',
      type: 'unresolvable',
      label: 'State / Region of residence',
      requirement: `Residency: ${residency.raw}`,
      params: {
        reason: `The residency rule "${residency.raw}" could not be matched to specific states, so it cannot be checked automatically.`
      }
    });
  }

  // ---- INCOME --------------------------------------------------------
  const income = e.income && typeof e.income === 'object' ? e.income : null;
  const maxIncome = toNumber(income?.maximum_annual_family_income);

  if (maxIncome !== null) {
    plan.criteria.push({
      id: 'income',
      type: 'income',
      label: 'Annual family income',
      requirement: `Annual family income up to ${formatRupees(maxIncome)}`,
      questionId: 'income',
      params: { max: maxIncome }
    });
    plan.questions.push({
      id: 'income',
      kind: 'number',
      label: 'What is your total annual family income (in ₹)?',
      help: 'Combined yearly income of all earning family members.',
      unit: '₹ per year',
      min: 0
    });
  } else if (income && income.required === true) {
    plan.criteria.push({
      id: 'income_unspecified',
      type: 'unresolvable',
      label: 'Annual family income',
      requirement: 'An income limit applies',
      params: {
        reason:
          'This scheme has an income condition, but the exact limit is not recorded in our data. Please confirm the limit on the official source.'
      }
    });
  }

  // ---- BANK ACCOUNT / AADHAAR ---------------------------------------
  const bank = e.bank_account && typeof e.bank_account === 'object' ? e.bank_account : null;

  if (bank && bank.required === true) {
    plan.criteria.push({
      id: 'bank',
      type: 'yesno',
      label: 'Bank account',
      requirement: 'Must have a bank account',
      questionId: 'bank',
      params: { expected: true }
    });
    plan.questions.push({
      id: 'bank',
      kind: 'yesno',
      label: 'Do you have a bank account in your name?',
      help: 'Asked only because this scheme requires a bank account.'
    });
  }

  if (bank && bank.aadhaar_linked === true) {
    plan.criteria.push({
      id: 'aadhaar',
      type: 'yesno',
      label: 'Aadhaar-linked bank account',
      requirement: 'Bank account must be linked to Aadhaar',
      questionId: 'aadhaar',
      params: { expected: true }
    });
    plan.questions.push({
      id: 'aadhaar',
      kind: 'yesno',
      label: 'Is your bank account linked to your Aadhaar?',
      help: 'Asked only because this scheme requires Aadhaar linking.'
    });
  }

  // ---- EXCLUSIONS (free text, self-declared) -------------------------
  toStringList(e.exclusions).forEach((text, i) => {
    const id = `exclusion_${i}`;
    plan.criteria.push({
      id,
      type: 'exclusion',
      label: 'Exclusion',
      requirement: `Must NOT apply: ${text}`,
      questionId: id,
      params: { text }
    });
    plan.questions.push({
      id,
      kind: 'yesno',
      label: 'Does this apply to you?',
      statement: text,
      help: 'This scheme lists this as an exclusion. Answer “Yes” if it applies to you.',
      group: 'exclusions'
    });
  });

  // ---- OTHER CONDITIONS (free text, self-declared) -------------------
  toStringList(e.conditions).forEach((text, i) => {
    const id = `condition_${i}`;
    plan.criteria.push({
      id,
      type: 'condition',
      label: 'Scheme condition',
      requirement: text,
      questionId: id,
      params: { text }
    });
    plan.questions.push({
      id,
      kind: 'tri',
      label: 'Do you meet this condition?',
      statement: text,
      help: 'This condition is written as text in the scheme data, so we rely on your own answer.',
      group: 'conditions'
    });
  });

  plan.hasAnyRule = plan.criteria.length > 0;
  return plan;
}

// ---------------------------------------------------------------------
// STEP 2 — EVALUATE
// ---------------------------------------------------------------------
//
// answers: { [questionId]: string | number | 'yes' | 'no' | 'unsure' }
// An absent / blank answer is treated as "not answered" -> Unknown.

function describeAnswer(question, raw) {
  if (isBlank(raw)) return 'Not answered';
  if (question?.kind === 'yesno') return raw === 'yes' ? 'Yes' : raw === 'no' ? 'No' : String(raw);
  if (question?.kind === 'tri') {
    return raw === 'yes' ? 'Yes' : raw === 'no' ? 'No' : raw === 'unsure' ? 'Not sure' : String(raw);
  }
  if (question?.id === 'income') {
    const n = toNumber(raw);
    return n === null ? String(raw) : formatRupees(n);
  }
  if (question?.id === 'age') {
    const n = toNumber(raw);
    return n === null ? String(raw) : `${n} years`;
  }
  return String(raw);
}

function evaluateCriterion(criterion, answers, questionsById) {
  const question = criterion.questionId ? questionsById.get(criterion.questionId) : null;
  const raw = criterion.questionId ? answers?.[criterion.questionId] : undefined;
  const base = {
    id: criterion.id,
    type: criterion.type,
    label: criterion.label,
    requirement: criterion.requirement,
    userAnswer: criterion.questionId ? describeAnswer(question, raw) : 'Cannot be checked here'
  };

  const unknown = (reason) => ({ ...base, result: RESULT.UNKNOWN, reason });
  const matched = (reason) => ({ ...base, result: RESULT.MATCHED, reason });
  const notMatched = (reason) => ({ ...base, result: RESULT.NOT_MATCHED, reason });

  switch (criterion.type) {
    case 'age': {
      const n = toNumber(raw);
      if (n === null || n < 0 || n > 120) {
        return unknown(
          isBlank(raw)
            ? 'Age was not provided.'
            : 'The age entered is not a valid number between 0 and 120.'
        );
      }
      const { min, max } = criterion.params;
      if (min !== null && n < min) return notMatched(`Your age (${n}) is below the minimum age of ${min}.`);
      if (max !== null && n > max) return notMatched(`Your age (${n}) is above the maximum age of ${max}.`);
      return matched(`Your age (${n}) is within the required range.`);
    }

    case 'gender': {
      if (isBlank(raw)) return unknown('Gender was not provided.');
      const allowed = criterion.params.allowed.map(norm);
      const answer = norm(raw);
      // "Other / Transgender" is matched against schemes that list
      // "transgender" or "other" explicitly.
      const answerKeys = answer.startsWith('other') ? ['other', 'transgender'] : [answer];
      if (answerKeys.some((k) => allowed.includes(k))) {
        return matched('Your gender is covered by this scheme.');
      }
      return notMatched(`This scheme is open to: ${criterion.params.allowed.join(', ')}.`);
    }

    case 'state': {
      if (isBlank(raw)) return unknown('State / UT of residence was not provided.');
      const allowed = criterion.params.states.map(norm);
      if (allowed.includes(norm(raw))) return matched(`${raw} is within the scheme's coverage area.`);
      return notMatched(`${raw} is outside the scheme's coverage area (${criterion.requirement}).`);
    }

    case 'income': {
      const n = toNumber(raw);
      if (n === null || n < 0) {
        return unknown(
          isBlank(raw)
            ? 'Annual family income was not provided.'
            : 'The income entered is not a valid amount.'
        );
      }
      if (n <= criterion.params.max) {
        return matched(`Your income (${formatRupees(n)}) is within the limit of ${formatRupees(criterion.params.max)}.`);
      }
      return notMatched(`Your income (${formatRupees(n)}) is above the limit of ${formatRupees(criterion.params.max)}.`);
    }

    case 'yesno': {
      if (raw !== 'yes' && raw !== 'no') return unknown('This question was not answered.');
      return raw === 'yes'
        ? matched('You confirmed this requirement.')
        : notMatched('You indicated this requirement is not met.');
    }

    case 'exclusion': {
      if (raw !== 'yes' && raw !== 'no') return unknown('This question was not answered.');
      return raw === 'no'
        ? matched('You indicated this exclusion does not apply to you.')
        : notMatched('You indicated this exclusion applies to you.');
    }

    case 'condition': {
      if (raw === 'yes') return matched('You declared that you meet this condition (self-declared, not verified).');
      if (raw === 'no') return notMatched('You indicated you do not meet this condition.');
      if (raw === 'unsure') return unknown('You were not sure about this condition. Check the official guidelines.');
      return unknown('This question was not answered.');
    }

    case 'unresolvable':
      return unknown(criterion.params.reason);

    default:
      return unknown('This criterion could not be evaluated.');
  }
}

export function evaluateEligibility(plan, answers = {}) {
  const questionsById = new Map(plan.questions.map((q) => [q.id, q]));
  const breakdown = plan.criteria.map((c) => evaluateCriterion(c, answers, questionsById));

  const counts = {
    matched: breakdown.filter((b) => b.result === RESULT.MATCHED).length,
    notMatched: breakdown.filter((b) => b.result === RESULT.NOT_MATCHED).length,
    unknown: breakdown.filter((b) => b.result === RESULT.UNKNOWN).length,
    total: breakdown.length
  };

  // Unknown rows split into "you didn't answer" vs "our data can't say".
  const dataGaps = breakdown.filter(
    (b) => b.type === 'unresolvable' && b.result === RESULT.UNKNOWN
  ).length;
  const unanswered = counts.unknown - dataGaps;

  let status;
  if (breakdown.length === 0) status = STATUS.CANNOT_DETERMINE;
  else if (counts.notMatched > 0) status = STATUS.NOT_ELIGIBLE;
  else if (counts.unknown > 0) status = STATUS.NEEDS_INFO;
  else status = STATUS.POTENTIALLY_ELIGIBLE;

  return {
    status,
    statusLabel: STATUS_LABEL[status],
    breakdown,
    counts: { ...counts, unanswered, dataGaps },
    explanation: buildExplanation(status, breakdown, { unanswered, dataGaps }),
    notes: plan.notes
  };
}

function buildExplanation(status, breakdown, { unanswered, dataGaps }) {
  const failed = breakdown.filter((b) => b.result === RESULT.NOT_MATCHED);
  const unknownRows = breakdown.filter((b) => b.result === RESULT.UNKNOWN);

  switch (status) {
    case STATUS.CANNOT_DETERMINE:
      return 'The scheme data we hold does not list any eligibility criteria that can be checked, so a result cannot be determined. Please read the official scheme guidelines.';

    case STATUS.NOT_ELIGIBLE: {
      const names = failed.map((f) => f.label.toLowerCase()).join(', ');
      return `Based on your answers, you do not appear to meet ${failed.length === 1 ? 'one requirement' : `${failed.length} requirements`} of this scheme (${names}). A single unmet requirement is enough for this preliminary assessment to show “Not Eligible”.`;
    }

    case STATUS.NEEDS_INFO: {
      const parts = [];
      if (unanswered > 0) {
        parts.push(
          `${unanswered} requirement${unanswered === 1 ? ' was' : 's were'} not answered or marked unsure`
        );
      }
      if (dataGaps > 0) {
        parts.push(
          `${dataGaps} requirement${dataGaps === 1 ? ' cannot' : 's cannot'} be checked because the scheme data is incomplete`
        );
      }
      return `None of your answers conflict with the scheme, but ${parts.join(' and ')}. We therefore cannot say whether you are potentially eligible. ${
        unknownRows.length ? 'Answer the missing questions or confirm the details on the official source.' : ''
      }`.trim();
    }

    case STATUS.POTENTIALLY_ELIGIBLE:
    default:
      return 'Every requirement we could check matched your answers, so you are potentially eligible. Some conditions are self-declared and have not been verified.';
  }
}

// ---------------------------------------------------------------------
// Convenience: how many questions have a usable answer?
// ---------------------------------------------------------------------

export function isAnswered(value) {
  return !isBlank(value);
}

export function countAnswered(plan, answers = {}) {
  return plan.questions.filter((q) => isAnswered(answers[q.id])).length;
}
