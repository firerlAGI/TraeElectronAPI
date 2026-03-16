#!/usr/bin/env python3
"""
Minimal TraeAPI example client using only the Python standard library.

Usage:
  python examples/python/client.py

Environment variables:
  TRAE_API_BASE_URL   default: http://127.0.0.1:8787
  TRAE_API_TOKEN      optional bearer token
  TRAE_API_PROMPT     prompt to send
  TRAE_API_STREAM     1 to use SSE stream mode, 0 for blocking mode
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


BASE_URL = os.environ.get("TRAE_API_BASE_URL", "http://127.0.0.1:8787").rstrip("/")
TOKEN = os.environ.get("TRAE_API_TOKEN", "").strip()
PROMPT = os.environ.get("TRAE_API_PROMPT", "Reply with exactly: PYTHON_OK")
USE_STREAM = os.environ.get("TRAE_API_STREAM", "1").strip() != "0"


def make_headers(extra=None):
    headers = {"Accept": "application/json"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    if extra:
        headers.update(extra)
    return headers


def request_json(method: str, path: str, payload=None):
    data = None
    headers = make_headers()
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8")
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = {"success": False, "code": f"HTTP_{error.code}", "message": body}
        return error.code, parsed


def stream_message(content: str):
    request = urllib.request.Request(
        f"{BASE_URL}/v1/chat/stream",
        data=json.dumps(
            {
                "content": content,
                "sessionMetadata": {"client": "python-example"},
            }
        ).encode("utf-8"),
        headers=make_headers(
            {
                "Accept": "text/event-stream",
                "Content-Type": "application/json",
            }
        ),
        method="POST",
    )
    with urllib.request.urlopen(request) as response:
        raw_lines = []
        for raw_line in response:
            line = raw_line.decode("utf-8").rstrip("\r\n")
            if line == "":
                event_name = "message"
                data_lines = []
                for item in raw_lines:
                    if item.startswith("event:"):
                        event_name = item[6:].strip()
                    elif item.startswith("data:"):
                        data_lines.append(item[5:].strip())
                raw_lines = []
                if not data_lines:
                    continue

                payload = json.loads("\n".join(data_lines))
                yield event_name, payload
                if event_name in ("done", "error"):
                    return
                continue
            raw_lines.append(line)


def main():
    status_code, ready = request_json("GET", "/ready")
    if status_code != 200:
        print("Gateway is not ready:")
        print(json.dumps(ready, ensure_ascii=False, indent=2))
        return 1

    if not USE_STREAM:
        status_code, result = request_json(
            "POST",
            "/v1/chat",
            {
                "content": PROMPT,
                "sessionMetadata": {"client": "python-example"},
            },
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if status_code == 200 else 1

    print("Streaming response:")
    final_text = ""
    for event_name, payload in stream_message(PROMPT):
        if event_name == "delta":
            chunk = payload.get("chunk")
            chunk_type = payload.get("type")
            print(f"[delta/{chunk_type}] {chunk}")
        elif event_name == "done":
            final_text = payload.get("result", {}).get("response", {}).get("text", "")
            print("[done]")
        elif event_name == "error":
            print("[error]")
            print(json.dumps(payload, ensure_ascii=False, indent=2))
            return 1
        else:
            print(f"[{event_name}] {json.dumps(payload, ensure_ascii=False)}")

    if final_text:
        print("Final text:")
        print(final_text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
