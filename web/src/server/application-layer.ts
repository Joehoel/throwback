import { Layer } from "effect";
import { ApplicationSessionLive } from "./auth/application-session.ts";
import { CuratorAccessLive } from "./curator/curator-access.ts";
import { MicrosoftGraphLayer } from "./graph/graph-layer.ts";
import { LibrarySetupLive } from "./library/library-setup.ts";

const CuratorAccessLayer = CuratorAccessLive.pipe(Layer.provide(ApplicationSessionLive));

const LibrarySetupLayer = LibrarySetupLive.pipe(Layer.provide(MicrosoftGraphLayer));

/** Curator and Bibliotheek setup services with infrastructure requirements left visible. */
export const ApplicationLive = Layer.mergeAll(CuratorAccessLayer, LibrarySetupLayer);
