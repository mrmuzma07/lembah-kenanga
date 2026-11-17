"""Minimal RFC 6455 WebSocket Server implementation using only Python standard library.

Provides real-time bi-directional messaging for multiplayer game state synchronization.
Zero external dependencies (no pip, no websockets library).
"""
import base64
import hashlib
import json
import os
import secrets
import socket
import struct
import threading
import time

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


def _read_bytes(sock, n):
    """Read exactly n bytes from socket, or None if connection closed."""
    buf = bytearray()
    while len(buf) < n:
        try:
            chunk = sock.recv(n - len(buf))
            if not chunk:
                return None
            buf.extend(chunk)
        except (socket.error, OSError):
            return None
    return bytes(buf)


def read_frame(sock):
    """Read one WebSocket frame. Returns (opcode, payload_bytes) or (None, None)."""
    head = _read_bytes(sock, 2)
    if not head:
        return None, None
    b1, b2 = head[0], head[1]
    fin = (b1 & 0x80) != 0
    opcode = b1 & 0x0F
    masked = (b2 & 0x80) != 0
    payload_len = b2 & 0x7F

    if payload_len == 126:
        ext = _read_bytes(sock, 2)
        if not ext:
            return None, None
        payload_len = struct.unpack("!H", ext)[0]
    elif payload_len == 127:
        ext = _read_bytes(sock, 8)
        if not ext:
            return None, None
        payload_len = struct.unpack("!Q", ext)[0]

    mask = _read_bytes(sock, 4) if masked else None
    if masked and not mask:
        return None, None

    data = _read_bytes(sock, payload_len)
    if data is None:
        return None, None

    if masked and mask:
        data = bytearray(data)
        for i in range(len(data)):
            data[i] ^= mask[i % 4]
        data = bytes(data)

    return opcode, data


def send_text(sock, text):
    """Send an unmasked text frame to client."""
    if not isinstance(text, str):
        text = json.dumps(text, ensure_ascii=False)
    payload = text.encode("utf-8")
    length = len(payload)
    header = bytearray()
    header.append(0x81)  # FIN=1, opcode=1 (text)
    if length <= 125:
        header.append(length)
    elif length <= 65535:
        header.append(126)
        header.extend(struct.pack("!H", length))
    else:
        header.append(127)
        header.extend(struct.pack("!Q", length))
    try:
        sock.sendall(bytes(header) + payload)
        return True
    except (socket.error, OSError):
        return False


def send_pong(sock, data=b""):
    """Send pong frame."""
    header = bytearray([0x8A, len(data)])
    try:
        sock.sendall(bytes(header) + data)
        return True
    except (socket.error, OSError):
        return False


class MultiplayerHub:
    """Manages active multiplayer clients, player positions, and broadcasts."""

    def __init__(self):
        self.lock = threading.Lock()
        self.clients = {}  # client_id -> { sock, player }

    def register(self, client_id, sock):
        with self.lock:
            self.clients[client_id] = {
                "sock": sock,
                "player": {
                    "id": client_id,
                    "name": "Pemain",
                    "avatar": "player_m",
                    "x": 0,
                    "y": 0,
                    "dir": "down",
                    "moving": False,
                    "speed": 96,
                    "animT": 0,
                },
            }

    def unregister(self, client_id):
        with self.lock:
            if client_id in self.clients:
                del self.clients[client_id]
        self.broadcast({"type": "leave", "id": client_id})

    def update_player(self, client_id, data):
        with self.lock:
            client = self.clients.get(client_id)
            if not client:
                return None
            player = client["player"]
            for k in ("name", "avatar", "x", "y", "dir", "moving", "speed", "animT", "livekitId"):
                if k in data:
                    player[k] = data[k]
            return dict(player)

    def get_other_players(self, client_id):
        with self.lock:
            return {
                cid: dict(c["player"])
                for cid, c in self.clients.items()
                if cid != client_id and c.get("player")
            }

    def broadcast(self, message, exclude_id=None):
        if not isinstance(message, str):
            text = json.dumps(message, ensure_ascii=False)
        else:
            text = message

        dead = []
        with self.lock:
            targets = list(self.clients.items())

        for cid, c in targets:
            if cid == exclude_id:
                continue
            sock = c.get("sock")
            if sock and not send_text(sock, text):
                dead.append(cid)

        for cid in dead:
            self.unregister(cid)


hub = MultiplayerHub()


def handle(handler):
    """Handle incoming WebSocket upgrade request from HTTP server handler.
    Returns True if handled as WebSocket connection.
    """
    key = handler.headers.get("Sec-WebSocket-Key")
    if not key:
        return False

    accept = base64.b64encode(
        hashlib.sha1((key.strip() + WS_GUID).encode("utf-8")).digest()
    ).decode("utf-8")

    response = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {accept}\r\n"
        "\r\n"
    )

    try:
        handler.connection.sendall(response.encode("utf-8"))
    except (socket.error, OSError):
        return True

    sock = handler.connection
    client_id = secrets.token_hex(6)
    hub.register(client_id, sock)

    try:
        while True:
            opcode, data = read_frame(sock)
            if opcode is None or opcode == 0x8:  # disconnect / close
                break
            if opcode == 0x9:  # ping
                send_pong(sock, data)
                continue
            if opcode == 0xA:  # pong
                continue
            if opcode == 0x1:  # text
                try:
                    msg = json.loads(data.decode("utf-8"))
                except (ValueError, UnicodeDecodeError):
                    continue

                mtype = msg.get("type")
                if mtype == "join":
                    updated = hub.update_player(client_id, msg)
                    others = hub.get_other_players(client_id)
                    send_text(sock, {"type": "init", "id": client_id, "players": others})
                    hub.broadcast({"type": "join", "player": updated}, exclude_id=client_id)
                elif mtype == "move":
                    updated = hub.update_player(client_id, msg)
                    if updated:
                        hub.broadcast({
                            "type": "move",
                            "id": client_id,
                            "x": updated["x"],
                            "y": updated["y"],
                            "dir": updated["dir"],
                            "moving": updated["moving"],
                            "speed": updated["speed"],
                            "animT": updated["animT"],
                            "avatar": updated["avatar"],
                            "livekitId": updated.get("livekitId"),
                        }, exclude_id=client_id)
                elif mtype == "avatar":
                    avatar = msg.get("avatar")
                    if avatar:
                        hub.update_player(client_id, {"avatar": avatar})
                        hub.broadcast({"type": "avatar", "id": client_id, "avatar": avatar}, exclude_id=client_id)
                elif mtype == "ping":
                    send_text(sock, {"type": "pong"})
    finally:
        hub.unregister(client_id)
        try:
            sock.close()
        except Exception:
            pass

    return True
