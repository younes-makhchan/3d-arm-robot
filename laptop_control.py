"""
Laptop keyboard controller for CyberBrick over its own Wi-Fi (UDP), v2.

1. Run cyberbrick_wifi4.py on the board and wait for "Access point up".
2. Connect the laptop's Wi-Fi to "CyberBrick_Bot" (password 12345678).
   Windows will say "No internet" - that is normal, stay connected.
3. pip install pynput
4. python laptop_control.py            (or: python laptop_control.py 192.168.4.1)

Keys:
  Up / Down     -> motor 2 forward / reverse
  I / L         -> servo 1 (claw, continuous): I = open, L = close
  A / D         -> servo 2 (steps, holds its angle)
  W / S         -> servo 3 (steps, holds its angle)
  Esc           -> quit
"""
import socket
import subprocess
import sys
import time
from pynput import keyboard

BRICK_IP = sys.argv[1] if len(sys.argv) > 1 else "192.168.4.1"
PORT = 4210
SEND_HZ = 20

NAMES = {
    keyboard.Key.up: "up",
    keyboard.Key.down: "down",
    keyboard.Key.left: "left",
    keyboard.Key.right: "right",
}
CHARS = {"w": "w", "s": "s", "a": "a", "d": "d", "i": "i", "l": "l","g":"g"}

pressed = set()


def name_of(key):
    if key in NAMES:
        return NAMES[key]
    # Use the key's virtual-key code first: it stays the same on press and
    # release even if Ctrl/Shift/an input method changes key.char.
    vk = getattr(key, "vk", None)
    if vk is not None and 0x41 <= vk <= 0x5A:
        return CHARS.get(chr(vk).lower())
    ch = getattr(key, "char", None)
    return CHARS.get(ch.lower()) if ch else None


def on_press(key):
    if key == keyboard.Key.esc:
        return False
    n = name_of(key)
    if n:
        pressed.add(n)


def on_release(key):
    n = name_of(key)
    if n:
        pressed.discard(n)


def reachable(ip):
    """One ping (Windows or Linux/Mac flags). True if the board answers."""
    flag = "-n" if sys.platform.startswith("win") else "-c"
    try:
        r = subprocess.run(["ping", flag, "1", ip], capture_output=True, timeout=5)
        return r.returncode == 0
    except Exception:
        return False


print(f"Checking that the CyberBrick answers at {BRICK_IP} ...")
if not reachable(BRICK_IP):
    print("NO REPLY from", BRICK_IP)
    print(" - Is the board running cyberbrick_wifi4.py (\"Access point up\")?")
    print(" - Is this laptop connected to the 'CyberBrick_Bot' Wi-Fi?")
    print(" - Is the laptop's Wi-Fi IP 192.168.4.x?  (check with: ipconfig)")
    sys.exit(1)
print("Board reachable.")

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
listener = keyboard.Listener(on_press=on_press, on_release=on_release)
listener.start()
print("Sending - press Esc to quit")

errors = 0
last_shown = None
try:
    while listener.running:
        msg = (",".join(sorted(pressed)) or "stop").encode()
        if msg != last_shown:            # show every change of the held keys
            last_shown = msg
            print("sending:", msg.decode())
        try:
            sock.sendto(msg, (BRICK_IP, PORT))
            errors = 0
        except OSError as e:
            # e.g. WinError 10055 (send queue full) when the Wi-Fi link drops
            errors += 1
            if errors == 1:
                print("send failed:", e, "- retrying (check the Wi-Fi link)")
            time.sleep(0.5)
            if errors > 20:
                print("Giving up: the link to the board is down.")
                break
        time.sleep(1 / SEND_HZ)
finally:
    try:
        sock.sendto(b"stop", (BRICK_IP, PORT))
    except OSError:
        pass
    listener.stop()