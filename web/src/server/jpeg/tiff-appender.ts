/** Append aligned TIFF structures while keeping all original offsets stable. */
export class TiffAppender {
  readonly #parts: Uint8Array[];
  #length: number;

  /** Start with an immutable copy of the original TIFF bytes. */
  public constructor(original: Uint8Array) {
    this.#parts = [new Uint8Array(original)];
    this.#length = original.length;
  }

  /** Append an aligned byte range and return its TIFF-relative offset. */
  public add(bytes: Uint8Array, align = 2): number {
    const padding = (align - (this.#length % align)) % align;

    if (padding > 0) {
      this.#parts.push(new Uint8Array(padding));
      this.#length += padding;
    }

    const offset = this.#length;
    this.#parts.push(bytes);
    this.#length += bytes.length;

    return offset;
  }

  /** Materialize the bounded TIFF header after all structures were appended. */
  public finish(): Uint8Array {
    const output = new Uint8Array(this.#length);
    let offset = 0;

    for (const part of this.#parts) {
      output.set(part, offset);
      offset += part.length;
    }

    return output;
  }
}
