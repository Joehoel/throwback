#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["typer>=0.12", "rich>=13", "questionary>=2"]
# ///
"""Installeer de Throwback-APK op een Android-/Google-TV via adb-over-netwerk.

Twee helften: (1) bepaal welke APK — uit een GitHub Release (default), een lokaal pad, of vers
gebouwd; (2) kies een toestel en installeer. Vindt toestellen via reeds-verbonden adb én een
LAN-scan op de adb-poort, dus meestal hoef je geen IP te typen.

Agent-vriendelijk: elke invoer heeft een flag. Er wordt alléén interactief gevraagd als een mens
aan een TTY zit én nog geen doel heeft opgegeven. Met flags / zonder TTY / met --json blijft het
volledig non-interactief.

    uv run scripts/install_to_tv.py                 # laatste release -> vind de TV -> installeer
    uv run scripts/install_to_tv.py --build -y      # bouw debug-APK, pak het enige toestel
    uv run scripts/install_to_tv.py --device 192.168.1.50:5555
    uv run scripts/install_to_tv.py --list --json   # toestellen enumereren (agent-discovery)

Exit codes: 0 ok · 2 ontbrekende tool · 3 geen toestel · 4 dubbelzinnig doel (non-interactief,
            >1 toestel, niets gekozen) · 5 APK-fout · 6 installatie mislukt
"""
from __future__ import annotations

import ipaddress
import re
import shutil
import socket
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import List, Optional

import questionary
import typer
from rich.console import Console
from rich.table import Table

# Chatter naar stderr; stdout blijft schoon voor machineleesbare regels / --json.
err = Console(stderr=True)
out = Console()

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DEBUG_APK = REPO_ROOT / "android/app/build/outputs/apk/debug/app-debug.apk"
GRADLEW = REPO_ROOT / "android/gradlew"
REPO_DEFAULT = "Joehoel/throwback"

app = typer.Typer(add_completion=False, help=__doc__)


def die(msg: str, code: int) -> "typer.NoReturn":
    err.print(f"[red]fout:[/] {msg}")
    raise typer.Exit(code)


def find_adb() -> str:
    if adb := shutil.which("adb"):
        return adb
    for cand in (
        Path.home() / "Library/Android/sdk/platform-tools/adb",
        Path.home() / "Android/Sdk/platform-tools/adb",
    ):
        if cand.exists():
            return str(cand)
    die("kon 'adb' niet vinden. Installeer Android platform-tools of zet adb in je PATH.", 2)


def run(cmd: list[str], *, capture: bool = False) -> subprocess.CompletedProcess:
    """Draai een commando (streamt naar stderr, of capture). Raist nooit op non-zero."""
    return subprocess.run(
        cmd, text=True,
        stdout=subprocess.PIPE if capture else err.file,
        stderr=subprocess.PIPE if capture else err.file,
    )


# --- toestellen vinden: reeds-verbonden adb + LAN-scan ---------------------

def adb_ready(adb: str) -> list[str]:
    """Serials die in 'device'-state staan (al verbonden / geautoriseerd)."""
    cp = run([adb, "devices"], capture=True)
    ready, skipped = [], []
    for line in (cp.stdout or "").splitlines()[1:]:
        parts = line.split()
        if len(parts) >= 2:
            (ready if parts[1] == "device" else skipped).append((parts[0], parts[1]))
    for serial, state in skipped:
        err.print(f"[yellow]sla {serial} over (state: {state})[/]")
    return [s for s, _ in ready]


def _local_ipv4() -> set[str]:
    ips: set[str] = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    for cmd in (["ifconfig"], ["ip", "-4", "addr"]):
        try:
            o = subprocess.run(cmd, text=True, capture_output=True).stdout
        except FileNotFoundError:
            continue
        ips.update(re.findall(r"inet (?:addr:)?(\d+\.\d+\.\d+\.\d+)", o))
        if o:
            break
    return ips


def _subnet_rank(net: ipaddress.IPv4Network) -> int:
    first = net.network_address
    if first in ipaddress.ip_network("192.168.0.0/16"):
        return 0
    if first in ipaddress.ip_network("172.16.0.0/12"):
        return 1
    if first in ipaddress.ip_network("10.0.0.0/8"):
        return 2
    if first in ipaddress.ip_network("100.64.0.0/10"):  # Tailscale/CGNAT — bijna nooit de TV
        return 9
    return 5


def candidate_subnets() -> list[ipaddress.IPv4Network]:
    nets: set[ipaddress.IPv4Network] = set()
    for ip in _local_ipv4():
        addr = ipaddress.ip_address(ip)
        if not (addr.is_loopback or addr.is_link_local):
            nets.add(ipaddress.ip_network(f"{ip}/24", strict=False))
    return sorted(nets, key=lambda n: (_subnet_rank(n), str(n)))


def _port_open(ip: str, port: int, timeout: float) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(timeout)
        return s.connect_ex((ip, port)) == 0


def _hostname(ip: str) -> str:
    try:
        return socket.gethostbyaddr(ip)[0]
    except (socket.herror, socket.gaierror, OSError):
        return "?"


