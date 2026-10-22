"""
CyberBrick Wi-Fi receiver v7 (Station / Mobile Hotspot mode).
Connects to phone hotspot (SSID: 303) and listens for Three.js UDP control packets.

Run from your laptop over USB:
    mpremote connect COM5 run cyberbrick_wifi1.py
"""
import sys
import time
import socket
import network
import machine
from bbl.servos import ServosController
from bbl.motors import MotorsController

SSID_HOTSPOT = "303"
PASSWORD_HOTSPOT = "jinriquan1992"
PORT = 4210
FAILSAFE_MS = 600
LOG_FILE = "crash_log.txt"

# Smoothing & Stepping parameters
STEP_DEG = 1
STEP_MS = 15
LERP_SPEED = 0.15

RESET_NAMES = {
    getattr(machine, n): n
    for n in ("PWRON_RESET", "HARD_RESET", "WDT_RESET", "DEEPSLEEP_RESET", "SOFT_RESET")
    if hasattr(machine, n)
}


def log_crash(exc):
    """Append the traceback to flash on crash."""
    try:
        with open(LOG_FILE, "a") as f:
            f.write("---- crash, uptime %d ms ----\n" % time.ticks_ms())
            sys.print_exception(exc, f)
    except Exception as e:
        print("could not write log:", e)


print("Reset cause:", RESET_NAMES.get(machine.reset_cause(), machine.reset_cause()))

servos = None
motors = None
sock = None
sta = None

try:
    # ---- Connect to Mobile Hotspot (Station Mode) ----
    # Ensure AP mode is disabled
    ap = network.WLAN(network.AP_IF)
    ap.active(False)

    sta = network.WLAN(network.STA_IF)
    sta.active(False)
    time.sleep_ms(200)
    sta.active(True)
    time.sleep_ms(300)

    print("Connecting to Hotspot:", SSID_HOTSPOT, "...")
    sta.connect(SSID_HOTSPOT, PASSWORD_HOTSPOT)

    timeout_s = 20
    start_time = time.time()
    while not sta.isconnected():
        time.sleep_ms(300)
        print(".", end="")
        if time.time() - start_time > timeout_s:
            print("\nFailed to connect within timeout! Check hotspot SSID/password & 2.4GHz band.")
            sys.exit(1)

    ip = sta.ifconfig()[0]
    print("\n[+] Wi-Fi connected successfully!")
    print("=========================================")
    print(" [OK] CONNECTED TO MOBILE HOTSPOT!")
    print(" Hotspot SSID: ", SSID_HOTSPOT)
    print(" CyberBrick IP:", ip)
    print(" UDP Port:     ", PORT)
    print(" Ready to receive commands...")
    print("=========================================")

    # ---- Actuators ----
    servos = ServosController()
    motors = MotorsController()
    period_cb = getattr(motors, "motors_period_cb", None)

    servos.set_angle(2, 90)
    servos.set_angle(3, 90)
    servos.set_speed(1, 0)
    motors.set_speed(2, 0)

    # Current & target angles for smooth interpolation
    curr_ang = {2: 90.0, 3: 90.0}
    target_ang = {2: 90.0, 3: 90.0}

    # ---- UDP Socket ----
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", PORT))
    sock.setblocking(False)

    last_rx = 0
    last_step = time.ticks_ms()
    last_dbg = time.ticks_ms()

    while True:
        pkt_str = None
        try:
            data, addr = sock.recvfrom(128)
            pkt_str = data.decode().strip()
            if last_rx == 0:
                print(f"[+] First command packet received from {addr[0]}:{addr[1]}")
            last_rx = time.ticks_ms()
        except OSError:
            pass

        # Failsafe: Stop claw & motor if connection drops
        if time.ticks_diff(time.ticks_ms(), last_rx) > FAILSAFE_MS:
            motors.set_speed(2, 0)
            servos.set_speed(1, 0)

        # Process Packet if received
        if pkt_str:
            # Mode A: Three.js Angle Packet (starts with 'B' or contains 'S' and 'E')
            if "S" in pkt_str and "E" in pkt_str:
                parts = pkt_str.split(",")
                for p in parts:
                    if p.startswith("S"):
                        try:
                            # Inverted for physical servo horn orientation: increasing angle lifts the arm UP
                            raw_s = max(0, min(180, abs(float(p[1:]))))
                            target_ang[2] = 180 - raw_s  # Shoulder -> Servo 2
                        except ValueError:
                            pass
                    elif p.startswith("E"):
                        try:
                            # Exact positive angle from UI
                            target_ang[3] = max(0, min(180, abs(float(p[1:]))))  # Elbow -> Servo 3
                        except ValueError:
                            pass
                    elif p.startswith("C"):
                        try:
                            claw_val = int(p[1:])         # Claw -> Servo 1
                            servos.set_speed(1, claw_val)
                        except ValueError:
                            pass
                    elif p.startswith("J"):
                        jog = p[1:]
                        if jog == "up":
                            motors.set_speed(2, 1024)
                        elif jog == "down":
                            motors.set_speed(2, -1024)
                        else:
                            motors.set_speed(2, 0)
                if not any(p.startswith("J") for p in parts):
                    motors.set_speed(2, 0)

            # Mode B: Legacy Keyboard Packet (comma-separated keys)
            else:
                keys = set(pkt_str.split(","))

                # Motor 2 base rotation
                if "up" in keys:
                    motors.set_speed(2, 1024)
                elif "down" in keys:
                    motors.set_speed(2, -1024)
                else:
                    motors.set_speed(2, 0)

                # Servos 2 & 3 stepping
                now = time.ticks_ms()
                if time.ticks_diff(now, last_step) >= STEP_MS:
                    last_step = now
                    for idx, plus, minus in ((2, "a", "d"), (3, "w", "s")):
                        d = STEP_DEG if plus in keys else (-STEP_DEG if minus in keys else 0)
                        if d:
                            target_ang[idx] = min(180, max(0, target_ang[idx] + d))

                # Servo 1 Claw
                if "i" in keys:
                    servos.set_speed(1, 50)
                elif "l" in keys:
                    servos.set_speed(1, -50)
                elif "g" in keys or "stop" in keys:
                    servos.set_speed(1, 0)

        # ---- Smooth Interpolation (lerp) toward target positions ----
        for idx in (2, 3):
            diff = target_ang[idx] - curr_ang[idx]
            if abs(diff) > 0.4:
                curr_ang[idx] += diff * LERP_SPEED
                servos.set_angle(idx, int(curr_ang[idx]))
            elif curr_ang[idx] != target_ang[idx]:
                curr_ang[idx] = target_ang[idx]
                servos.set_angle(idx, int(curr_ang[idx]))

        if period_cb:
            period_cb()

        # Debug heartbeat every 1 second
        if pkt_str and time.ticks_diff(time.ticks_ms(), last_dbg) > 1000:
            last_dbg = time.ticks_ms()
            print("Target S2:", int(target_ang[2]), "S3:", int(target_ang[3]))

        time.sleep_ms(10)

except KeyboardInterrupt:
    print("Stopped by user")
except Exception as e:
    print("CRASH:", repr(e))
    sys.print_exception(e)
    log_crash(e)
finally:
    for m in (1, 2):
        try:
            motors.stop(m)
        except Exception:
            pass
    for i in (1, 2, 3, 4):
        try:
            servos.stop(i)
        except Exception:
            pass
