# Streaming JPEG codec

This server-only module implements the preservation boundary from ADR-0022.

- `prepareJpegTransform` preflights a replayable source completely before exposing output. It buffers at
  most the configured pre-SOS header and streams entropy-coded data unchanged on the second pass.
- EXIF changes append new reachable IFD0/GPS structures. Existing TIFF bytes and their offsets stay put,
  which preserves thumbnails, Interop data, MakerNote data, and unknown entries.
- Standard XMP is changed surgically. Extended XMP, ICC, unknown APP/COM segments, and all bytes from the
  first scan onward are preservation-manifest inputs.
- `verifyJpeg` rereads produced or provider-returned bytes and proves the complete target plus the source
  preservation manifest. Ambiguous and unsupported structures are typed permanent failures.

The source passed to the codec must be immutable and replayable. A changed second pass fails the stream;
an uploader must not commit until that stream completes successfully.

## Reproducible memory workload

From `web/`, run:

```sh
bun run measure:jpeg-memory
```

The default workload runs two concurrent 100-MiB synthetic JPEGs and exits non-zero when total process RSS
exceeds 80 MiB. Override with `--tasks=N`, `--size-mib=N`, or `--limit-mib=N`. The JSON result is
content-free and suitable for attaching to the exact-candidate release evidence. Local RSS is a conservative
development proxy; the release signoff repeats the same workload in the target Worker/isolate profiler.
