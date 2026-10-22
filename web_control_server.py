import asyncio
import http.server
import os
import socket
import sys
import threading
import websockets

BRICK_IP = sys.argv[1] if len(sys.argv) > 1 else "192.168.4.1"
BRICK_PORT = 4210
WEB_PORT = 8080
WS_PORT = 8765
UI_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web_ui")

# UDP Socket to CyberBrick
udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
last_udp_packet = b""


class BridgeRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=UI_DIR, **kwargs)

    def do_GET(self):
        if self.path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b'{"status":"connected"}')
        else:
            super().do_GET()

    def do_POST(self):
        # Fallback HTTP POST endpoint for compatibility
        if self.path == "/api/control":
            length = int(self.headers.get("Content-Length", 0))
            raw_data = self.rfile.read(length)
            try:
                global last_udp_packet
                if raw_data != last_udp_packet:
                    last_udp_packet = raw_data
                    udp_sock.sendto(raw_data, (BRICK_IP, BRICK_PORT))
                    print(f"[HTTP -> UDP] Sent to {BRICK_IP}:{BRICK_PORT} -> {raw_data.decode(errors='ignore').strip()}")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"status":"sent"}')
            except Exception as e:
                print(f"[HTTP ERROR]: {e}")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(str(e).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        return


async def ws_handler(websocket):
    global last_udp_packet
    print("⚡ New WebSocket client connected!")
    try:
        async for message in websocket:
            raw_data = message.encode("utf-8") if isinstance(message, str) else message
            if raw_data != last_udp_packet:
                last_udp_packet = raw_data
                try:
                    udp_sock.sendto(raw_data, (BRICK_IP, BRICK_PORT))
                    print(f"[WS -> UDP] Sent to {BRICK_IP}:{BRICK_PORT} -> {raw_data.decode(errors='ignore').strip()}")
                except Exception as e:
                    print(f"[UDP SEND ERROR]: {e}")
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        print("⚡ WebSocket client disconnected.")


def start_http_server():
    server = http.server.HTTPServer(("0.0.0.0", WEB_PORT), BridgeRequestHandler)
    server.serve_forever()


async def start_ws_server():
    async with websockets.serve(ws_handler, "0.0.0.0", WS_PORT):
        await asyncio.Future()


def main():
    print("=" * 65)
    print("🤖 CyberBrick Three.js WebSocket + UDP Bridge Server")
    print(f" Web UI:        http://localhost:{WEB_PORT}")
    print(f" WebSocket:     ws://0.0.0.0:{WS_PORT}")
    print(f" Target Robot:  {BRICK_IP}:{BRICK_PORT}")
    print("=" * 65)

    http_thread = threading.Thread(target=start_http_server, daemon=True)
    http_thread.start()

    print(f"HTTP Server running at http://localhost:{WEB_PORT}")
    print(f"WebSocket Server listening on port {WS_PORT}")
    print("Ready for connections! Press Ctrl+C to stop.\n")

    try:
        asyncio.run(start_ws_server())
    except KeyboardInterrupt:
        print("\nStopping servers...")


if __name__ == "__main__":
    main()
