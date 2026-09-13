import { Schema } from "effect";

/** The delegated Microsoft grant must be repaired by the same Curator account. */
export class GraphReauthenticationRequired extends Schema.TaggedError<GraphReauthenticationRequired>()(
  "GraphReauthenticationRequired",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

/** OneDrive could not provide a safe folder response. */
export class OneDriveUnavailable extends Schema.TaggedError<OneDriveUnavailable>()(
  "OneDriveUnavailable",
  { message: Schema.String },
  { httpApiStatus: 502 },
) {}

/** The requested OneDrive folder does not exist in the Curator's drive. */
export class OneDriveFolderNotFound extends Schema.TaggedError<OneDriveFolderNotFound>()(
  "OneDriveFolderNotFound",
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}

/** The requested item cannot be used as the narrower Hoofdmap boundary. */
export class InvalidLibrarySelection extends Schema.TaggedError<InvalidLibrarySelection>()(
  "InvalidLibrarySelection",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

/** A different Hoofdmap cannot replace the selected Bibliotheek without a reset. */
export class LibraryAlreadySelected extends Schema.TaggedError<LibraryAlreadySelected>()(
  "LibraryAlreadySelected",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

/** The selected Bibliotheek could not be read or stored safely. */
export class LibraryStoreUnavailable extends Schema.TaggedError<LibraryStoreUnavailable>()(
  "LibraryStoreUnavailable",
  { message: Schema.String },
  { httpApiStatus: 503 },
) {}
