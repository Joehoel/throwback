# /// script
# requires-python = ">=3.9"
# dependencies = ["msal", "requests", "piexif"]
# ///
"""
Spike voor de Beheer-webapp (ADR-0008): kan de webapp een LOCATIE terugschrijven
zodat de TV-app 'm weer ziet — en honoreert Graph een lossless EXIF-Orientation?

Anders dan de beschrijving (goedkope `PATCH`, ADR-0002) is het `location`-facet
afgeleid/read-only: coördinaten landen alleen als ze in de bestands-EXIF staan.
Dit script bewijst de zware weg (Pad B): download → EXIF GPS + Orientation
lossless injecteren (piexif, geen her-encode) → re-upload → teruglezen.

Drie vragen ineen:
  1. Rondt een geïnjecteerde EXIF GPS-coördinaat door via het Graph `location`-
     facet ná re-upload — direct GET én via de children-crawl die de TV-app leest?
  2. Honoreert de Graph-thumbnail (die de TV-app via Coil toont) een gewijzigde
     EXIF-Orientation? (we zetten Orientation=6 en kijken of de thumb-afmetingen
     omklappen)
  3. Werkt dit lossless? (alleen JPEG; HEIC/PNG vallen hier buiten — piexif is
     JPEG/TIFF, en PNG kent geen standaard EXIF GPS-IFD)

VEILIG: bewaart de originele bytes in geheugen en zet het bestand daarna exact
terug (byte-identiek). Kiest standaard een JPEG ZONDER bestaande locatie, zodat
er nooit echte GPS overschreven wordt. Re-upload bumpt wel de modified-timestamp
(zo bereikt locatie sowieso de TV-app — dat is de bedoeling).

Draaien (macOS, met uv):
    BU_CLIENT_ID=0bb9b8c8-a9e6-475d-b44f-74521e46aaf1 \
    uv run scripts/verify_location_write.py --path "Afbeeldingen/Camera-album/2026/05/IMG_123.jpg"

Zonder --path zoekt hij zelf een JPEG zonder locatie in FOLDER_PATH.
Eerste keer mogelijk --relogin nodig voor de Files.ReadWrite-consent.
"""
from __future__ import annotations

import argparse
import io
import os
import sys
import time

import msal
import piexif
import requests

GRAPH = "https://graph.microsoft.com/v1.0"
AUTHORITY = "https://login.microsoftonline.com/consumers"
SCOPES = ["Files.ReadWrite"]
SELECT = "id,name,description,location,photo,image,file,folder,parentReference"
CACHE_PATH = os.path.expanduser("~/.throwback_token.json")

# Onmiskenbaar test-punt: Oudestadsplein, Praag.
TEST_LAT = 50.0875
TEST_LON = 14.4214
TEST_ORIENTATION = 6  # "90° met de klok mee draaien voor weergave"
SIMPLE_UPLOAD_MAX = 4 * 1024 * 1024


# ---------- auth ----------
def get_token(client_id: str, relogin: bool = False) -> str:
    cache = msal.SerializableTokenCache()
    if os.path.exists(CACHE_PATH) and not relogin:
        cache.deserialize(open(CACHE_PATH).read())
    elif relogin and os.path.exists(CACHE_PATH):
        os.remove(CACHE_PATH)

    app = msal.PublicClientApplication(client_id, authority=AUTHORITY, token_cache=cache)
    result = None
    accounts = app.get_accounts()
    if accounts and not relogin:
        result = app.acquire_token_silent(SCOPES, account=accounts[0])

    if not result:
        flow = app.initiate_device_flow(scopes=SCOPES)
        if "user_code" not in flow:
            sys.exit(f"Device-flow starten mislukt: {flow}")
        print("\n" + flow["message"] + "\n")
        result = app.acquire_token_by_device_flow(flow)  # blokkeert tot inloggen

    if "access_token" not in result:
        sys.exit(f"Inloggen mislukt: {result.get('error_description', result)}")
    if cache.has_state_changed:
        with open(CACHE_PATH, "w") as fh:
            fh.write(cache.serialize())
    return result["access_token"]


# ---------- helpers ----------
def is_new_backend(item: dict) -> bool:
    return "!s" in (item.get("id") or "")


def get_by_path(h, path: str) -> dict:
    clean = path.strip("/")
    r = requests.get(f"{GRAPH}/me/drive/root:/{clean}:?$select={SELECT}", headers=h)
    if not r.ok:
        sys.exit(f"Pad '{path}' niet gevonden ({r.status_code}): {r.text[:200]}")
    return r.json()


