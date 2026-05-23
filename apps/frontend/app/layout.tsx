import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import ThemeToggle from "./ThemeToggle";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Ovik Attendance",
  description: "Frontend for attendance monitoring and review.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.theme === 'light') {
                  document.documentElement.classList.remove('dark');
                } else {
                  document.documentElement.classList.add('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="flex h-full bg-[#f8faf9] dark:bg-[#07100f] text-slate-800 dark:text-emerald-50 antialiased transition-colors duration-200">
        <aside className="fixed inset-y-0 left-0 w-64 border-r border-slate-200 dark:border-teal-200/10 bg-white/80 dark:bg-black/20 backdrop-blur-xl transition-colors duration-200">
          <div className="flex h-full flex-col p-6">
            <div className="mb-10 flex items-center gap-2 px-2">
              <Image
                src="/images/logo.svg"
                alt="OVIK logo"
                className="h-6 w-6"
                width={10}
                height={10}
              />
              <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-emerald-50">
                OVIK
              </span>
            </div>

            <nav className="flex-1 space-y-1">
              <Link
                href="/"
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors hover:bg-teal-500/10 hover:text-teal-600 dark:hover:bg-teal-400/10 dark:hover:text-teal-300"
              >
                Dashboard
              </Link>
              <Link
                href="/employees"
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors hover:bg-teal-500/10 hover:text-teal-600 dark:hover:bg-teal-400/10 dark:hover:text-teal-300"
              >
                Employees
              </Link>
              <Link
                href="/register"
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors hover:bg-teal-500/10 hover:text-teal-600 dark:hover:bg-teal-400/10 dark:hover:text-teal-300"
              >
                Register
              </Link>
              <Link
                href="/system-control"
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors hover:bg-teal-500/10 hover:text-teal-600 dark:hover:bg-teal-400/10 dark:hover:text-teal-300"
              >
                System Control
              </Link>
            </nav>

            <div className="mt-auto space-y-4 pt-6">
              <ThemeToggle />

              <Link href="/system-control" className="block group">
                <div className="rounded-2xl bg-teal-500/[0.03] dark:bg-teal-400/5 p-4 border border-teal-500/10 dark:border-teal-400/10 transition-colors group-hover:bg-teal-500/[0.08] dark:group-hover:bg-teal-400/10">
                  <p className="text-xs text-teal-600 dark:text-teal-400/70 mb-1">
                    Status
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></div>
                    <span className="text-sm font-medium text-slate-800 dark:text-emerald-50">
                      System Controller
                    </span>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </aside>

        <main className="flex-1 pl-64 overflow-auto">
          <div className="mx-auto min-h-full">{children}</div>
        </main>
      </body>
    </html>
  );
}
