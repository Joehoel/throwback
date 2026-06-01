# /// script
# requires-python = ">=3.9"
# dependencies = ["msal", "requests"]
# ///
"""
Diagnose: geeft Graph's delta-endpoint het `description`-veld terug?
Hergebruikt het token uit ~/.throwback_token.json (van verify_description.py).

    BU_CLIENT_ID=<client-id> uv run check_delta.py
"""
from __future__ import annotations

import os
import sys

import msal
import requests

GRAPH = "https://graph.microsoft.com/v1.0"
AUTHORITY = "https://login.microsoftonline.com/consumers"
SCOPES = ["Files.Read"]
CACHE_PATH = os.path.expanduser("~/.throwback_token.json")
TARGET = "20260525_102046502_iOS"  # de foto met "Hallo Wereld"


def token(client_id: str) -> str:
    cache = msal.SerializableTokenCache()
    if os.path.exists(CACHE_PATH):
        cache.deserialize(open(CACHE_PATH).read())
    app = msal.PublicClientApplication(client_id, authority=AUTHORITY, token_cache=cache)
    accounts = app.get_accounts()
    result = app.acquire_token_silent(SCOPES, account=accounts[0]) if accounts else None
    if not result:
        flow = app.initiate_device_flow(scopes=SCOPES)
        print("\n" + flow["message"] + "\n")
        result = app.acquire_token_by_device_flow(flow)
    if cache.has_state_changed:
        open(CACHE_PATH, "w").write(cache.serialize())
    return result["access_token"]


def crawl(tok: str, url: str, label: str):
    headers = {"Authorization": f"Bearer {tok}"}
    total = with_desc = 0
    target_seen = False
    pages = 0
    while url and pages < 50:
        r = requests.get(url, headers=headers)
        r.raise_for_status()
        data = r.json()
        for o in data.get("value", []):
            if "folder" in o:
                continue
            total += 1
            desc = o.get("description")
            if desc:
                with_desc += 1
            if TARGET in o.get("name", ""):
                target_seen = True
                print(f"  [{label}] DOELFOTO {o.get('name')}: "
                      f"description={desc!r}  heeft_description_key={'description' in o}")
        url = data.get("@odata.nextLink")
        pages += 1
    print(f"  [{label}] {total} bestanden, {with_desc} met beschrijving, doelfoto gezien={target_seen}")


def main():
    client_id = os.environ.get("BU_CLIENT_ID") or sys.exit("Zet BU_CLIENT_ID")
    tok = token(client_id)
    print("\n=== delta ZONDER select ===")
    crawl(tok, f"{GRAPH}/me/drive/root/delta", "plain")
    print("\n=== delta MET $select=...,description ===")
    crawl(tok, f"{GRAPH}/me/drive/root/delta?%24select=id,name,description,file,photo,parentReference,deleted", "select")


if __name__ == "__main__":
    main()
