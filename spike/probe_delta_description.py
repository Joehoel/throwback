# /// script
# requires-python = ">=3.9"
# dependencies = ["msal", "requests"]
# ///
"""
Grondwaarheid: geeft Graph's DELTA-endpoint het `description`-veld terug?
Zoekt de bekende foto, leest 'm via delta op z'n map, en vergelijkt met directe GET.
Hergebruikt ~/.throwback_token.json (geen login).

    BU_CLIENT_ID=<client-id> uv run probe_delta_description.py
"""
from __future__ import annotations

import json
import os
import sys

import msal
import requests

GRAPH = "https://graph.microsoft.com/v1.0"
AUTHORITY = "https://login.microsoftonline.com/consumers"
SCOPES = ["Files.Read"]
CACHE_PATH = os.path.expanduser("~/.throwback_token.json")
TARGET = "20260525_102046502_iOS"


def token(client_id: str) -> str:
    cache = msal.SerializableTokenCache()
    if os.path.exists(CACHE_PATH):
        cache.deserialize(open(CACHE_PATH).read())
    app = msal.PublicClientApplication(client_id, authority=AUTHORITY, token_cache=cache)
    accounts = app.get_accounts()
    res = app.acquire_token_silent(SCOPES, account=accounts[0]) if accounts else None
    if not res:
        sys.exit("Geen geldig token in cache — draai eerst verify_description.py opnieuw.")
    if cache.has_state_changed:
        open(CACHE_PATH, "w").write(cache.serialize())
    return res["access_token"]


def main():
    client_id = os.environ.get("BU_CLIENT_ID") or sys.exit("Zet BU_CLIENT_ID")
    h = {"Authorization": f"Bearer {token(client_id)}"}
    folder_path = os.environ.get("FOLDER_PATH", "Afbeeldingen/Camera-album/2026/05")

    # 1) Map ophalen via pad (search heeft index-lag, pad niet).
    fr = requests.get(f"{GRAPH}/me/drive/root:/{folder_path}", headers=h)
    if not fr.ok:
        sys.exit(f"Map '{folder_path}' niet gevonden ({fr.status_code}). Zet FOLDER_PATH anders.")
    parent_id = fr.json()["id"]
    print(f"Map: {folder_path}  id={parent_id}")

    # 2) Zoek in die map een foto MET beschrijving (via children).
    sel = "id,name,description,folder,file,photo,parentReference"
    cr = requests.get(f"{GRAPH}/me/drive/items/{parent_id}/children?%24select={sel}&%24top=200", headers=h)
    cr.raise_for_status()
    described = [o for o in cr.json().get("value", []) if o.get("description")]
    if not described:
        sys.exit("Geen beschreven foto in die map gevonden — controleer FOLDER_PATH.")
    item = described[0]
    item_id = item["id"]
    print(f"Beschreven foto: {item['name']}  id={item_id}")

    # 2) Directe GET (de representatie waarvan we wéten dat 'ie description heeft).
    g = requests.get(f"{GRAPH}/me/drive/items/{item_id}", headers=h).json()
    print(f"\n[GET]   description = {g.get('description')!r}")

    # 3) DELTA op de oudermap — vind dezelfde foto, kijk of description meekomt.
    url = f"{GRAPH}/me/drive/items/{parent_id}/delta"
    delta_item = None
    while url:
        d = requests.get(url, headers=h).json()
        for o in d.get("value", []):
            if o.get("id") == item_id:
                delta_item = o
        url = d.get("@odata.nextLink")
    if delta_item is None:
        sys.exit("Foto niet teruggevonden in delta van de oudermap (?).")

    has_key = "description" in delta_item
    print(f"[DELTA] description = {delta_item.get('description')!r}   (key aanwezig: {has_key})")
    print("\n--- volledige DELTA-item JSON ---")
    print(json.dumps(delta_item, indent=2, ensure_ascii=False))

    print("\n=== CONCLUSIE ===")
    if delta_item.get("description"):
        print("✅ DELTA geeft description terug — onze app-aanpak klopt; het was de verkeerde map.")
    elif g.get("description") and not delta_item.get("description"):
        print("⚠️ DELTA laat description WEG, maar GET heeft 'm wél.")
        print("   → Fix: na delta de description per item bijhalen, of een ander indexeer-endpoint.")
    else:
        print("ℹ️ GET heeft ook geen description — controleer of dit de juiste foto/account is.")


if __name__ == "__main__":
    main()
