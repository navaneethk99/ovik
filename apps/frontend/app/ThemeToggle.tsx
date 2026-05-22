"use client";

import React, { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    // Determine the initial theme
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    if (savedTheme) {
      setTheme(savedTheme);
      if (savedTheme === "light") {
        document.documentElement.classList.remove("dark");
      } else {
        document.documentElement.classList.add("dark");
      }
    } else {
      // Default to dark mode for Ovik
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    
    if (nextTheme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-slate-700 dark:text-emerald-100/60 transition-all hover:bg-slate-200/50 dark:hover:bg-teal-400/10 hover:text-teal-600 dark:hover:text-teal-300 active:scale-[0.98]"
      title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
      type="button"
    >
      <div className="flex items-center gap-3">
        {theme === "dark" ? (
          <>
            {/* Sun Icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 text-amber-400 animate-spin-slow"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3v2.25m0 13.5V21M9.75 12h4.5M3 12h2.25m13.5 0H21M5.75 5.75l1.591 1.591M16.657 16.657l1.591 1.591M6 18l1.591-1.591M18 6l-1.591 1.591m-1.409-1.409A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 4.5 4.5Z"
              />
            </svg>
            <span>Light Mode</span>
          </>
        ) : (
          <>
            {/* Moon Icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 text-indigo-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
              />
            </svg>
            <span>Dark Mode</span>
          </>
        )}
      </div>

      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-300/50 dark:bg-teal-400/10 text-slate-500 dark:text-teal-400 uppercase tracking-wider">
        {theme === "dark" ? "Dark" : "Light"}
      </span>
    </button>
  );
}
