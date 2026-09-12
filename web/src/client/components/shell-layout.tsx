import type { ReactNode } from "react";

export function ShellLayout({ children, eyebrow }: { children: ReactNode; eyebrow: string }) {
  return (
    <main className="min-h-screen bg-[#f4f0e7] px-5 py-8 text-[#26231d] sm:px-8 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <section className="w-full border border-[#d8d0c1] bg-[#fffdf8] p-7 sm:p-12">
          <p className="mb-5 text-xs font-bold tracking-[0.18em] text-[#736957] uppercase">
            {eyebrow}
          </p>
          {children}
        </section>
      </div>
    </main>
  );
}
