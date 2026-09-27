import { parse, safeParse } from "valibot";
import type { GetPhotoData } from "../generated/types.gen.ts";
import { vEventId, vLibraryId, vPhotoId } from "../generated/valibot.gen.ts";

/** Parse every nominal Foto bookmark id through its generated Valibot schema. */
export function parsePhotoBookmark(
  input: Readonly<Record<"eventId" | "libraryId" | "photoId", string>>,
): GetPhotoData["path"] | null {
  const libraryId = safeParse(vLibraryId, input.libraryId);
  const eventId = safeParse(vEventId, input.eventId);
  const photoId = safeParse(vPhotoId, input.photoId);

  if (!libraryId.success || !eventId.success || !photoId.success) {
    return null;
  }

  return {
    libraryId: libraryId.output,
    eventId: eventId.output,
    photoId: photoId.output,
  };
}

/** Assert parsed Foto bookmark ids after TanStack has accepted the route params. */
export function assertPhotoBookmark(
  input: Readonly<Record<"eventId" | "libraryId" | "photoId", string>>,
): GetPhotoData["path"] {
  return {
    libraryId: parse(vLibraryId, input.libraryId),
    eventId: parse(vEventId, input.eventId),
    photoId: parse(vPhotoId, input.photoId),
  };
}
