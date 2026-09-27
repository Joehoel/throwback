import { createHash } from "node:crypto";
import type { Hash } from "node:crypto";

/** Constant-memory SHA-256 fingerprint for byte preservation comparisons. */
export class ByteFingerprint {
  readonly #hash: Hash = createHash("sha256");

  /** Add the next bytes in order. */
  public update(bytes: Uint8Array): void {
    this.#hash.update(bytes);
  }

  /** Finish the deterministic fingerprint. */
  public digest(): string {
    return this.#hash.digest("hex");
  }
}

/** Fingerprint one bounded byte value. */
export function fingerprint(bytes: Uint8Array): string {
  const hash = new ByteFingerprint();

  hash.update(bytes);

  return hash.digest();
}