def lan_scan(port: int, timeout: float, subnet: Optional[str]) -> list[tuple[str, str]]:
    """Scan het LAN op een open adb-poort; geef [(ip:port, hostname)] terug."""
    if subnet:
        nets = [ipaddress.ip_network(subnet, strict=False)]
    else:
        nets = candidate_subnets()
        if not nets:
            err.print("[yellow]kon geen lokaal subnet bepalen; sla scan over[/]")
            return []
        nets = [nets[0]]  # meest waarschijnlijke LAN
    found: list[str] = []
    for net in nets:
        hosts = [str(ip) for ip in net.hosts()]
        err.print(f"[dim]scan {net} op poort {port} ({len(hosts)} adressen) ...[/]")
        with ThreadPoolExecutor(max_workers=128) as pool:
            for ip, ok in zip(hosts, pool.map(lambda h: _port_open(h, port, timeout), hosts)):
                if ok:
                    found.append(ip)
    with ThreadPoolExecutor(max_workers=32) as pool:
        names = list(pool.map(_hostname, found))
    return [(f"{ip}:{port}", name) for ip, name in zip(found, names)]


def ensure_connected(adb: str, target: str) -> bool:
    """Verbind een netwerk-target (host:port) als dat nog niet verbonden is."""
    if ":" not in target:  # lijkt een usb-serial: al verbonden
        return True
    res = run([adb, "connect", target], capture=True)
    blob = f"{res.stdout}{res.stderr}".lower()
    if "unauthorized" in blob or "failed to authenticate" in blob:
        err.print(f"[yellow]{target}: nog niet geautoriseerd — bevestig de debug-dialoog op de TV[/]")
        return False
    return "connected" in blob


def device_model(adb: str, target: str) -> str:
    """Merk + model via getprop ('KPN DIW7022', 'Google TV Streamer'), of '' als onbereikbaar.

    Veel bruikbaarder dan de reverse-DNS hostname (bijv. 'device-209.home'). Vereist een
    geautoriseerde verbinding; voor netwerk-targets wordt eerst best-effort verbonden.
    """
    if ":" in target:
        run([adb, "connect", target], capture=True)
    cp = run([adb, "-s", target, "shell",
              "getprop ro.product.brand; getprop ro.product.model"], capture=True)
    parts = [p.strip() for p in (cp.stdout or "").splitlines() if p.strip()]
    if len(parts) < 2:
        return ""
    brand, model = parts[0], parts[1]
    # vermijd dubbel merk: brand 'KPN' + model 'KPN DIW7022' -> 'KPN DIW7022'.
    return model if model.lower().startswith(brand.lower()) else f"{brand} {model}"


def device_models(adb: str, targets: list[str]) -> dict[str, str]:
    """Parallel de modelnaam van elk target ophalen (best-effort, lege string bij falen)."""
    if not targets:
        return {}
    with ThreadPoolExecutor(max_workers=16) as pool:
        return dict(zip(targets, pool.map(lambda t: device_model(adb, t), targets)))


