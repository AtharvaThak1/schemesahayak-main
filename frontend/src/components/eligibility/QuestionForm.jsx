import React from 'react';
import { countAnswered } from '../../utils/eligibilityEngine.js';

const GROUPS = [
  {
    key: 'about',
    title: 'About you',
    icon: 'fa-user',
    hint: null,
    match: (q) => !q.group
  },
  {
    key: 'exclusions',
    title: 'Exclusions',
    icon: 'fa-ban',
    hint: 'The scheme lists these as reasons a person is not covered.',
    match: (q) => q.group === 'exclusions'
  },
  {
    key: 'conditions',
    title: 'Scheme conditions',
    icon: 'fa-list-check',
    hint: 'Written as text in the scheme data. We can only rely on your own answer, which is not verified.',
    match: (q) => q.group === 'conditions'
  }
];

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' }
];

const YES_NO_UNSURE = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Not sure' }
];

function Segmented({ id, labelledBy, options, value, onChange }) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} id={id} className="inline-flex flex-wrap gap-2">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            // Clicking the selected option again clears the answer, so
            // "not answered" is always reachable.
            onClick={() => onChange(selected ? '' : opt.value)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              selected
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {selected && <i className="fa-solid fa-check mr-1.5 text-[10px]" aria-hidden="true"></i>}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Question({ question, number, value, onChange }) {
  const labelId = `q-label-${question.id}`;
  const inputId = `q-input-${question.id}`;
  const helpId = `q-help-${question.id}`;

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span
          className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5"
          aria-hidden="true"
        >
          {number}
        </span>

        <div className="flex-1 min-w-0">
          <p id={labelId} className="text-xs sm:text-sm font-semibold text-slate-900">
            {question.label}
          </p>

          {question.statement && (
            <blockquote className="mt-1.5 text-xs text-slate-700 bg-slate-50 border-l-4 border-indigo-300 rounded-r-lg px-3 py-2 leading-relaxed">
              {question.statement}
            </blockquote>
          )}

          {question.help && (
            <p id={helpId} className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              {question.help}
            </p>
          )}

          <div className="mt-2.5">
            {question.kind === 'number' && (
              <div className="flex items-center gap-2 max-w-xs">
                <input
                  id={inputId}
                  type="number"
                  inputMode="numeric"
                  min={question.min}
                  max={question.max}
                  step="1"
                  value={value ?? ''}
                  onChange={(e) => onChange(e.target.value)}
                  aria-labelledby={labelId}
                  aria-describedby={question.help ? helpId : undefined}
                  placeholder={question.id === 'income' ? 'e.g. 250000' : 'e.g. 35'}
                  className="w-full px-3 py-2.5 bg-white text-slate-900 rounded-lg text-sm border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                {question.unit && <span className="text-[11px] text-slate-500 whitespace-nowrap">{question.unit}</span>}
              </div>
            )}

            {question.kind === 'select' && (
              <select
                id={inputId}
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value)}
                aria-labelledby={labelId}
                aria-describedby={question.help ? helpId : undefined}
                className="w-full max-w-xs px-3 py-2.5 bg-white text-slate-900 rounded-lg text-sm border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer"
              >
                <option value="">Select an option…</option>
                {question.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}

            {question.kind === 'yesno' && (
              <Segmented id={inputId} labelledBy={labelId} options={YES_NO} value={value} onChange={onChange} />
            )}

            {question.kind === 'tri' && (
              <Segmented id={inputId} labelledBy={labelId} options={YES_NO_UNSURE} value={value} onChange={onChange} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Step 2: dynamic questions generated from the scheme's own eligibility
// data. Nothing here is hard-coded per scheme.
export default function QuestionForm({ plan, answers, onAnswer, onSubmit, onReset }) {
  const total = plan.questions.length;
  const answered = countAnswered(plan, answers);
  const percent = total === 0 ? 0 : Math.round((answered / total) * 100);

  let runningNumber = 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      noValidate
      aria-labelledby="form-heading"
    >
      {/* Progress */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs mb-6">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 id="form-heading" className="text-sm font-bold text-slate-900">
            Step 2 · Answer the questions
          </h2>
          <span className="text-[11px] font-bold text-slate-600" aria-live="polite">
            {answered} of {total} answered
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={answered}
          aria-label="Questions answered"
          className="h-2 w-full bg-slate-100 rounded-full overflow-hidden"
        >
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>

        <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
          <i className="fa-solid fa-lock text-slate-400 mr-1.5" aria-hidden="true"></i>
          Your answers stay in this browser tab only. They are not saved, uploaded or sent to any service, and they are
          cleared when you reset or leave this page. You can skip any question — it will be marked “Unknown”.
        </p>
      </div>

      {/* Question groups */}
      <div className="space-y-6">
        {GROUPS.map((group) => {
          const items = plan.questions.filter(group.match);
          if (items.length === 0) return null;

          return (
            <fieldset key={group.key} className="bg-white rounded-xl p-6 shadow-2xs border border-slate-200">
              <legend className="sr-only">{group.title}</legend>

              <h3
                className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3 mb-1"
                aria-hidden="true"
              >
                <i className={`fa-solid ${group.icon} text-indigo-600`}></i> {group.title}
              </h3>
              {group.hint && <p className="text-[11px] text-slate-500 mt-2 mb-1">{group.hint}</p>}

              <div className="divide-y divide-slate-100 mt-2">
                {items.map((q) => {
                  runningNumber += 1;
                  return (
                    <Question
                      key={q.id}
                      question={q}
                      number={runningNumber}
                      value={answers[q.id]}
                      onChange={(v) => onAnswer(q.id, v)}
                    />
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      {/* Actions */}
      <div className="mt-8 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={onReset}
          disabled={answered === 0}
          className="px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl font-semibold text-xs border border-slate-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <i className="fa-solid fa-rotate-left mr-2" aria-hidden="true"></i> Reset answers
        </button>

        <button
          type="submit"
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
        >
          <i className="fa-solid fa-clipboard-check" aria-hidden="true"></i> Check eligibility
        </button>
      </div>
    </form>
  );
}
