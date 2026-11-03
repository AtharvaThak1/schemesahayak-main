import React from 'react';

export default function Header({ currentView, navigateTo, openEligibilityChecker }) {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[82px] flex items-center justify-between">

    {/* ================= BRAND ================= */}
    <button
      onClick={() => navigateTo('home')}
      className="group flex items-center text-left"
    >

      {/* LOGO */}
      <div className="
        w-12 h-12
        sm:w-14 sm:h-14
        lg:w-15 lg:h-15
        flex items-center justify-center
        shrink-0
        mr-2.5 sm:mr-3
      ">
        <img
          src="/schemesahayak.svg"
          alt="Scheme Sahayak"
          className="
            w-full
            h-full
            object-contain
            scale-[1.08]
            drop-shadow-[0_3px_5px_rgba(15,23,42,0.16)]
            transition-all
            duration-300
            group-hover:scale-[1.14]
            group-hover:drop-shadow-[0_5px_10px_rgba(37,99,235,0.22)]
          "
        />
      </div>


      {/* ================= WORDMARK ================= */}
      <div className="flex flex-col justify-center">

        {/* Main title */}
        <div className="
          flex
          items-baseline
          whitespace-nowrap
          leading-none
        ">

          <span className="
            text-[27px]
            sm:text-[30px]
            lg:text-[33px]
            font-black
            tracking-[-1.8px]
            text-[#0b1f3a]
            transition-colors
            duration-200
            group-hover:text-[#102b52]
          ">
            Scheme
          </span>

          <span className="
            text-[27px]
            sm:text-[30px]
            lg:text-[33px]
            font-black
            tracking-[-1.8px]
            text-blue-800
            ml-[6px]
            sm:ml-[7px]
            lg:ml-[8px]
            transition-colors
            duration-200
            
          ">
            Sahayak
          </span>

        </div>


        {/* Subtitle */}
        <span className="
          mt-[5px]
          text-[8px]
          sm:text-[9px]
          lg:text-[10px]
          font-bold
          uppercase
          tracking-[1px]
          sm:tracking-[2.2px]
          text-slate-500
          whitespace-nowrap
        ">
          Your Guide to Government Schemes
        </span>


        {/* Tricolor accent */}
        <div className="
          flex
          h-[3px]
          w-[115px]
          sm:w-[135px]
          lg:w-[155px]
          mt-[7px]
          overflow-hidden
        ">
          <div className="w-1/3 bg-[#ff9933]" />
          <div className="w-1/3 bg-slate-200" />
          <div className="w-1/3 bg-[#138808]" />
        </div>

      </div>

    </button>


    {/* ================= ACTIONS ================= */}
    <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">

      {/* ELIGIBILITY CHECKER */}
      <button
        onClick={() =>
          typeof openEligibilityChecker === 'function'
            ? openEligibilityChecker()
            : navigateTo('eligibility')
        }
        title="Smart Eligibility Checker"
        aria-label="Smart Eligibility Checker"
        aria-current={
          currentView === 'eligibility'
            ? 'page'
            : undefined
        }
        className={`
          group
          h-10 w-10
          sm:w-auto
          sm:h-12
          px-0
          sm:px-4
          cursor-pointer
          rounded-full
          border
          flex
          items-center
          justify-center
          gap-2
          text-xs
          font-bold
          shadow-sm
          hover:shadow-md
          transition-all
          duration-200
          hover:-translate-y-0.5
          ${
            currentView === 'eligibility'
              ? 'bg-indigo-600 border-indigo-600 text-white'
              : 'bg-slate-50 hover:bg-indigo-50 border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700'
          }
        `}
      >
        <i className="fa-solid fa-clipboard-check text-[16px]" aria-hidden="true" />
        <span className="hidden md:inline">
          Check Eligibility
        </span>
      </button>

      <button
        onClick={() =>
          navigateTo(
            currentView === 'search'
              ? 'home'
              : 'search'
          )
        }
        title={
          currentView === 'search'
            ? 'Go to AI Home'
            : 'Search Scheme Directory'
        }
        className="
          group
          w-10 h-10
          cursor-pointer
          sm:w-12 sm:h-12
        
          rounded-full

          bg-slate-50
          hover:bg-blue-50

          border
          border-slate-200
          hover:border-blue-300

          text-slate-700
          hover:text-blue-600

          flex
          items-center
          justify-center

          shadow-sm
          hover:shadow-md

          transition-all
          duration-200

          hover:-translate-y-0.5
        "
      >

        <i
          className={`
            fa-solid
            ${
              currentView === 'search'
                ? 'fa-robot'
                : 'fa-magnifying-glass'
            }
            text-[17px]
            transition-transform
            duration-200
            group-hover:scale-110
          `}
        />

      </button>

    </div>

  </div>
</header>
  );
}
