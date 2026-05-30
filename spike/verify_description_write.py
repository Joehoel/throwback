# /// script
# requires-python = ">=3.9"
# dependencies = ["msal", "requests"]
# ///
"""
Spike 0 voor de companion-webapp: kan de webapp een beschrijving TERUGSCHRIJVEN
zodat de TV-app 'm weer ziet?

`verify_description.py` bewees het LEZEN. Dit bewijst het SCHRIJVEN, en wel via
de goedkope weg: `PATCH /me/drive/items/{id}` met `{"description": ...}` —
geen download/re-upload van het bestand.

De vraag die dit beantwoordt: rondt die PATCH door op OneDrive's nieuwere
opslag-backend (item-id's met `!s…`)? Dat is dezelfde backend die het lezen van
`driveItem.description` brak (zie android/.../onedrive/GraphSync.kt). Als de
PATCH hier doorrondt, worden bijschriften triviaal. Zo niet, dan moet de webapp
de ingebedde-EXIF-route (download→bytes bewerken→re-upload).

Veilig: leest eerst de bestaande beschrijving, schrijft een testmarkering, leest
'm terug (direct GET + via de children-crawl die de app gebruikt), en ZET DE
OORSPRONKELIJKE BESCHRIJVING DAARNA TERUG. Er blijft niks gewijzigd achter.

Draaien (macOS, met uv):
    BU_CLIENT_ID=<application-client-id> \
    uv run spike/verify_description_write.py --path "Afbeeldingen/Camera-album/2026/05/IMG_123.jpg"

Zonder --path kiest hij zelf een foto: bij voorkeur eentje op de nieuwe `!s…`
backend (dat is nu juist het interessante geval).
"""
from __future__ import annotations

import argparse
import os
import sys

import msal
import requests

GRAPH = "https://graph.microsoft.com/v1.0"
AUTHORITY = "https://login.microsoftonline.com/consumers"
# Schrijven vereist ReadWrite — de TV-app heeft alleen Files.Read, dus dit
# vraagt extra consent (eenmalig opnieuw inloggen kan nodig zijn).
SCOPES = ["Files.ReadWrite"]
SELECT = "id,name,description,folder,file,photo,parentReference"
CACHE_PATH = os.path.expanduser("~/.throwback_token.json")
MARKER = "throwback-write-spike ✓ (mag weg)"


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


def is_new_backend(item: dict) -> bool:
    # OneDrive's nieuwere opslag-backend: item-id's met '!s…'.
    return "!s" in (item.get("id") or "")


def get_by_path(h, path: str) -> dict:
    clean = path.strip("/")
    r = requests.get(f"{GRAPH}/me/drive/root:/{clean}:?$select={SELECT}", headers=h)
    if not r.ok:
        sys.exit(f"Pad '{path}' niet gevonden ({r.status_code}): {r.text[:200]}")
    return r.json()


def pick_target(h) -> dict:
    """Geen --path gegeven: zoek een foto, liefst op de nieuwe '!s…' backend."""
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
    photos = [
        o for o in cr.json().get("value", [])
        if o.get("file", {}).get("mimeType", "").startswith("image/")
    ]
    if not photos:
        sys.exit(f"Geen foto's in '{folder}'. Zet FOLDER_PATH of geef --path.")
    photos.sort(key=lambda o: not is_new_backend(o))  # nieuwe backend eerst
    return photos[0]


def read_back_via_children(h, item: dict) -> str | None:
    """Lees de beschrijving zoals de app-indexer dat doet: via de children-crawl."""
    parent_id = item["parentReference"]["id"]
    url = f"{GRAPH}/me/drive/items/{parent_id}/children?%24select={SELECT}&%24top=200"
    while url:
        d = requests.get(url, headers=h).json()
        for o in d.get("value", []):
            if o.get("id") == item["id"]:
                return o.get("description")
        url = d.get("@odata.nextLink")
    return None


