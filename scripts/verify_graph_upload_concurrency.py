# /// script
# requires-python = ">=3.9"
# dependencies = ["msal", "pillow", "requests"]
# ///
"""Probe OneDrive Personal concurrency behavior for replacing a disposable JPEG.

The script creates a temporary folder at the drive root, runs conditional upload
tests against one synthetic JPEG, prints a content-free JSON report, and deletes
the complete folder in a finally block.

Run with:
    uv run scripts/verify_graph_upload_concurrency.py
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import random
import sys
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import quote

import msal
import requests
from PIL import Image

GRAPH = "https://graph.microsoft.com/v1.0"
AUTHORITY = "https://login.microsoftonline.com/consumers"
SCOPES = ["Files.ReadWrite"]
TOKEN_CACHE_PATH = Path.home() / ".throwback_token.json"
DEFAULT_CLIENT_ID = "0bb9b8c8-a9e6-475d-b44f-74521e46aaf1"
CHUNK_SIZE = 320 * 1024
TIMEOUT_SECONDS = 90
SELECT = "id,name,size,eTag,cTag,lastModifiedDateTime,file,parentReference"


def get_token(client_id: str, relogin: bool) -> str:
    cache = msal.SerializableTokenCache()
    if TOKEN_CACHE_PATH.exists() and not relogin:
        cache.deserialize(TOKEN_CACHE_PATH.read_text())
    elif relogin:
        TOKEN_CACHE_PATH.unlink(missing_ok=True)

    app = msal.PublicClientApplication(client_id, authority=AUTHORITY, token_cache=cache)
    accounts = app.get_accounts()
    result = app.acquire_token_silent(SCOPES, account=accounts[0]) if accounts else None

    if not result:
        flow = app.initiate_device_flow(scopes=SCOPES)
        if "user_code" not in flow:
            raise RuntimeError(f"Could not start device flow: {flow}")
        print(flow["message"], file=sys.stderr)
        result = app.acquire_token_by_device_flow(flow)

    if "access_token" not in result:
        raise RuntimeError(result.get("error_description", "Microsoft login failed"))
    if cache.has_state_changed:
        TOKEN_CACHE_PATH.write_text(cache.serialize())
    return result["access_token"]


def synthetic_jpeg(seed: int) -> bytes:
    rng = random.Random(seed)
    width, height = 1280, 960
    pixels = rng.randbytes(width * height * 3)
    image = Image.frombytes("RGB", (width, height), pixels)
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=90, optimize=False)
    data = output.getvalue()
    if len(data) <= CHUNK_SIZE:
        raise RuntimeError("Synthetic JPEG is too small for a two-fragment upload")
    return data


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fingerprint(value: str | None) -> str | None:
    if value is None:
        return None
    return hashlib.sha256(value.encode()).hexdigest()[:12]


def response_error(response: requests.Response) -> dict[str, Any] | None:
    if response.ok:
        return None
    try:
        body = response.json()
    except requests.JSONDecodeError:
        return {"body": response.text[:160]}
    error = body.get("error", body)
    return {
        "code": error.get("code"),
        "message": error.get("message"),
    }


class Probe:
    def __init__(self, token: str) -> None:
        self.auth_headers = {"Authorization": f"Bearer {token}"}

    def graph(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        headers = {**self.auth_headers, **kwargs.pop("headers", {})}
        return requests.request(
            method,
            f"{GRAPH}{path}",
            headers=headers,
            timeout=TIMEOUT_SECONDS,
            **kwargs,
        )

    def create_folder(self, name: str) -> dict[str, Any]:
        response = self.graph(
            "POST",
            "/me/drive/root/children",
            json={
                "name": name,
                "folder": {},
                "@microsoft.graph.conflictBehavior": "fail",
            },
        )
        response.raise_for_status()
        return response.json()

    def delete_item(self, item_id: str) -> requests.Response:
        return self.graph("DELETE", f"/me/drive/items/{item_id}")

    def create_file(self, folder_id: str, name: str, data: bytes) -> dict[str, Any]:
        response = self.graph(
            "PUT",
            f"/me/drive/items/{folder_id}:/{quote(name)}:/content",
            headers={"Content-Type": "image/jpeg"},
            data=data,
        )
        response.raise_for_status()
        return response.json()

    def get_item(self, item_id: str) -> dict[str, Any]:
        response = self.graph("GET", f"/me/drive/items/{item_id}?$select={SELECT}")
        response.raise_for_status()
        return response.json()

    def await_changed_tag(self, item_id: str, old_etag: str | None) -> dict[str, Any]:
        item = self.get_item(item_id)
        for _ in range(10):
            if item.get("eTag") != old_etag:
                return item
            time.sleep(0.5)
            item = self.get_item(item_id)
        return item

    def download(self, item_id: str) -> bytes:
        response = self.graph(
            "GET",
            f"/me/drive/items/{item_id}/content",
            allow_redirects=False,
        )
        if response.is_redirect:
            downloaded = requests.get(
                response.headers["Location"],
                timeout=TIMEOUT_SECONDS,
            )
            downloaded.raise_for_status()
            return downloaded.content
        response.raise_for_status()
        return response.content

    def simple_upload(
        self,
        item_id: str,
        data: bytes,
        if_match: str | None = None,
    ) -> requests.Response:
        headers = {"Content-Type": "image/jpeg"}
        if if_match is not None:
            headers["If-Match"] = if_match
        return self.graph(
            "PUT",
            f"/me/drive/items/{item_id}/content",
            headers=headers,
            data=data,
        )

    def create_upload_session(
        self,
        item_id: str,
        if_match: str,
    ) -> requests.Response:
        return self.graph(
            "POST",
            f"/me/drive/items/{item_id}/createUploadSession",
            headers={"Content-Type": "application/json", "If-Match": if_match},
            json={"item": {"@microsoft.graph.conflictBehavior": "replace"}},
        )

    @staticmethod
    def cancel_session(upload_url: str) -> None:
        requests.delete(upload_url, timeout=TIMEOUT_SECONDS)

    @staticmethod
    def upload_fragment(
        upload_url: str,
        data: bytes,
        start: int,
        total: int,
    ) -> requests.Response:
        end = start + len(data) - 1
        return requests.put(
            upload_url,
            headers={"Content-Range": f"bytes {start}-{end}/{total}"},
            data=data,
            timeout=TIMEOUT_SECONDS,
        )

    def versions(self, item_id: str) -> dict[str, Any]:
        response = self.graph(
            "GET",
            f"/me/drive/items/{item_id}/versions?$select=id,size,lastModifiedDateTime",
        )
        if not response.ok:
            return {"status": response.status_code, "error": response_error(response)}
        versions = response.json().get("value", [])
        return {
            "status": response.status_code,
            "count": len(versions),
            "ids": [version.get("id") for version in versions[:10]],
        }


def item_facts(item: dict[str, Any], original_id: str) -> dict[str, Any]:
    return {
        "idPreserved": item.get("id") == original_id,
        "size": item.get("size"),
        "eTagFingerprint": fingerprint(item.get("eTag")),
        "cTagFingerprint": fingerprint(item.get("cTag")),
    }


def create_session_case(
    probe: Probe,
    item_id: str,
    tag_name: str,
    tag_value: str,
) -> dict[str, Any]:
    response = probe.create_upload_session(item_id, tag_value)
    result = {
        "tag": tag_name,
        "status": response.status_code,
        "error": response_error(response),
    }
    if response.ok:
        probe.cancel_session(response.json()["uploadUrl"])
    return result


def race_case(
    probe: Probe,
    item_id: str,
    tag_name: str,
    base: bytes,
    session_payload: bytes,
    external_payload: bytes,
) -> dict[str, Any]:
    reset = probe.simple_upload(item_id, base)
    reset.raise_for_status()
    base_item = probe.get_item(item_id)
    tag_value = base_item[tag_name]
    session = probe.create_upload_session(item_id, tag_value)
    result: dict[str, Any] = {
        "tag": tag_name,
        "createStatus": session.status_code,
        "createError": response_error(session),
    }
    if not session.ok:
        return result

    upload_url = session.json()["uploadUrl"]
    completed = False
    try:
        first = probe.upload_fragment(
            upload_url,
            session_payload[:CHUNK_SIZE],
            0,
            len(session_payload),
        )
        result["firstFragmentStatus"] = first.status_code
        if first.status_code != 202:
            result["firstFragmentError"] = response_error(first)
            return result

        external = probe.simple_upload(item_id, external_payload)
        result["externalWriteStatus"] = external.status_code
        if not external.ok:
            result["externalWriteError"] = response_error(external)
            return result
        external_item = probe.await_changed_tag(item_id, base_item.get("eTag"))
        result["externalChangedETag"] = external_item.get("eTag") != base_item.get("eTag")
        result["externalChangedCTag"] = external_item.get("cTag") != base_item.get("cTag")

        final = probe.upload_fragment(
            upload_url,
            session_payload[CHUNK_SIZE:],
            CHUNK_SIZE,
            len(session_payload),
        )
        completed = final.status_code in (200, 201)
        result["finalFragmentStatus"] = final.status_code
        result["finalFragmentError"] = response_error(final)

        final_item = probe.get_item(item_id)
        final_bytes = probe.download(item_id)
        final_hash = sha256(final_bytes)
        result["winner"] = (
            "session"
            if final_hash == sha256(session_payload)
            else "external"
            if final_hash == sha256(external_payload)
            else "unknown"
        )
        result["finalItem"] = item_facts(final_item, item_id)
        return result
    finally:
        if not completed:
            probe.cancel_session(upload_url)


def simple_upload_cases(
    probe: Probe,
    item_id: str,
    payloads: list[bytes],
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    payload_index = 0
    for tag_name in ("eTag", "cTag"):
        current = probe.get_item(item_id)
        tag = current[tag_name]
        accepted = probe.simple_upload(item_id, payloads[payload_index], tag)
        payload_index += 1
        results.append(
            {
                "tag": tag_name,
                "match": True,
                "status": accepted.status_code,
                "error": response_error(accepted),
            }
        )

        current = probe.await_changed_tag(item_id, current.get("eTag"))
        stale = probe.simple_upload(item_id, payloads[payload_index], tag)
        payload_index += 1
        downloaded_hash = sha256(probe.download(item_id))
        results.append(
            {
                "tag": tag_name,
                "match": False,
                "status": stale.status_code,
                "error": response_error(stale),
                "staleWriteBecameContent": downloaded_hash == sha256(payloads[payload_index - 1]),
                "currentTagChanged": current.get(tag_name) != tag,
            }
        )
    return results


def run(client_id: str, relogin: bool) -> dict[str, Any]:
    probe = Probe(get_token(client_id, relogin))
    folder_id: str | None = None
    folder_name = f"throwback-concurrency-spike-{uuid.uuid4().hex[:10]}"
    payloads = [synthetic_jpeg(seed) for seed in range(10, 22)]
    report: dict[str, Any] = {
        "runAtUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "graph": "v1.0",
        "drive": "OneDrive Personal",
        "payloadBytes": len(payloads[0]),
        "chunkBytes": CHUNK_SIZE,
        "cleanup": None,
    }

    try:
        folder = probe.create_folder(folder_name)
        folder_id = folder["id"]
        created = probe.create_file(folder_id, "concurrency-test.jpg", payloads[0])
        item_id = created["id"]
        initial = probe.get_item(item_id)
        report["initialItem"] = item_facts(initial, item_id)
        report["versionsBefore"] = probe.versions(item_id)

        report["matchingSessionCreation"] = [
            create_session_case(probe, item_id, tag_name, initial[tag_name])
            for tag_name in ("eTag", "cTag")
        ]

        changed = probe.simple_upload(item_id, payloads[1])
        changed.raise_for_status()
        changed_item = probe.await_changed_tag(item_id, initial.get("eTag"))
        report["mismatchingSessionCreation"] = [
            create_session_case(probe, item_id, tag_name, initial[tag_name])
            for tag_name in ("eTag", "cTag")
        ]
        report["mismatchSetup"] = {
            "eTagChanged": changed_item.get("eTag") != initial.get("eTag"),
            "cTagChanged": changed_item.get("cTag") != initial.get("cTag"),
        }

        report["midSessionRaces"] = [
            race_case(probe, item_id, "eTag", payloads[2], payloads[3], payloads[4]),
            race_case(probe, item_id, "cTag", payloads[5], payloads[6], payloads[7]),
        ]

        report["simpleUploadIfMatch"] = simple_upload_cases(
            probe,
            item_id,
            payloads[8:12],
        )
        final_item = probe.get_item(item_id)
        report["finalItem"] = item_facts(final_item, item_id)
        report["versionsAfter"] = probe.versions(item_id)
        return report
    finally:
        if folder_id is not None:
            deleted = probe.delete_item(folder_id)
            report["cleanup"] = {
                "status": deleted.status_code,
                "success": deleted.status_code == 204,
            }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--client-id",
        default=os.environ.get("BU_CLIENT_ID", DEFAULT_CLIENT_ID),
        help="Microsoft public-client application id",
    )
    parser.add_argument("--relogin", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    report = run(args.client_id, args.relogin)
    rendered = json.dumps(report, indent=2, sort_keys=True)
    print(rendered)
    if args.output is not None:
        args.output.write_text(rendered + "\n")

    if not report.get("cleanup", {}).get("success"):
        raise SystemExit("Disposable OneDrive folder cleanup failed")


if __name__ == "__main__":
    main()
