// Check: rondt piexifjs GPS + Orientation lossless door een JPEG (byte-niveau)?
// Spiegelt de Python-piexif-spike (scripts/verify_location_write.py), nu in JS.
// Draaien: node web/spike/piexif_check.mjs   (en daarna dezelfde logica in workerd)
import piexif from "piexifjs";

const TEST_LAT = 50.0875;
const TEST_LON = 14.4214;
const ORIENTATION = 6;

// Geldige 1x1 baseline-JPEG zonder EXIF (genoeg voor een byte-niveau EXIF-test).
const B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof" +
  "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB" +
  "AAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==";

export function roundTrip(jpegBinary) {
  const exif = {
    "0th": { [piexif.ImageIFD.Orientation]: ORIENTATION },
    GPS: {
      [piexif.GPSIFD.GPSVersionID]: [2, 3, 0, 0],
      [piexif.GPSIFD.GPSLatitudeRef]: TEST_LAT >= 0 ? "N" : "S",
      [piexif.GPSIFD.GPSLatitude]: piexif.GPSHelper.degToDmsRational(Math.abs(TEST_LAT)),
      [piexif.GPSIFD.GPSLongitudeRef]: TEST_LON >= 0 ? "E" : "W",
      [piexif.GPSIFD.GPSLongitude]: piexif.GPSHelper.degToDmsRational(Math.abs(TEST_LON)),
    },
  };
  const injected = piexif.insert(piexif.dump(exif), jpegBinary);
  const reread = piexif.load(injected);
  const stripped = piexif.remove(injected); // Moet exact het origineel teruggeven

  const lat = piexif.GPSHelper.dmsRationalToDeg(
    reread.GPS[piexif.GPSIFD.GPSLatitude],
    reread.GPS[piexif.GPSIFD.GPSLatitudeRef],
  );
  const lon = piexif.GPSHelper.dmsRationalToDeg(
    reread.GPS[piexif.GPSIFD.GPSLongitude],
    reread.GPS[piexif.GPSIFD.GPSLongitudeRef],
  );
  return {
    injLen: injected.length,
    lat,
    latOk: Math.abs(lat - TEST_LAT) < 1e-4,
    lon,
    lonOk: Math.abs(lon - TEST_LON) < 1e-4,
    lossless: stripped === jpegBinary, // EXIF-strip == origineel ⇒ alleen EXIF toegevoegd
    orientation: reread["0th"][piexif.ImageIFD.Orientation],
    origLen: jpegBinary.length,
    startsJPEG: injected.startsWith("\xff\xd8"),
  };
}

// Node-runner (workerd-runner staat in piexif_check.worker.ts)
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("piexif_check.mjs")) {
  const jpeg = Buffer.from(B64, "base64").toString("binary");
  const r = roundTrip(jpeg);
  console.log(JSON.stringify(r, null, 2));
  const ok = r.startsJPEG && r.orientation === ORIENTATION && r.latOk && r.lonOk && r.lossless;
  console.log(
    ok ? "\n✅ NODE: GPS + Orientation lossless round-trip OK" : "\n❌ NODE: round-trip FAALT",
  );
  process.exit(ok ? 0 : 1);
}

export { B64, TEST_LAT, TEST_LON, ORIENTATION };