def patch_description(h, item_id: str, value):
    r = requests.patch(
        f"{GRAPH}/me/drive/items/{item_id}",
        headers={**h, "Content-Type": "application/json"},
        json={"description": value},
    )
    return r


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", help="Pad naar de testfoto in OneDrive")
    parser.add_argument("--relogin", action="store_true", help="Opnieuw inloggen (voor de ReadWrite-consent)")
    args = parser.parse_args()

    client_id = os.environ.get("BU_CLIENT_ID")
    if not client_id:
        sys.exit("Zet BU_CLIENT_ID op je Azure Application (client) ID.")

    h = {"Authorization": f"Bearer {get_token(client_id, relogin=args.relogin)}"}
    item = get_by_path(h, args.path) if args.path else pick_target(h)

    item_id = item["id"]
    original = item.get("description")
    backend = "NIEUW (!s…)" if is_new_backend(item) else "oud"
    print(f"\nTestfoto : {item.get('name')}")
    print(f"  id            : {item_id}")
    print(f"  backend       : {backend}   <-- het interessante geval is 'NIEUW'")
    print(f"  beschrijving  : {original!r}  (oorspronkelijk — wordt straks teruggezet)")

    # 1) Schrijf de testmarkering.
    print(f"\n[PATCH] beschrijving := {MARKER!r}")
    r = patch_description(h, item_id, MARKER)
    if not r.ok:
        print(f"❌ PATCH faalde: {r.status_code} {r.text[:300]}")
        if r.status_code in (401, 403):
            print("   → Waarschijnlijk consent-probleem. Draai opnieuw met --relogin (Files.ReadWrite).")
        sys.exit(1)
    print(f"  HTTP {r.status_code} — PATCH geaccepteerd. Graph gaf terug: description={r.json().get('description')!r}")

    # 2) Lees terug: direct GET (de waarheid) + via de children-crawl (wat de app doet).
    direct = requests.get(f"{GRAPH}/me/drive/items/{item_id}?$select={SELECT}", headers=h).json().get("description")
    via_children = read_back_via_children(h, item)
    print(f"\n[GET direct ]  beschrijving = {direct!r}")
    print(f"[GET children] beschrijving = {via_children!r}   <-- dit leest de TV-app-indexer")

    # 3) Zet de oorspronkelijke beschrijving terug (geen rommel achterlaten).
    #    LET OP: Graph negeert {"description": null} om te wissen — gebruik "".
    restore = patch_description(h, item_id, original if original else "")
    restored_ok = restore.ok and not (restore.json().get("description") or "") if not original \
        else restore.ok and restore.json().get("description") == original
    print(f"\n[HERSTEL] oorspronkelijke beschrijving teruggezet: {'✅' if restored_ok else '⚠️ MISLUKT — controleer handmatig!'}")
    if not restored_ok:
        print(f"   restore HTTP {restore.status_code}: {restore.text[:200]}")

    # 4) Conclusie.
    print("\n=== CONCLUSIE ===")
    if direct == MARKER and via_children == MARKER:
        print("✅ PATCH description rondt volledig door — ook via de children-crawl die de app leest.")
        print("   → Bijschriften kunnen via Graph PATCH (geen file-rewrite). Pad A is gangbaar.")
    elif direct == MARKER and via_children != MARKER:
        print("⚠️ Direct GET ziet 'm wél, de children-crawl NIET.")
        print("   → Net als bij lezen: PATCH leeft, maar niet in de lijst-representatie.")
        print("   → De webapp moet na PATCH per item verifiëren, of de ingebedde-EXIF-route nemen (Pad B).")
    else:
        print("❌ PATCH rondt NIET door op deze backend.")
        print(f"   (backend was: {backend})")
        print("   → Bijschriften moeten via ingebedde EXIF: download → bytes bewerken → re-upload (Pad B).")


if __name__ == "__main__":
    main()
