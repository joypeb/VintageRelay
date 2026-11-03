# ruff: noqa: T201 -- CLI script; stdout is its interface.
"""Seed a demo event through the public API and wait for AI analysis.

Usage: uv run python scripts/seed_event.py MANIFEST.json [--api http://localhost:8000]

Manifest: {"event": "event1103", "organizer": "Mina", "items": [{"seller": "Sora",
"category": "outer", "title": "...", "description": "...", "measurements": {"chest": 22},
"photos": ["https://... or local/path.jpg"]}]}. Each distinct seller joins as a participant
so the organizer can search their items. Items are registered one by one, waiting for
each analysis. Prints the entry code at the end.
"""

import argparse
import json
import mimetypes
import sys
import time
from pathlib import Path

import httpx

ANALYSIS_WAIT_SECONDS = 180


def _load_photo(source: str, base: Path) -> tuple[str, bytes, str]:
    if source.startswith(("http://", "https://")):
        for attempt in range(5):
            # Wikimedia's user-agent policy requires a descriptive agent.
            response = httpx.get(
                source,
                follow_redirects=True,
                timeout=30,
                headers={"User-Agent": "VintageRelaySeed/0.1 (demo seed script)"},
            )
            if response.status_code != 429:
                break
            time.sleep(int(response.headers.get("retry-after", "0") or 0) or 5 * (attempt + 1))
        response.raise_for_status()
        time.sleep(1)  # Stay polite to image hosts between downloads.
        mime = response.headers.get("content-type", "image/jpeg").split(";")[0]
        return Path(source.split("?")[0]).name or "photo", response.content, mime
    path = base / source
    return path.name, path.read_bytes(), mimetypes.guess_type(path.name)[0] or "image/jpeg"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--entry-code", help="Add items to this existing event instead")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    api = httpx.Client(base_url=f"{args.api.rstrip('/')}/api/v1", timeout=30)
    # Fetch every photo before creating the event so a download failure leaves no partial event.
    photos = [
        [_load_photo(source, args.manifest.parent) for source in item["photos"]]
        for item in manifest["items"]
    ]

    tokens: dict[str, str] = {}
    if args.entry_code:
        entry_code = args.entry_code
        event_id = api.get(f"/entry-codes/{entry_code}").raise_for_status().json()["eventId"]
    else:
        created = (
            api.post(
                "/events",
                json={"name": manifest["event"], "organizerDisplayName": manifest["organizer"]},
            )
            .raise_for_status()
            .json()
        )
        event_id, entry_code = created["event"]["id"], created["event"]["entryCode"]
        tokens[manifest["organizer"]] = created["participantToken"]

    for item, item_photos in zip(manifest["items"], photos, strict=True):
        seller = item["seller"]
        if seller not in tokens:
            joined = (
                api.post(
                    f"/events/{event_id}/participants",
                    json={"entryCode": entry_code, "displayName": seller},
                )
                .raise_for_status()
                .json()
            )
            tokens[seller] = joined["participantToken"]
        headers = {"Authorization": f"Bearer {tokens[seller]}"}
        photo_ids = [
            api.post(
                f"/events/{event_id}/photos",
                headers=headers,
                files={"file": photo},
            )
            .raise_for_status()
            .json()["id"]
            for photo in item_photos
        ]
        body = {
            key: item[key]
            for key in ("category", "title", "description", "measurements")
            if key in item
        }
        clothing = (
            api.post(
                f"/events/{event_id}/clothing",
                headers=headers,
                json={**body, "photoIds": photo_ids},
            )
            .raise_for_status()
            .json()
        )
        # One at a time: the server fails analyses that wait over 2s for one of its 4 AI slots.
        deadline = time.monotonic() + ANALYSIS_WAIT_SECONDS
        status = "pending"
        while status == "pending" and time.monotonic() < deadline:
            time.sleep(3)
            analysis = (
                api.get(f"/clothing/{clothing['id']}", headers=headers)
                .raise_for_status()
                .json()
                .get("analysis")
            )
            status = analysis["status"] if analysis else "pending"
        print(f"{status}: {item['title']}", file=sys.stderr if status != "done" else sys.stdout)
    print(f"event {event_id} entry code {entry_code}")


if __name__ == "__main__":
    main()
