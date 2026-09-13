import type { BootstrapState } from "../generated/types.gen.ts";

export function ReviewShell({ state }: { readonly state: BootstrapState }) {
  return (
    <main className="grid min-h-screen bg-[#191816] text-[#fffdf8] lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="flex min-h-[58vh] items-center justify-center border-b border-[#3c3933] p-6 lg:min-h-screen lg:border-r lg:border-b-0">
        <div className="aspect-[4/3] w-full max-w-4xl border border-dashed border-[#5a554c] bg-[#22201d]" />
      </section>
      <aside className="bg-[#fffdf8] p-6 text-[#26231d] sm:p-8">
        <p className="text-xs font-bold tracking-[0.18em] text-[#736957] uppercase">Review</p>
        <h1 className="font-display mt-5 text-3xl leading-tight font-semibold">
          Foto wordt voorbereid
        </h1>
        <p className="mt-4 leading-7 text-[#665d4d]">
          Deze vaste bookmark is klaar voor de Foto-editor zodra de Bibliotheek is geïndexeerd.
        </p>
        <p className="mt-8 border border-[#d8d0c1] bg-[#f4f0e7] px-4 py-3 text-sm font-semibold text-[#665d4d]">
          {"discoveredPhotos" in state
            ? `${state.discoveredPhotos} Fotos gevonden`
            : "Reviewstatus bevestigd door de server"}
        </p>
      </aside>
    </main>
  );
}
