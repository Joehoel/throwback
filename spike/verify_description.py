# /// script
# requires-python = ">=3.9"
# dependencies = ["msal", "requests"]
# ///
"""
Fase 0 verificatie-spike voor Throwback.

Doel: bewijzen dat Microsoft Graph het `description`-veld teruggeeft dat de
vader in OneDrive bij een foto typte. Als dat klopt, staat ADR-0002 overeind
en kunnen we de rest van de app erop bouwen.

Draaien (macOS, met uv):
    BU_CLIENT_ID=<application-client-id> \
    uv run verify_description.py --path "Foto's/2019/07/Bruiloft/IMG_123.jpg"

Zonder --path toont hij de inhoud van de hoofdmap, zodat je naar de foto kunt
bladeren en het juiste pad kunt vinden.
"""
from __future__ import annotations

import argparse
import os
import sys

import msal
import requests

GRAPH = "https://graph.microsoft.com/v1.0"
# Persoonlijk (consumenten) Microsoft-account.
AUTHORITY = "https://login.microsoftonline.com/consumers"
SCOPES = ["Files.Read"]
SELECT = "id,name,description,size,folder,file,photo,parentReference,lastModifiedDateTime"


CACHE_PATH = os.path.expanduser("~/.throwback_token.json")


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
        # Stilletjes verlengen met de onthouden (refresh)token.
        result = app.acquire_token_silent(SCOPES, account=accounts[0])

    if not result:
        flow = app.initiate_device_flow(scopes=SCOPES)
        if "user_code" not in flow:
            sys.exit(f"Device-flow starten mislukt: {flow}")
        # Toont: ga naar microsoft.com/link en voer deze code in.
        print("\n" + flow["message"] + "\n")
        result = app.acquire_token_by_device_flow(flow)  # blokkeert tot je inlogt

    if "access_token" not in result:
        sys.exit(f"Inloggen mislukt: {result.get('error_description', result)}")

    if cache.has_state_changed:
        with open(CACHE_PATH, "w") as fh:
            fh.write(cache.serialize())
    return result["access_token"]


def get_item(token: str, path: str | None):
    headers = {"Authorization": f"Bearer {token}"}
    if path:
        clean = path.strip("/")
        url = f"{GRAPH}/me/drive/root:/{clean}:?$select={SELECT}"
    else:
        url = f"{GRAPH}/me/drive/root?$select={SELECT}"
    resp = requests.get(url, headers=headers)
    resp.raise_for_status()
    return headers, resp.json()


def list_children(headers, item):
    url = f"{GRAPH}/me/drive/items/{item['id']}/children?$select={SELECT}&$top=200"
    items = []
    while url:
        resp = requests.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        items.extend(data.get("value", []))
        url = data.get("@odata.nextLink")  # volg alle pagina's
    return items


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", help="Pad naar een foto of map in OneDrive")
    parser.add_argument("--relogin", action="store_true",
                        help="Onthouden token wissen en opnieuw inloggen (om van account te wisselen)")
    args = parser.parse_args()

    client_id = os.environ.get("BU_CLIENT_ID")
    if not client_id:
        sys.exit("Zet BU_CLIENT_ID op je Azure Application (client) ID.")

    token = get_token(client_id, relogin=args.relogin)
    headers, item = get_item(token, args.path)

    is_folder = "folder" in item
    print(f"\n{'MAP' if is_folder else 'BESTAND'}: {item.get('name')}")
    print(f"  id          : {item.get('id')}")
    print(f"  description : {item.get('description')!r}   <-- het veld dat we testen")
    if item.get("photo"):
        print(f"  photo.taken : {item['photo'].get('takenDateTime')}")

    if is_folder:
        children = list_children(headers, item)
        # Sorteer: met beschrijving eerst, daarbinnen nieuwste wijziging eerst.
        children.sort(key=lambda c: c.get("lastModifiedDateTime") or "", reverse=True)
        children.sort(key=lambda c: c.get("description") is None)
        described = [c for c in children if c.get("description")]

        print(f"\n{len(children)} items, waarvan {len(described)} met een beschrijving."
              " (mét beschrijving bovenaan, dan nieuwste eerst)\n")
        shown = children[:80]
        for child in shown:
            if "folder" in child:
                kind = "map "
            elif child.get("photo") or child.get("file", {}).get("mimeType", "").startswith("image/"):
                kind = "foto"
            else:
                kind = "best"
            desc = child.get("description")
            mark = "  *" if desc else ""
            print(f"  [{kind}] {child.get('name'):42s} description={desc!r}{mark}")
        if len(children) > len(shown):
            print(f"  … en nog {len(children) - len(shown)} items (niet getoond).")
        print("\nKies een foto met een '*' (heeft een beschrijving) en draai opnieuw met --path naar dat bestand.")
    else:
        if item.get("description"):
            print("\n✅ GESLAAGD: het beschrijvingsveld komt via Graph terug. ADR-0002 staat overeind.")
        else:
            print("\n⚠️  Geen beschrijving op dit bestand. Of deze foto heeft er geen,")
            print("    of de vader vulde 'm elders in (niet in OneDrive 'Details > Beschrijving').")


if __name__ == "__main__":
    main()
