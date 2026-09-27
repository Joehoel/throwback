import { Layer } from "effect";
import { ApplicationSessionLive } from "./auth/application-session.ts";
import { CuratorAccessLive } from "./curator/curator-access.ts";
import { MicrosoftGraphLayer } from "./graph/graph-layer.ts";
import { GraphAccessTokenLive } from "./graph/graph-token.ts";
import { MicrosoftGraphPhotoApiLive } from "./graph/microsoft-graph-photo-api.ts";
import { LibrarySetupLive } from "./library/library-setup.ts";
import { PhotoLibraryLive } from "./photo/photo-library.ts";

const CuratorAccessLayer = CuratorAccessLive.pipe(Layer.provide(ApplicationSessionLive));

const LibrarySetupLayer = LibrarySetupLive.pipe(Layer.provide(MicrosoftGraphLayer));

const PhotoLibraryLayer = PhotoLibraryLive.pipe(
  Layer.provide([GraphAccessTokenLive, MicrosoftGraphPhotoApiLive]),
);

/** Curator, Bibliotheek setup, and protected Foto reads with infrastructure left visible. */
export const ApplicationLive = Layer.mergeAll(
  CuratorAccessLayer,
  LibrarySetupLayer,
  PhotoLibraryLayer,
);
