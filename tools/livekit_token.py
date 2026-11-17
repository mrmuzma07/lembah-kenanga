"""LiveKit JWT Token Generator using pure Python standard library.

Zero external dependencies (no PyJWT / pip needed).
Generates RFC 7519 HMAC-SHA256 (HS256) JWT tokens with LiveKit video grants.
"""
import base64
import hashlib
import hmac
import json
import os
import time

import guard

API_KEY = os.environ.get("LK_LIVEKIT_KEY", "devkey")
API_SECRET = os.environ.get("LK_LIVEKIT_SECRET", "secretkeykenanga1234567890abcdef")
LIVEKIT_URL = os.environ.get("LK_LIVEKIT_URL", "ws://127.0.0.1:7880")


def _b64url_encode(data: bytes) -> str:
    """Encode bytes to unpadded base64url string."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def generate_token(
    identity: str,
    room: str = "valley",
    name: str = None,
    metadata: dict = None,
    ttl_seconds: int = 6 * 3600,
    can_publish: bool = True,
    can_subscribe: bool = True,
) -> str:
    """Generate a signed LiveKit JWT access token."""
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}

    payload = {
        "exp": now + ttl_seconds,
        "nbf": now - 5,
        "iss": API_KEY,
        "sub": identity,
        "name": name or identity,
        "video": {
            "roomJoin": True,
            "room": room,
            "canPublish": can_publish,
            "canSubscribe": can_subscribe,
            "canPublishData": True,
        },
    }

    if metadata:
        payload["metadata"] = json.dumps(metadata, ensure_ascii=False) if isinstance(metadata, dict) else str(metadata)

    encoded_header = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    encoded_payload = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))

    signing_input = f"{encoded_header}.{encoded_payload}".encode("ascii")
    signature = hmac.new(API_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
    encoded_signature = _b64url_encode(signature)

    return f"{encoded_header}.{encoded_payload}.{encoded_signature}"


def handle(handler, method: str, path: str, query: dict, body: bytes) -> bool:
    """Handle HTTP requests for /api/livekit/*. Returns True if handled."""
    if path != "/api/livekit/token":
        return False

    if method != "POST":
        guard.send(handler, {"ok": False, "error": "Method tidak didukung."}, 405)
        return True

    # Rate limiting
    ip = guard.client_ip(handler)
    err = guard.limiter.check("player_read", ip)
    if err:
        guard.send(handler, {"ok": False, "error": err}, 429)
        return True

    data, err = guard.parse_json(body)
    if err:
        guard.send(handler, {"ok": False, "error": err}, 400)
        return True

    username = guard.text_field(data, "username", 32).strip() or "Tamu"
    room = guard.text_field(data, "room", 32).strip() or "valley"
    avatar = guard.text_field(data, "avatar", 32).strip() or "player_m"

    token = generate_token(
        identity=username,
        room=room,
        name=username,
        metadata={"avatar": avatar},
    )

    guard.send(handler, {
        "ok": True,
        "token": token,
        "url": LIVEKIT_URL,
        "room": room,
        "identity": username,
    })
    return True
