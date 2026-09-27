import { useQuery } from "@tanstack/react-query";
import type { GetPhotoData, Photo } from "../generated/types.gen.ts";
import { photoQueryOptions } from "../api/photo.ts";
import { ReviewShell } from "./review-shell.tsx";

/** Keep the visible Foto read model fresh while preview bytes remain memory-only. */
export function PhotoReviewRoute({
  initialPhoto,
  path,
  preview,
}: {
  readonly initialPhoto: Photo;
  readonly path: GetPhotoData["path"];
  readonly preview: Blob;
}) {
  const photo = useQuery({
    ...photoQueryOptions(path),
    initialData: initialPhoto,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  return <ReviewShell error={photo.error} photo={photo.data} preview={preview} />;
}
