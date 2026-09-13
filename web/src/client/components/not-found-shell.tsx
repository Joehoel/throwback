import { Link } from "@tanstack/react-router";
import { ShellLayout } from "./shell-layout.tsx";

export function NotFoundShell() {
  return (
    <ShellLayout eyebrow="404 · Niet gevonden">
      <h1 className="font-display text-4xl leading-tight font-semibold text-balance sm:text-5xl">
        Deze pagina bestaat niet.
      </h1>
      <p className="mt-5 max-w-xl text-base leading-7 text-[#665d4d] sm:text-lg">
        Ga terug naar de Beheer-webapp om verder te gaan vanaf de serverbevestigde plek.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex min-h-11 items-center bg-[#245c52] px-5 font-bold text-white outline-offset-4 transition-colors hover:bg-[#19463e] focus-visible:outline-2 focus-visible:outline-[#245c52]"
      >
        Terug naar Throwback
      </Link>
    </ShellLayout>
  );
}
