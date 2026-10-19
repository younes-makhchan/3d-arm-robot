"""
Web Control Server & Wi-Fi UDP Bridge for CyberBrick Robotic Arm.
Serves the EXACT ArmRobot Three.js Web UI.

1. Connect laptop Wi-Fi to 'CyberBrick_Bot' (pass: 12345678).
2. Run:
     python web_control_server.py
3. Open http://localhost:8080 in your browser.
"""
import http.server
import os
import socket
import sys
import threading
import time

BRICK_IP = sys.argv[1] if len(sys.argv) > 1 else "192.168.4.1"
BRICK_PORT = 4210
WEB_PORT = 8080
UI_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web_ui")

# UDP Socket to CyberBrick
udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)


class BridgeRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=UI_DIR, **kwargs)

    def do_GET(self):
        if self.path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"connected"}')
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == "/api/control":
            length = int(self.headers.get("Content-Length", 0))
            raw_data = self.rfile.read(length)
            try:
                # Forward exact packet (e.g. "B180,S45,E90\n") over UDP to CyberBrick
                udp_sock.sendto(raw_data, (BRICK_IP, BRICK_PORT))
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"status":"sent"}')
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Silence routine HTTP requests
        return


def main():
    print("=" * 60)
    print("🤖 CyberBrick Three.js IK Control Server")
    print(f" Web UI:     http://localhost:{WEB_PORT}")
    print(f" CyberBrick: {BRICK_IP}:{BRICK_PORT}")
    print("=" * 60)

    server = http.server.HTTPServer(("0.0.0.0", WEB_PORT), BridgeRequestHandler)
    print(f"Open http://localhost:{WEB_PORT} in your browser.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
