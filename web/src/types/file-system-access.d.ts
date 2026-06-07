/**
 * Ambient types for the bits of the File System Access API and `piexifjs` we use
 * but that the bundled `lib.dom.d.ts` / package don't ship. Kept minimal on
 * purpose — only the surface the local photo source (`src/domains/local/`) touches.
 *
 * No new dependency (deps are owned elsewhere); these declarations cover the gap.
 * Script-style ambient file (global augmentations); oxlint ignores `src/types/**`
 * the way it already ignores `worker-configuration.d.ts`.
 *
 * The File System Access API is Chromium-only and requires a secure context.
 */

// --- File System Access API (gaps in lib.dom.d.ts) ---

interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface FileSystemDirectoryHandle {
  /** Async-iterate the directory's entries (files and subdirectories). */
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface DirectoryPickerOptions {
  mode?: "read" | "readwrite";
  id?: string;
  startIn?: "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}

// Also on the global scope, so `globalThis.showDirectoryPicker` is typed.
declare function showDirectoryPicker(
  options?: DirectoryPickerOptions,
): Promise<FileSystemDirectoryHandle>;

// --- piexifjs (no @types published) ---

declare module "piexifjs" {
  /** An IFD dict: tag number -> value (string, number, or rational tuples). */
  type PiexifIfd = Record<number, unknown>;

  interface PiexifExif {
    "0th"?: PiexifIfd;
    Exif?: PiexifIfd;
    GPS?: PiexifIfd;
    Interop?: PiexifIfd;
    "1st"?: PiexifIfd;
    thumbnail?: string | null;
  }

  interface PiexifGpsHelper {
    /** Decimal degrees -> [[d,1],[m,1],[s,100]] rationals. */
    degToDmsRational(deg: number): [number, number][];
    /**
     * Rationals + "N"/"S"/"E"/"W" ref -> signed decimal degrees. Inputs are typed
     * `unknown`: they come straight out of the loosely-typed EXIF IFD dict, so the
     * caller passes them through without an (unsafe) narrowing assertion.
     */
    dmsRationalToDeg(dms: unknown, ref: unknown): number;
  }

  interface Piexif {
    version: string;
    /** Read EXIF from a JPEG given as a binary string (one char per byte) or data URL. */
    load(jpegData: string): PiexifExif;
    /** Serialize an EXIF dict to the bytes `insert` expects. */
    dump(exif: PiexifExif): string;
    /** Insert serialized EXIF into a JPEG binary string, returning the new JPEG. */
    insert(exifBytes: string, jpegData: string): string;
    /** Strip all EXIF, returning the JPEG binary string unchanged otherwise. */
    remove(jpegData: string): string;
    ImageIFD: Record<string, number>;
    ExifIFD: Record<string, number>;
    GPSIFD: Record<string, number>;
    GPSHelper: PiexifGpsHelper;
  }

  const piexif: Piexif;
  export default piexif;
}