def pick_target(h) -> dict:
    """Geen --path: zoek een JPEG ZONDER locatie (zo overschrijven we geen echte GPS)."""
    folder = os.environ.get("FOLDER_PATH", "Afbeeldingen/Camera-album/2026/05")
    fr = requests.get(f"{GRAPH}/me/drive/root:/{folder}", headers=h)
    if not fr.ok:
        sys.exit(f"Map '{folder}' niet gevonden ({fr.status_code}). Zet FOLDER_PATH of geef --path.")
    parent_id = fr.json()["id"]
    cr = requests.get(
        f"{GRAPH}/me/drive/items/{parent_id}/children?%24select={SELECT}&%24top=200",
        headers=h,
    )
    cr.raise_for_status()
    jpegs = [
        o for o in cr.json().get("value", [])
        if o.get("file", {}).get("mimeType") == "image/jpeg"
    ]
    if not jpegs:
        sys.exit(f"Geen JPEG's in '{folder}'. Zet FOLDER_PATH of geef --path naar een JPEG.")
    without_loc = [o for o in jpegs if not o.get("location")]
    return (without_loc or jpegs)[0]


def download_bytes(h, item_id: str) -> bytes:
    """De content-URL redirect naar een pre-signed storage-URL; daar mag GEEN
    auth-header mee (die geeft 401). Daarom de redirect handmatig volgen."""
    r = requests.get(f"{GRAPH}/me/drive/items/{item_id}/content", headers=h, allow_redirects=False)
    if r.status_code in (301, 302, 303, 307, 308):
        dl = requests.get(r.headers["Location"])  # geen auth-header
        dl.raise_for_status()
        return dl.content
    r.raise_for_status()
    return r.content


def upload_bytes(h, item_id: str, data: bytes):
    if len(data) <= SIMPLE_UPLOAD_MAX:
        return requests.put(
            f"{GRAPH}/me/drive/items/{item_id}/content",
            headers={**h, "Content-Type": "application/octet-stream"},
            data=data,
        )
    # Grote bestanden: upload-sessie in chunks van een veelvoud van 320 KiB.
    sess = requests.post(
        f"{GRAPH}/me/drive/items/{item_id}/createUploadSession",
        headers=h,
        json={"item": {"@microsoft.graph.conflictBehavior": "replace"}},
    )
    sess.raise_for_status()
    url = sess.json()["uploadUrl"]
    chunk = 320 * 1024 * 16  # ~5 MiB
    total = len(data)
    last = None
    for start in range(0, total, chunk):
        end = min(start + chunk, total)
        last = requests.put(
            url,
            headers={"Content-Range": f"bytes {start}-{end - 1}/{total}"},
            data=data[start:end],
        )
        if last.status_code not in (200, 201, 202):
            return last
    return last


def to_dms_rational(dec: float):
    dec = abs(dec)
    d = int(dec)
    m_full = (dec - d) * 60
    m = int(m_full)
    s = (m_full - m) * 60
    return ((d, 1), (m, 1), (int(round(s * 100)), 100))


def inject_gps_and_orientation(jpeg: bytes, lat: float, lon: float, orientation: int) -> bytes:
    try:
        exif = piexif.load(jpeg)
    except Exception:
        exif = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}
    exif.setdefault("GPS", {})
    exif["GPS"][piexif.GPSIFD.GPSVersionID] = (2, 3, 0, 0)
    exif["GPS"][piexif.GPSIFD.GPSLatitudeRef] = "N" if lat >= 0 else "S"
    exif["GPS"][piexif.GPSIFD.GPSLatitude] = to_dms_rational(lat)
    exif["GPS"][piexif.GPSIFD.GPSLongitudeRef] = "E" if lon >= 0 else "W"
    exif["GPS"][piexif.GPSIFD.GPSLongitude] = to_dms_rational(lon)
    exif.setdefault("0th", {})
    exif["0th"][piexif.ImageIFD.Orientation] = orientation
    exif_bytes = piexif.dump(exif)
    out = io.BytesIO()
    piexif.insert(exif_bytes, jpeg, out)  # lossless: alleen EXIF-segment vervangen
    return out.getvalue()


def get_item(h, item_id: str) -> dict:
    return requests.get(f"{GRAPH}/me/drive/items/{item_id}?$select={SELECT}", headers=h).json()


def location_via_children(h, item: dict):
    parent_id = item["parentReference"]["id"]
    url = f"{GRAPH}/me/drive/items/{parent_id}/children?%24select={SELECT}&%24top=200"
    while url:
        d = requests.get(url, headers=h).json()
        for o in d.get("value", []):
            if o.get("id") == item["id"]:
                return o.get("location")
        url = d.get("@odata.nextLink")
    return None


def large_thumb_dims(h, item_id: str):
    r = requests.get(f"{GRAPH}/me/drive/items/{item_id}/thumbnails?$select=large", headers=h)
    if not r.ok or not r.json().get("value"):
        return None
    lg = r.json()["value"][0].get("large", {})
    return (lg.get("width"), lg.get("height"))


def coords_match(loc, lat, lon, tol=0.01) -> bool:
    if not loc:
        return False
    return (
        abs((loc.get("latitude") or 0) - lat) < tol
        and abs((loc.get("longitude") or 0) - lon) < tol
    )


