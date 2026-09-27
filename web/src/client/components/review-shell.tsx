import { useEffect, useRef } from "react";
import type { Photo } from "../generated/types.gen.ts";

function AuthenticatedPreview({
  photo,
  preview,
}: {
  readonly photo: Photo;
  readonly preview: Blob;
}) {
  const image = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const element = image.current;
    const url = element === null ? null : URL.createObjectURL(preview);

    if (element !== null && url !== null) {
      element.src = url;
    }

    return () => {
      if (element !== null && url !== null) {
        element.removeAttribute("src");
        URL.revokeObjectURL(url);
      }
    };
  }, [preview]);

  return (
    <img
      ref={image}
      alt={photo.description ?? photo.fileName}
      className="max-h-[calc(100vh-3rem)] w-full max-w-4xl object-contain"
    />
  );
}

export function ReviewShell({ photo, preview }: { readonly photo: Photo; readonly preview: Blob }) {
  return (
    <main className="grid min-h-screen bg-[#191816] text-[#fffdf8] lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="flex min-h-[58vh] items-center justify-center border-b border-[#3c3933] p-6 lg:min-h-screen lg:border-r lg:border-b-0">
        <AuthenticatedPreview
          key={`${photo.photoId}:${photo.projectionRevision}`}
          photo={photo}
          preview={preview}
        />
      </section>
      <aside className="bg-[#fffdf8] p-6 text-[#26231d] sm:p-8">
        <p className="text-xs font-bold tracking-[0.18em] text-[#736957] uppercase">Review</p>
        <h1 className="mt-5 text-3xl leading-tight font-semibold text-balance">
          {photo.description ?? "Nog geen beschrijving"}
        </h1>
        <dl className="mt-8 grid gap-5 border-t border-[#d8d0c1] pt-6 text-sm">
          <div>
            <dt className="font-bold text-[#736957]">Bestand</dt>
            <dd className="mt-1 break-words">{photo.fileName}</dd>
          </div>
          <div>
            <dt className="font-bold text-[#736957]">Locatie</dt>
            <dd className="mt-1">
              {photo.location === null
                ? "Niet vastgelegd"
                : `${photo.location.latitude.toFixed(5)}, ${photo.location.longitude.toFixed(5)}`}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-[#736957]">Oriëntatie</dt>
            <dd className="mt-1">EXIF {photo.orientation}</dd>
          </div>
        </dl>
        <p className="mt-8 border border-[#d8d0c1] bg-[#f4f0e7] px-4 py-3 text-sm font-semibold text-[#665d4d]">
          Projectierevisie {photo.projectionRevision}
        </p>
      </aside>
    </main>
  );
}
