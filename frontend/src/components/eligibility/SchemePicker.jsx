import React, { useEffect, useMemo, useState } from 'react';
import { getSchemes } from '../../services/api.js';

const PAGE_SIZE = 12;

// Step 1 of the Eligibility Checker: choose a scheme from the existing
// directory. Reuses the same /api/schemes data as the Directory page and
// filters it locally so searching feels instant.
export default function SchemePicker({ onSelect }) {
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);

  const load = (signal) => {
    setLoading(true);
    setError(false);
    getSchemes({ signal })
      .then(({ items }) => {
        // De-duplicate by id (the dataset repeats a few schemes).
        const seen = new Set();
        setSchemes(
          items.filter((s) => {
            if (seen.has(s.id)) return false;
            seen.add(s.id);
            return true;
          })
        );
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setError(true);
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return schemes;
    return schemes.filter((s) =>
      [s.name, s.nameLocal, s.category, s.summary, ...(s.keywords || [])]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    );
  }, [schemes, query]);

  const shown = filtered.slice(0, visible);

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8" aria-labelledby="picker-heading">
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs mb-6">
        <h2 id="picker-heading" className="text-sm font-bold text-slate-900 mb-1">
          Step 1 · Choose a scheme
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Pick the scheme you want to check. We will then ask only the questions that scheme actually needs.
        </p>

        <div className="relative">
          <label htmlFor="eligibility-scheme-search" className="sr-only">
            Search schemes
          </label>
          <input
            id="eligibility-scheme-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search schemes (e.g. Kisan, Pension, Scholarship)..."
            className="w-full pl-10 pr-4 py-3 bg-slate-50 text-slate-900 rounded-xl text-xs sm:text-sm font-medium border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
          <i className="fa-solid fa-magnifying-glass absolute left-4 top-3.5 text-slate-400 text-sm" aria-hidden="true"></i>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-14">
          <p className="text-sm font-semibold text-slate-700 mb-3">Unable to load schemes. Please try again.</p>
          <button
            type="button"
            onClick={() => load()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-14">
          <p className="text-sm font-semibold text-slate-700">No scheme matches “{query}”.</p>
          <p className="text-xs text-slate-500 mt-1">Try a shorter keyword.</p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <p className="text-xs font-bold text-slate-600 mb-3" aria-live="polite">
            Showing {shown.length} of {filtered.length} schemes
          </p>

          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {shown.map((scheme) => (
              <li key={scheme.id}>
                <button
                  type="button"
                  onClick={() => onSelect(scheme.id)}
                  className="w-full h-full text-left bg-white rounded-xl p-4 border border-slate-200 hover:border-indigo-400 hover:shadow-sm shadow-2xs transition-all group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl p-2 bg-slate-50 rounded-lg border border-slate-100 shrink-0" aria-hidden="true">
                      {scheme.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        {scheme.governmentLevel && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                            {scheme.governmentLevel}
                          </span>
                        )}
                        {scheme.category && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {scheme.category}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
                        {scheme.name}
                      </h3>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed line-clamp-2">
                        {scheme.summary || 'No description available yet.'}
                      </p>
                      <span className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-semibold text-indigo-600">
                        Check eligibility <i className="fa-solid fa-arrow-right text-[10px]" aria-hidden="true"></i>
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {visible < filtered.length && (
            <div className="flex justify-center mt-8">
              <button
                type="button"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="px-5 py-2.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-colors shadow-2xs cursor-pointer"
              >
                Show {Math.min(PAGE_SIZE, filtered.length - visible)} more
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