# ---------- main ----------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", help="Pad naar de test-JPEG in OneDrive")
    parser.add_argument("--relogin", action="store_true", help="Opnieuw inloggen (Files.ReadWrite-consent)")
    args = parser.parse_args()

    client_id = os.environ.get("BU_CLIENT_ID", "0bb9b8c8-a9e6-475d-b44f-74521e46aaf1")
    h = {"Authorization": f"Bearer {get_token(client_id, relogin=args.relogin)}"}

    item = get_by_path(h, args.path) if args.path else pick_target(h)
    item_id = item["id"]
    mime = item.get("file", {}).get("mimeType")
    if mime != "image/jpeg":
        sys.exit(
            f"'{item.get('name')}' is {mime}, geen JPEG. Deze lossless route geldt alleen voor JPEG.\n"
            "HEIC/PNG vallen buiten ADR-0008's lossless-only scope — geef een JPEG via --path."
        )

    print(f"\nTest-JPEG : {item.get('name')}")
    print(f"  id           : {item_id}")
    print(f"  backend      : {'NIEUW (!s…)' if is_new_backend(item) else 'oud'}")
    print(f"  locatie nu   : {item.get('location')}  (origineel — wordt straks teruggezet)")

    thumb_before = large_thumb_dims(h, item_id)
    print(f"  thumb vóór   : {thumb_before}  (large WxH)")

    print("\n[1] originele bytes downloaden …")
    original = download_bytes(h, item_id)
    print(f"    {len(original):,} bytes")

    ok = False
    try:
        print(f"[2] EXIF injecteren: GPS=({TEST_LAT},{TEST_LON})  Orientation={TEST_ORIENTATION} (lossless) …")
        patched = inject_gps_and_orientation(original, TEST_LAT, TEST_LON, TEST_ORIENTATION)
        print(f"    {len(patched):,} bytes (alleen EXIF-segment gewijzigd)")

        print("[3] re-uploaden …")
        up = upload_bytes(h, item_id, patched)
        if up.status_code not in (200, 201, 202):
            print(f"    ❌ upload faalde: {up.status_code} {up.text[:300]}")
            if up.status_code in (401, 403):
                print("    → mogelijk consent. Draai opnieuw met --relogin (Files.ReadWrite).")
            return
        new_id = up.json().get("id", item_id)
        if new_id != item_id:
            item_id = new_id  # sommige backends geven een nieuw id na content-replace
            item = get_item(h, item_id)
        print(f"    HTTP {up.status_code} — geüpload (id={item_id})")

        print("\n[4] teruglezen (Graph extraheert foto-metadata async — even pollen) …")
        direct_loc = via_children_loc = None
        thumb_after = None
        for i in range(10):
            time.sleep(3)
            direct_loc = get_item(h, item_id).get("location")
            via_children_loc = location_via_children(h, item)
            thumb_after = large_thumb_dims(h, item_id)
            got_loc = coords_match(direct_loc, TEST_LAT, TEST_LON)
            got_thumb = thumb_after and thumb_before and thumb_after != thumb_before
            print(f"    poging {i+1:2d}: location={direct_loc}  thumb={thumb_after}")
            if got_loc and (got_thumb or thumb_before is None):
                break

        print("\n[GET direct ]  location =", direct_loc)
        print("[GET children] location =", via_children_loc, "  <-- dit leest de TV-app-indexer")
        print(f"[thumbnail  ]  vóór={thumb_before}  ná={thumb_after}")

        # ----- conclusie -----
        print("\n=== CONCLUSIE ===")
        loc_direct = coords_match(direct_loc, TEST_LAT, TEST_LON)
        loc_children = coords_match(via_children_loc, TEST_LAT, TEST_LON)
        if loc_direct and loc_children:
            print("✅ GPS rondt volledig door — ook via de children-crawl die de TV-app leest.")
            print("   → ADR-0008 Pad B werkt voor JPEG: locatie via EXIF-re-upload.")
        elif loc_direct and not loc_children:
            print("⚠️ Direct GET ziet de locatie, de children-crawl NIET.")
            print("   → Net als bij description: facet leeft, maar niet in de lijst-representatie.")
            print("   → Webapp moet na upload per item verifiëren.")
        else:
            print("❌ GPS landt NIET in het location-facet na re-upload.")
            print("   → location-facet wordt niet (tijdig) uit de geüploade EXIF afgeleid; heroverweeg Pad B.")

        if thumb_before and thumb_after:
            if thumb_after != thumb_before:
                print(f"✅ Graph-thumbnail honoreert EXIF-Orientation (afmetingen klapten om: {thumb_before}→{thumb_after}).")
                print("   → Lossless rechtzetten via EXIF-Orientation is zichtbaar in de Fotoshow.")
            else:
                print(f"❌ Thumbnail-afmetingen onveranderd ({thumb_before}); Orientation lijkt niet gehonoreerd (of nog gecachet).")
        else:
            print("ℹ️ Thumbnail-vergelijking niet mogelijk (geen afmetingen terug).")

        ok = loc_direct
    finally:
        print("\n[5] origineel byte-identiek terugzetten …")
        restore = upload_bytes(h, item_id, original)
        if restore.status_code in (200, 201, 202):
            print("    ✅ origineel hersteld (geen wijziging achtergelaten; modified-timestamp wél gebumpt).")
        else:
            print(f"    ⚠️ HERSTEL MISLUKT ({restore.status_code}) — controleer handmatig! {restore.text[:200]}")

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
