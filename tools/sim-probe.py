#!/usr/bin/env python3
"""The game in iOS Safari, in an Xcode simulator: what WebGL offers there and how the frames go.

Serves the game (like tools/serve.py) with tools/sim-probe.js added to the page, boots a
simulator, opens the game in its Safari and prints what the probe reports: WebGL's features
(parallel shader compiling, fences, MSAA, texture sizes), whether a shader compiles ahead, then
(with --full) entering a deep cube, a few portal trips and a quality level switch, with the
frames over 50 ms and the shaders compiled while drawing. The simulator draws with the Mac's
GPU: its features and Safari's behaviour are a phone's, its speed is not. It does not enforce
iOS's memory limits either, but --memory measures what the page takes: in the town, at the hordes
of a few depths and back in the town, what the game counts (its pixels and MSAA, WebGL's buffers
and textures, the cubes' geometry, the narrator's clips) and the footprint of Safari's processes
that hold it (the page's WebContent, and the GPU process with the WebGL's memory), as the Mac's
`footprint` reports them: what iOS's memory limits go by.

Usage: uv run --no-project tools/sim-probe.py [--device "iPhone 16e"] [--full | --memory]
       [--look low] [--trips 4] [--depth 14] [--depths 2,4,6,8] [--theme nests] [--seed 7]
       [--port 8100] [--keep]

A device already booted is used as it is and left running; one booted here is shut down at the
end (--keep: left running).
"""
import argparse
import http.server
import json
import subprocess
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from serve import NoCacheHandler, ROOT, default_assets_root  # noqa: E402

PROBE = Path(__file__).resolve().parent / "sim-probe.js"
reports = []
done = threading.Event()


class ProbeHandler(NoCacheHandler):
    device = None   # (--memory: the simulator whose Safari is measured)
    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            html = (ROOT / "index.html").read_text().replace("</body>", '<script type="module" src="/__probe.js"></script></body>')
            return self.send_body(html.encode(), "text/html")
        if path == "/__probe.js":
            return self.send_body(PROBE.read_bytes(), "text/javascript")
        return super().do_GET()

    def do_POST(self):
        if not self.path.startswith("/report/"):
            return super().do_POST()
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode()
        step = self.path[len("/report/"):]
        reports.append((step, body))
        print(f"{step}: {body}", flush=True)
        if ProbeHandler.device and step not in ("caps", "done", "error"):
            print(f"  safari: {footprints(ProbeHandler.device)}", flush=True)
        if step in ("done", "error"):
            done.set()
        self.send_response(204)
        self.end_headers()

    def send_body(self, body, kind):
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def footprints(udid):
    """The footprint (MB) of the simulator's WebKit processes: its biggest WebContent (the page)
    and its GPU process."""
    launchd = subprocess.run(["pgrep", "-f", f"launchd_sim.*{udid}"], text=True, capture_output=True).stdout.split()
    if not launchd:
        return "no simulator processes"
    out = {}
    for line in subprocess.run(["ps", "-axo", "pid=,ppid=,command="], text=True, capture_output=True).stdout.splitlines():
        pid, ppid, command = line.split(None, 2)
        kind = next((k for k in ("WebContent", "GPU") if f"com.apple.WebKit.{k}" in command), None)
        if ppid not in launchd or not kind:
            continue
        report = subprocess.run(["footprint", pid], text=True, capture_output=True).stdout
        mb = next((float(l.split("Footprint:")[1].split()[0]) for l in report.splitlines() if "Footprint:" in l), 0)
        out[kind] = max(out.get(kind, 0), mb)
    return ", ".join(f"{k} {v:.0f} MB" for k, v in out.items()) + f" (together {sum(out.values()):.0f} MB)"


def simctl(*args):
    return subprocess.run(["xcrun", "simctl", *args], text=True, capture_output=True)


def find_device(name):
    devices = json.loads(simctl("list", "devices", "available", "-j").stdout)["devices"]
    found = [d for runtime in sorted(devices, reverse=True) for d in devices[runtime] if d["name"] == name]
    if not found:
        sys.exit(f"no available simulator named {name!r} (xcrun simctl list devices)")
    return next((d for d in found if d["state"] == "Booted"), found[0])


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--device", default="iPhone 16e")
    parser.add_argument("--full", action="store_true", help="also play: a deep cube, portal trips, a level switch")
    parser.add_argument("--memory", action="store_true", help="what the page holds: the town, a few depths' hordes, the town again")
    parser.add_argument("--depths", default="2,4,6,8", help="the depths --memory goes to")
    parser.add_argument("--look", default="low", help="the lighting level to play at (auto, high, medium, low, lowest)")
    parser.add_argument("--trips", type=int, default=4)
    parser.add_argument("--depth", type=int, default=14)
    parser.add_argument("--theme", default="nests")
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--port", type=int, default=8100)
    parser.add_argument("--timeout", type=int, default=300, help="seconds to wait for the probe")
    parser.add_argument("--keep", action="store_true", help="leave a simulator booted here running")
    args = parser.parse_args()

    ProbeHandler.assets = default_assets_root() / "assets"
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), ProbeHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    device = find_device(args.device)
    booted_here = device["state"] != "Booted"
    if booted_here:
        print(f"booting {device['name']} ({device['udid']})", flush=True)
        simctl("boot", device["udid"])
        simctl("bootstatus", device["udid"], "-b")
    mode = "memory" if args.memory else "full" if args.full else "caps"
    if mode == "memory":
        ProbeHandler.device = device["udid"]
        url = f"http://localhost:{args.port}/?probe=memory&perf=1&lang=en&dev=1&seed={args.seed}&depths={args.depths}&r={int(time.time())}"
    else:
        url = (f"http://localhost:{args.port}/?probe={mode}&lang=en&dev=1&seed={args.seed}&theme={args.theme}"
               f"&d={args.depth}&look={args.look}&trips={args.trips}&r={int(time.time())}")
    simctl("openurl", device["udid"], url)
    try:
        if mode == "caps":
            deadline = time.time() + args.timeout
            while time.time() < deadline and not any(step == "caps" for step, _ in reports):
                time.sleep(0.5)
        elif not done.wait(args.timeout):
            print("the probe did not finish in time", flush=True)
    finally:
        if booted_here and not args.keep:
            simctl("shutdown", device["udid"])
        server.shutdown()


if __name__ == "__main__":
    main()
