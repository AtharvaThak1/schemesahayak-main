import React, { useEffect, useRef } from 'react';
import { RESULT, RESULT_LABEL, STATUS } from '../../utils/eligibilityEngine.js';

// Visual treatment per overall status. Colour is never the only signal:
// every state also has its own icon and a text label.
const STATUS_STYLE = {
  [STATUS.POTENTIALLY_ELIGIBLE]: {
    icon: 'fa-circle-check',
    banner: 'bg-emerald-50 border-emerald-200',
    iconWrap: 'bg-emerald-100 text-emerald-600',
    title: 'text-emerald-800',
    tag: 'Preliminary result'
  },
  [STATUS.NOT_ELIGIBLE]: {
    icon: 'fa-circle-xmark',
    banner: 'bg-red-50 border-red-200',
    iconWrap: 'bg-red-100 text-red-600',
    title: 'text-red-800',
    tag: 'Preliminary result'
  },
  [STATUS.NEEDS_INFO]: {
    icon: 'fa-circle-question',
    banner: 'bg-amber-50 border-amber-200',
    iconWrap: 'bg-amber-100 text-amber-600',
    title: 'text-amber-800',
    tag: 'Incomplete'
  },
  [STATUS.CANNOT_DETERMINE]: {
    icon: 'fa-circle-info',
    banner: 'bg-slate-100 border-slate-300',
    iconWrap: 'bg-slate-200 text-slate-600',
    title: 'text-slate-800',
    tag: 'Not enough scheme data'
  }
};

const RESULT_STYLE = {
  [RESULT.MATCHED]: {
    icon: 'fa-circle-check',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rail: 'border-l-emerald-500'
  },
  [RESULT.NOT_MATCHED]: {
    icon: 'fa-circle-xmark',
    badge: 'bg-red-50 text-red-700 border-red-200',
    rail: 'border-l-red-500'
  },
  [RESULT.UNKNOWN]: {
    icon: 'fa-circle-question',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    rail: 'border-l-amber-400'
  }
};

