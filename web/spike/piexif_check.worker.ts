// Draait dezelfde piexifjs-round-trip als piexif_check.mjs, maar in workerd
// (miniflare). Decodeert base64 met atob (workerd-native, geen Buffer).
import { B64, ORIENTATION, roundTrip } from "./piexif_check.mjs";

export default {
  async fetch() {
    const jpeg = atob(B64); // Binary string, net als in de Worker straks
    const r = roundTrip(jpeg);
    const ok = r.startsJPEG && r.orientation === ORIENTATION && r.latOk && r.lonOk && r.lossless;
    return Response.json({ ok, runtime: "workerd", ...r });
  },
};