@app.command()
def main(
    tag: Optional[str] = typer.Option(None, "--tag", "-t", help="Release-tag (default: laatste release)."),
    apk: Optional[Path] = typer.Option(None, "--apk", help="Installeer deze lokale APK i.p.v. een release te halen."),
    build: bool = typer.Option(False, "--build", help="Bouw eerst de debug-APK en installeer die."),
    repo: Optional[str] = typer.Option(None, "--repo", help="GitHub-repo owner/name (default: gh's huidige repo, anders Joehoel/throwback)."),
    device: Optional[List[str]] = typer.Option(None, "--device", "-d", help="Doel serial/host:port (herhaalbaar). Slaat de keuzelijst over."),
    connect: Optional[List[str]] = typer.Option(None, "--connect", help="adb connect dit host[:port] eerst (herhaalbaar; :5555 aangenomen)."),
    all_devices: bool = typer.Option(False, "--all", help="Installeer op elk verbonden toestel (non-interactief)."),
    no_scan: bool = typer.Option(False, "--no-scan", help="Sla de LAN-scan over (alleen reeds-verbonden adb-toestellen)."),
    port: int = typer.Option(5555, "--port", help="adb-poort om te scannen/gebruiken."),
    subnet: Optional[str] = typer.Option(None, "--subnet", help="Subnet als CIDR voor de scan, bijv. 192.168.1.0/24 (default: auto)."),
    timeout: float = typer.Option(0.3, "--timeout", help="Scan-time-out per host (seconden)."),
    list_only: bool = typer.Option(False, "--list", help="Toon gevonden toestellen en stop."),
    yes: bool = typer.Option(False, "--yes", "-y", help="Vraag nooit: pak het enige toestel, anders faal."),
    as_json: bool = typer.Option(False, "--json", help="Resultaat als JSON op stdout (impliceert geen prompts)."),
):
    """Download de release-APK (of bouw/gebruik een lokale) en installeer op de gekozen TV('s)."""
    adb = find_adb()
    non_interactive = as_json or yes or not sys.stdin.isatty()

    # 1. Expliciete --connect targets eerst verbinden.
    for addr in connect or []:
        addr = addr if ":" in addr else f"{addr}:{port}"
        err.print(f"[dim]verbinden met {addr} ...[/]")
        if not ensure_connected(adb, addr):
            die(f"adb connect {addr} mislukt", 3)

    # 2. Kandidaten verzamelen: reeds-verbonden + (optioneel) LAN-scan.
    ready = adb_ready(adb)
    targeted = bool(device or connect or all_devices)
    do_scan = (list_only or not targeted) and not no_scan
    scanned = lan_scan(port, timeout, subnet) if do_scan else []
    # ip:port dat al verbonden is niet dubbel tonen.
    scanned = [(t, n) for t, n in scanned if t not in ready]

    if list_only:
        models = device_models(adb, ready + [t for t, _ in scanned])
        if as_json:
            out.print_json(data={
                "connected": [{"target": s, "model": models.get(s, "")} for s in ready],
                "discovered": [{"target": t, "model": models.get(t, ""), "hostname": n}
                               for t, n in scanned],
            })
        else:
            table = Table("doel", "bron", "toestel", "hostname")
            for s in ready:
                table.add_row(s, "verbonden", models.get(s, ""), "")
            for t, n in scanned:
                table.add_row(t, "lan-scan", models.get(t, ""), n)
            out.print(table)
        raise typer.Exit(0)

    # 3. Doel(en) kiezen.
    all_serials = ready + [t for t, _ in scanned]

    if device:
        targets = list(device)
    elif all_devices:
        targets = list(ready)
        if not targets:
            die("--all maar geen verbonden toestellen", 3)
    elif len(all_serials) == 1:
        targets = all_serials
    elif not all_serials:
        die("geen toestellen gevonden. Zet Netwerk-foutopsporing aan op de TV, of gebruik --connect <tv-ip>.", 3)
    else:
        # Meerdere toestellen: verrijk met de modelnaam zodat de keuze herkenbaar is.
        models = device_models(adb, all_serials)
        host = {t: n for t, n in scanned}
        def label(s: str) -> str:
            extra = models.get(s) or host.get(s, "")
            return f"{s}  ({extra})" if extra else s
        if non_interactive:
            err.print("[red]meerdere toestellen; kies met --device <doel>, of --all:[/]")
            for s in all_serials:
                err.print(f"  {label(s)}")
            raise typer.Exit(4)
        picked = questionary.checkbox(
            "Kies toestel(len) om op te installeren:",
            choices=[questionary.Choice(label(s), value=s) for s in all_serials],
        ).ask()
        if not picked:
            die("geen toestel gekozen", 4)
        targets = picked

    # 4. APK bepalen.
    tmp: Optional[tempfile.TemporaryDirectory] = None
    if build:
        err.print("[dim]bouwen van de debug-APK ...[/]")
        if run([str(GRADLEW), "-p", str(REPO_ROOT / "android"), ":app:assembleDebug"]).returncode != 0:
            die("gradle-build mislukt", 5)
        apk_path = DEFAULT_DEBUG_APK
    elif apk:
        if not apk.is_file():
            die(f"lokale APK niet gevonden: {apk}", 5)
        apk_path = apk
    else:
        if not shutil.which("gh"):
            die("'gh' niet gevonden (nodig om een release te downloaden). Of gebruik --apk/--build.", 2)
        if not repo:
            cp = run(["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], capture=True)
            repo = (cp.stdout or "").strip() or REPO_DEFAULT
        tmp = tempfile.TemporaryDirectory()
        err.print(f"[dim]download {tag or 'laatste'} release-APK van {repo} ...[/]")
        cmd = ["gh", "release", "download", *( [tag] if tag else [] ),
               "--repo", repo, "--pattern", "*.apk", "--dir", tmp.name, "--clobber"]
        if run(cmd).returncode != 0:
            die(f"kon geen APK downloaden van {repo} ({tag or 'laatste'}). Bestaat er een release met een .apk-asset?", 5)
        apks = sorted(Path(tmp.name).glob("*.apk"))
        if not apks:
            die("release had geen .apk-asset", 5)
        apk_path = apks[0]
    err.print(f"[dim]APK: {apk_path.name}[/]")

    # 5. Installeren.
    results, any_failed = [], False
    for target in targets:
        if not ensure_connected(adb, target):
            results.append({"target": target, "status": "connect-failed"})
            any_failed = True
            continue
        err.print(f"[dim]installeren op {target} ...[/]")
        rc = run([adb, "-s", target, "install", "-r", str(apk_path)]).returncode
        status = "installed" if rc == 0 else "failed"
        any_failed |= rc != 0
        results.append({"target": target, "status": status})
        if not as_json:
            err.print(f"[green]✓ {target}[/]" if rc == 0 else f"[red]✗ {target}[/]")
            print(f"{target}\t{status}")  # machineleesbare regel op stdout

    if tmp:
        tmp.cleanup()
    if as_json:
        out.print_json(data={"apk": apk_path.name, "results": results})
    if any_failed:
        die("een of meer installaties mislukt", 6)
    err.print("[green]klaar. Open 'Throwback' in de TV-launcher.[/]")


if __name__ == "__main__":
    app()