function CountChip({ icon, tone, count, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${tone}`}>
      <i className={`fa-solid ${icon}`} aria-hidden="true"></i>
      {count} {label}
    </span>
  );
}

export default function EligibilityResult({
  scheme,
  plan,
  evaluation,
  onEditAnswers,
  onResetAndRecheck,
  onChooseAnother,
  onViewScheme
}) {
  const headingRef = useRef(null);

  // Move focus to the result so screen-reader users hear the outcome.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const style = STATUS_STYLE[evaluation.status];
  const applicationUrl = scheme?.source?.official_website || null;
  const hasQuestions = plan.questions.length > 0;

  const isAiGenerated = Boolean(scheme?.ai_advisor?.generated);
  const isUnverified = scheme?.verification?.verified !== true;

  return (
    <section aria-labelledby="result-heading" className="space-y-6">
      {/* ---------- A. STATUS ---------- */}
      <div className={`rounded-xl border p-5 sm:p-6 ${style.banner}`} role="status">
        <div className="flex items-start gap-4">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${style.iconWrap}`}
            aria-hidden="true"
          >
            <i className={`fa-solid ${style.icon}`}></i>
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              {style.tag} · {scheme.scheme_name}
            </p>
            <h2
              id="result-heading"
              ref={headingRef}
              tabIndex={-1}
              className={`text-xl sm:text-2xl font-extrabold tracking-tight outline-none ${style.title}`}
            >
              {evaluation.statusLabel}
            </h2>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed mt-2">{evaluation.explanation}</p>

            {evaluation.counts.total > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                <CountChip
                  icon="fa-circle-check"
                  tone="bg-white text-emerald-700 border-emerald-200"
                  count={evaluation.counts.matched}
                  label="matched"
                />
                <CountChip
                  icon="fa-circle-xmark"
                  tone="bg-white text-red-700 border-red-200"
                  count={evaluation.counts.notMatched}
                  label="not matched"
                />
                <CountChip
                  icon="fa-circle-question"
                  tone="bg-white text-amber-700 border-amber-200"
                  count={evaluation.counts.unknown}
                  label="unknown"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---------- Mandatory disclaimer ---------- */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
        <i className="fa-solid fa-scale-balanced text-blue-600 mt-0.5" aria-hidden="true"></i>
        <p className="text-xs text-slate-700 leading-relaxed">
          <strong className="text-slate-900">This is a preliminary assessment only.</strong> It compares your answers with
          the eligibility information held for this scheme. It is not an official confirmation, and final eligibility is
          decided by the relevant government authority after they review your application and documents.
        </p>
      </div>

      {(isAiGenerated || isUnverified) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <i className="fa-solid fa-triangle-exclamation text-amber-600 mt-0.5" aria-hidden="true"></i>
          <p className="text-xs text-slate-700 leading-relaxed">
            {isAiGenerated
              ? 'This scheme was generated by AI and its eligibility rules have not been verified against the official source. Treat this result with extra caution.'
              : 'The eligibility information for this scheme has not been marked as verified. Please confirm the criteria on the official source.'}
          </p>
        </div>
      )}

      {/* ---------- B. BREAKDOWN ---------- */}
      {evaluation.breakdown.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-2xs border border-slate-200">
          <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
            <i className="fa-solid fa-clipboard-list text-indigo-600" aria-hidden="true"></i> Eligibility breakdown
          </h3>

          <ul className="space-y-3">
            {evaluation.breakdown.map((row) => {
              const rs = RESULT_STYLE[row.result];
              return (
                <li key={row.id} className={`rounded-lg border border-slate-200 border-l-4 ${rs.rail} p-4 bg-white`}>
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 flex-1 min-w-0">
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Requirement</dt>
                        <dd className="text-xs sm:text-sm text-slate-800 font-medium leading-relaxed">
                          <span className="text-slate-500 font-semibold">{row.label}: </span>
                          {row.requirement}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Your answer</dt>
                        <dd className="text-xs sm:text-sm text-slate-800 font-medium">{row.userAnswer}</dd>
                      </div>
                    </dl>

                    <span
                      className={`inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap ${rs.badge}`}
                    >
                      <i className={`fa-solid ${rs.icon}`} aria-hidden="true"></i>
                      {RESULT_LABEL[row.result]}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">{row.reason}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ---------- C. EXPLANATION ---------- */}
      {evaluation.breakdown.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-2xs border border-slate-200">
          <h3 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
            <i className="fa-solid fa-lightbulb text-amber-500" aria-hidden="true"></i> Why you got this result
          </h3>

          <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700">
            {evaluation.breakdown.map((row) => (
              <li key={row.id} className="flex items-start gap-2">
                <i
                  className={`fa-solid ${RESULT_STYLE[row.result].icon} text-[11px] mt-1 ${
                    row.result === RESULT.MATCHED
                      ? 'text-emerald-500'
                      : row.result === RESULT.NOT_MATCHED
                      ? 'text-red-500'
                      : 'text-amber-500'
                  }`}
                  aria-hidden="true"
                ></i>
                <span>
                  <strong className="font-semibold text-slate-800">{row.label} requirement:</strong>{' '}
                  {RESULT_LABEL[row.result]}
                  {row.result === RESULT.UNKNOWN && ' (additional information required)'}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-4 pt-3 border-t border-slate-100 text-xs sm:text-sm text-slate-800">
            <strong>Final result:</strong> {evaluation.statusLabel}.
          </p>

          {evaluation.notes.length > 0 && (
            <ul className="mt-3 space-y-1 text-[11px] text-slate-500">
              {evaluation.notes.map((n) => (
                <li key={n} className="flex items-start gap-2">
                  <i className="fa-solid fa-circle-info mt-0.5" aria-hidden="true"></i>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ---------- Actions ---------- */}
      <div className="bg-white rounded-xl p-5 shadow-2xs border border-slate-200">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">What would you like to do next?</h3>

        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
          {hasQuestions && (
            <button
              type="button"
              onClick={onEditAnswers}
              className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl font-semibold text-xs border border-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-pen-to-square" aria-hidden="true"></i> Edit my answers
            </button>
          )}

          {hasQuestions && (
            <button
              type="button"
              onClick={onResetAndRecheck}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-sm"
            >
              <i className="fa-solid fa-rotate-left" aria-hidden="true"></i> Reset &amp; check again
            </button>
          )}

          <button
            type="button"
            onClick={onChooseAnother}
            className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl font-semibold text-xs border border-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <i className="fa-solid fa-shuffle" aria-hidden="true"></i> Check another scheme
          </button>

          <button
            type="button"
            onClick={onViewScheme}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 border border-slate-700"
          >
            <i className="fa-solid fa-circle-info" aria-hidden="true"></i> View scheme details
          </button>

          {applicationUrl && (
            <a
              href={applicationUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              Official portal <i className="fa-solid fa-arrow-up-right-from-square text-[10px]" aria-hidden="true"></i>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
