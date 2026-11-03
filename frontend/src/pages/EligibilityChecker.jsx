import React, { useEffect, useMemo, useState } from 'react';
import SchemePicker from '../components/eligibility/SchemePicker.jsx';
import QuestionForm from '../components/eligibility/QuestionForm.jsx';
import EligibilityResult from '../components/eligibility/EligibilityResult.jsx';
import { getSchemeById } from '../services/api.js';
import { buildEligibilityPlan, evaluateEligibility } from '../utils/eligibilityEngine.js';

// =====================================================================
// SMART ELIGIBILITY CHECKER
// =====================================================================
//
// Privacy: everything the citizen types lives in this component's React
// state. Nothing is written to localStorage / sessionStorage, nothing is
// sent to the backend or to Gemini, and unmounting the page (or pressing
// Reset) discards it. Only the scheme itself is fetched, through the
// existing getSchemeById() service.
// =====================================================================

const STEPS = [
  { key: 'pick', label: 'Choose scheme' },
  { key: 'form', label: 'Answer questions' },
  { key: 'result', label: 'See result' }
];

function Hero({ step, scheme, navigateTo }) {
  const activeIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <section className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white py-10 px-4 sm:px-6 lg:px-8 shadow-inner">
      <div className="max-w-5xl mx-auto">
        <nav aria-label="Breadcrumb" className="text-xs font-medium text-blue-200 mb-3 flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => navigateTo('home')} className="hover:underline hover:text-white cursor-pointer">
            Home
          </button>
          <span aria-hidden="true">/</span>
          <span className="text-white">Eligibility Checker</span>
          {scheme && (
            <>
              <span aria-hidden="true">/</span>
              <span className="text-blue-200 truncate max-w-xs">{scheme.scheme_name}</span>
            </>
          )}
        </nav>

        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2 flex items-center gap-3">
          <i className="fa-solid fa-clipboard-check text-blue-300" aria-hidden="true"></i>
          Smart Eligibility Checker
        </h1>
        <p className="text-blue-100 text-xs sm:text-sm max-w-2xl opacity-90">
          Check whether you may qualify for a scheme — no documents, no sign-up. Answers are compared with the
          scheme&apos;s own eligibility criteria, right here in your browser.
        </p>

        <ol className="mt-6 flex flex-wrap items-center gap-2 sm:gap-3" aria-label="Progress">
          {STEPS.map((s, i) => {
            const done = i < activeIndex;
            const current = i === activeIndex;
            return (
              <li
                key={s.key}
                aria-current={current ? 'step' : undefined}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold border ${
                  current
                    ? 'bg-white text-blue-900 border-white'
                    : done
                    ? 'bg-blue-500/30 text-white border-blue-300/50'
                    : 'bg-white/5 text-blue-200 border-white/20'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                    current ? 'bg-blue-900 text-white' : 'bg-white/20'
                  }`}
                  aria-hidden="true"
                >
                  {done ? <i className="fa-solid fa-check"></i> : i + 1}
                </span>
                {s.label}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function SchemeSummary({ scheme, plan, onChange }) {
  const checked = plan.criteria.map((c) => c.label);
  const unique = [...new Set(checked)];

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs mb-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Selected scheme</p>
          <h2 className="text-base font-bold text-slate-900">{scheme.scheme_name}</h2>
          {scheme.description?.summary && (
            <p className="text-xs text-slate-600 mt-1 leading-relaxed line-clamp-2">{scheme.description.summary}</p>
          )}
        </div>

        <button
          type="button"
          onClick={onChange}
          className="shrink-0 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors cursor-pointer"
        >
          <i className="fa-solid fa-shuffle mr-2" aria-hidden="true"></i> Change scheme
        </button>
      </div>

      {unique.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-[11px] text-slate-500 mb-2">This scheme&apos;s data lets us check:</p>
          <div className="flex flex-wrap gap-2">
            {unique.map((label) => (
              <span
                key={label}
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EligibilityChecker({ schemeId, navigateTo, openEligibility, openSchemeDetail }) {
  const [scheme, setScheme] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Temporary, in-memory only.
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(null);

  // ------------------------------------------------------------------
  // Load the selected scheme (existing service, nothing new on the API)
  // ------------------------------------------------------------------
  const loadScheme = (id, signal) => {
    setLoading(true);
    setError(null);
    setScheme(null);

    getSchemeById(id, { signal })
      .then((detail) => {
        if (!detail) {
          setError('not-found');
          return;
        }
        setScheme(detail);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setError(err?.status === 404 || err?.status === 400 ? 'not-found' : 'error');
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  };

  useEffect(() => {
    // Any change of scheme (or leaving the page) wipes previous answers.
    setAnswers({});
    setSubmitted(null);
    setScheme(null);
    setError(null);

    if (!schemeId) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    loadScheme(schemeId, controller.signal);
    return () => controller.abort();
  }, [schemeId]);

  const plan = useMemo(() => (scheme ? buildEligibilityPlan(scheme) : null), [scheme]);

  // A scheme with nothing to ask goes straight to its (honest) result.
  const autoEvaluation = useMemo(
    () => (plan && plan.questions.length === 0 ? evaluateEligibility(plan, {}) : null),
    [plan]
  );

  const evaluation = submitted || autoEvaluation;

  const step = !schemeId || (!scheme && !loading && !error) ? 'pick' : evaluation ? 'result' : 'form';

  // Bring the new step into view.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step, schemeId]);

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------
  const handleAnswer = (id, value) => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === '' || value === null || value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });
  };

  const handleSubmit = () => setSubmitted(evaluateEligibility(plan, answers));
  const handleResetAnswers = () => setAnswers({});
  const handleEditAnswers = () => setSubmitted(null);
  const handleResetAndRecheck = () => {
    setAnswers({});
    setSubmitted(null);
  };
  const handleChooseAnother = () => {
    setAnswers({});
    setSubmitted(null);
    openEligibility(null);
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="view-section">
      <Hero step={step} scheme={scheme} navigateTo={navigateTo} />

      {step === 'pick' && <SchemePicker onSelect={(id) => openEligibility(id)} />}

      {schemeId && loading && (
        <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8" aria-busy="true" aria-live="polite">
          <div className="animate-pulse space-y-4">
            <div className="h-24 bg-white rounded-xl border border-slate-200" />
            <div className="h-40 bg-white rounded-xl border border-slate-200" />
          </div>
          <span className="sr-only">Loading scheme…</span>
        </section>
      )}

      {schemeId && !loading && error && (
        <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center text-2xl mb-4">
            <i
              className={`fa-solid ${error === 'not-found' ? 'fa-magnifying-glass' : 'fa-triangle-exclamation'}`}
              aria-hidden="true"
            ></i>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">
            {error === 'not-found' ? 'Scheme not found.' : 'Unable to load this scheme. Please try again.'}
          </h2>
          <div className="flex items-center justify-center gap-3 mt-5">
            {error !== 'not-found' && (
              <button
                type="button"
                onClick={() => loadScheme(schemeId)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={() => openEligibility(null)}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
            >
              Choose another scheme
            </button>
          </div>
        </section>
      )}

      {scheme && plan && step === 'form' && (
        <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <SchemeSummary scheme={scheme} plan={plan} onChange={handleChooseAnother} />
          <QuestionForm
            plan={plan}
            answers={answers}
            onAnswer={handleAnswer}
            onSubmit={handleSubmit}
            onReset={handleResetAnswers}
          />
        </section>
      )}

      {scheme && plan && step === 'result' && (
        <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <EligibilityResult
            scheme={scheme}
            plan={plan}
            evaluation={evaluation}
            onEditAnswers={handleEditAnswers}
            onResetAndRecheck={handleResetAndRecheck}
            onChooseAnother={handleChooseAnother}
            onViewScheme={() => openSchemeDetail(scheme.scheme_id)}
          />
        </section>
      )}
    </div>
  );
}
