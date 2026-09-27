import { is, safeParse, union } from "valibot";
import {
  vBuildUpgradeRequiredEncoded,
  vGraphReauthenticationRequiredEncoded,
  vLibraryStoreUnavailableEncoded,
  vOneDriveUnavailableEncoded,
  vPhotoNotFoundEncoded,
  vPhotoProjectionUnavailableEncoded,
} from "../generated/valibot.gen.ts";
import type {
  ClaimCuratorError,
  GetBootstrapError,
  GetPhotoError,
  GetPhotoPreviewError,
  ListLibraryFoldersError,
  SelectLibraryError,
} from "../generated/types.gen.ts";

export type DomainFailure =
  | { readonly kind: "build-upgrade"; readonly message: string }
  | { readonly kind: "photo-not-found" }
  | { readonly kind: "reauthentication" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unexpected" };

export type DomainFailureInput =
  | ClaimCuratorError
  | GetBootstrapError
  | GetPhotoError
  | GetPhotoPreviewError
  | ListLibraryFoldersError
  | SelectLibraryError;

export const vDomainFailureInput = union([
  vBuildUpgradeRequiredEncoded,
  vGraphReauthenticationRequiredEncoded,
  vLibraryStoreUnavailableEncoded,
  vOneDriveUnavailableEncoded,
  vPhotoNotFoundEncoded,
  vPhotoProjectionUnavailableEncoded,
]);

/** Reduce declared transport errors to the presentation states shared by route shells. */
export function classifyDomainFailure(error: DomainFailureInput): DomainFailure {
  const buildUpgrade = safeParse(vBuildUpgradeRequiredEncoded, error);

  if (buildUpgrade.success) {
    return { kind: "build-upgrade", message: buildUpgrade.output.message };
  }

  if (is(vPhotoNotFoundEncoded, error)) {
    return { kind: "photo-not-found" };
  }

  if (is(vGraphReauthenticationRequiredEncoded, error)) {
    return { kind: "reauthentication" };
  }

  if (
    is(vLibraryStoreUnavailableEncoded, error) ||
    is(vOneDriveUnavailableEncoded, error) ||
    is(vPhotoProjectionUnavailableEncoded, error)
  ) {
    return { kind: "unavailable" };
  }

  return { kind: "unexpected" };
}
