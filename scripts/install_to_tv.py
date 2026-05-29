#!/usr/bin/env python3
"""Installeer de Throwback-APK op een Android-/Google-TV via adb-over-netwerk.

Gebruik (nadat je op de TV Ontwikkelaarsmodus + USB-/Netwerk-foutopsporing hebt aangezet):

    python3 scripts/install_to_tv.py

Het script scant je lokale netwerk op toestellen met adb-debugging (poort 5555), toont
ze met IP + hostname, laat je er één kiezen, en draait dan `adb connect` + `adb install`.

Alleen standaardbibliotheek — geen pip-installatie nodig.

Handige opties:
    --apk PAD       Andere APK installeren (default: de gebouwde debug-APK).
    --build         Eerst `gradlew assembleDebug` draaien.
    --port N        Andere adb-poort scannen/gebruiken (default: 5555).
    --subnet CIDR   Ander subnet scannen, bijv. 192.168.1.0/24 (default: auto).
    --timeout SEC   Time-out per host bij het scannen (default: 0.3).
"""

from __future__ import annotations

import argparse
import ipaddress
import os
import shutil
import socket
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_APK = REPO_ROOT / "android/app/build/outputs/apk/debug/app-debug.apk"
GRADLEW = REPO_ROOT / "android/gradlew"


# --- adb lokaliseren -------------------------------------------------------

def find_adb() -> str:
    adb = shutil.which("adb")
    if adb:
        return adb
    # Veelvoorkomende SDK-locatie op macOS/Linux als adb niet in PATH staat.
    for cand in (
        Path.home() / "Library/Android/sdk/platform-tools/adb",
        Path.home() / "Android/Sdk/platform-tools/adb",
    ):
        if cand.exists():
            return str(cand)
    sys.exit(
        "Kon 'adb' niet vinden. Installeer Android platform-tools of zet adb in je PATH."
    )


# --- netwerk scannen -------------------------------------------------------

def _subnet_rank(net: ipaddress.IPv4Network) -> int:
    """Sorteervoorkeur: gewone thuis-LANs eerst, VPN/Tailscale (100.64/10) achteraan."""
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


def _all_local_ipv4() -> set[str]:
    """Verzamel alle lokale IPv4-adressen via ifconfig (macOS) / ip (Linux)."""
    import re

    ips: set[str] = set()
    # Het IP van de default route (kan een VPN-interface zijn, maar nuttig als fallback).
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    for cmd in (["ifconfig"], ["ip", "-4", "addr"]):
        try:
            out = subprocess.run(cmd, text=True, capture_output=True).stdout
        except FileNotFoundError:
            continue
        ips.update(re.findall(r"inet (?:addr:)?(\d+\.\d+\.\d+\.\d+)", out))
        if out:
            break
    return ips


def candidate_subnets() -> list[ipaddress.IPv4Network]:
    """Gevonden /24-subnetten van lokale interfaces, gesorteerd op LAN-waarschijnlijkheid."""
    nets: set[ipaddress.IPv4Network] = set()
    for ip in _all_local_ipv4():
        addr = ipaddress.ip_address(ip)
        if addr.is_loopback or addr.is_link_local:
            continue
        nets.add(ipaddress.ip_network(f"{ip}/24", strict=False))
    return sorted(nets, key=lambda n: (_subnet_rank(n), str(n)))


def port_open(ip: str, port: int, timeout: float) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(timeout)
        return s.connect_ex((ip, port)) == 0


def hostname_for(ip: str) -> str:
    try:
        return socket.gethostbyaddr(ip)[0]
    except (socket.herror, socket.gaierror, OSError):
        return "?"


def scan(subnet: ipaddress.IPv4Network, port: int, timeout: float) -> list[tuple[str, str]]:
    hosts = [str(ip) for ip in subnet.hosts()]
    print(f"Scan {subnet} op poort {port} … ({len(hosts)} adressen)")
    found: list[str] = []
    with ThreadPoolExecutor(max_workers=128) as pool:
        for ip, is_open in zip(hosts, pool.map(lambda h: port_open(h, port, timeout), hosts)):
            if is_open:
                found.append(ip)
    # Hostnames pas voor de treffers opzoeken (reverse-DNS is traag).
    with ThreadPoolExecutor(max_workers=32) as pool:
        names = list(pool.map(hostname_for, found))
    return list(zip(found, names))


# --- interactieve keuze ----------------------------------------------------

def choose(devices: list[tuple[str, str]], port: int) -> str | None:
    """Toon de gevonden toestellen en geef het gekozen IP:poort terug (of None om te stoppen)."""
    while True:
        if devices:
            print("\nGevonden toestellen met adb-debugging:")
            for i, (ip, name) in enumerate(devices, 1):
                print(f"  {i}. {ip:<15}  {name}")
        else:
            print("\nGeen toestellen met open adb-poort gevonden.")
        print("  m. Handmatig IP[:poort] invoeren")
        print("  r. Opnieuw scannen")
        print("  q. Stoppen")

        keuze = input("Kies een toestel: ").strip().lower()
        if keuze == "q":
            return None
        if keuze == "r":
            return "RESCAN"
        if keuze == "m":
            handmatig = input("IP of IP:poort: ").strip()
            if not handmatig:
                continue
            return handmatig if ":" in handmatig else f"{handmatig}:{port}"
        if keuze.isdigit() and 1 <= int(keuze) <= len(devices):
            return f"{devices[int(keuze) - 1][0]}:{port}"
        print("Ongeldige keuze.")


# --- adb-acties ------------------------------------------------------------

def run(cmd: list[str]) -> subprocess.CompletedProcess:
    print(f"\n$ {' '.join(cmd)}")
    return subprocess.run(cmd, text=True, capture_output=True)


def connect_and_install(adb: str, target: str, apk: Path) -> bool:
    res = run([adb, "connect", target])
    out = (res.stdout + res.stderr).strip()
    print(out)
    if "connected" not in out.lower():
        print("Verbinden mislukt. Staat Netwerk-foutopsporing aan op de TV?")
        return False
    if "unauthorized" in out.lower() or "failed to authenticate" in out.lower():
        print(
            "Toestel is nog niet geautoriseerd. Bevestig op de TV de dialoog "
            "'Toestaan dat dit toestel debugt?' en kies daarna dit toestel opnieuw."
        )
        return False

    print(f"\nInstalleren van {apk.name} …")
    res = run([adb, "-s", target, "install", "-r", str(apk)])
    print((res.stdout + res.stderr).strip())
    if res.returncode != 0 or "Success" not in res.stdout:
        print("Installatie mislukt. Zie de uitvoer hierboven.")
        return False

    print("\n✅ Geïnstalleerd. Open 'Throwback' in de TV-launcher en koppel OneDrive.")
    print("   Daarna: app → Instellingen → Screensaver instellen (of via de TV-instellingen).")
    return True


# --- main ------------------------------------------------------------------

def main() -> int:
    p = argparse.ArgumentParser(description="Installeer Throwback op een Android-TV via adb.")
    p.add_argument("--apk", type=Path, default=DEFAULT_APK, help="Pad naar de te installeren APK.")
    p.add_argument("--build", action="store_true", help="Eerst de debug-APK bouwen.")
    p.add_argument("--port", type=int, default=5555, help="adb-poort (default 5555).")
    p.add_argument("--subnet", help="Subnet als CIDR, bijv. 192.168.1.0/24 (default: auto).")
    p.add_argument("--timeout", type=float, default=0.3, help="Scan-time-out per host in seconden.")
    args = p.parse_args()

    adb = find_adb()

    if args.build:
        print("Bouwen van de debug-APK …")
        if subprocess.run([str(GRADLEW), "-p", str(REPO_ROOT / "android"), ":app:assembleDebug"]).returncode != 0:
            return 1

    if not args.apk.exists():
        print(f"APK niet gevonden: {args.apk}")
        print("Bouw 'm eerst met --build, of geef --apk een geldig pad.")
        return 1

    if args.subnet:
        try:
            subnet = ipaddress.ip_network(args.subnet, strict=False)
        except ValueError as e:
            print(f"Ongeldig subnet: {e}")
            return 1
    else:
        subnets = candidate_subnets()
        if not subnets:
            print("Kon geen lokaal subnet bepalen. Geef er een op met --subnet 192.168.1.0/24")
            return 1
        if len(subnets) == 1:
            subnet = subnets[0]
        else:
            print("Meerdere netwerken gevonden — kies welke je TV gebruikt (meestal 192.168.x):")
            for i, n in enumerate(subnets, 1):
                hint = "  ← waarschijnlijk VPN/Tailscale" if _subnet_rank(n) == 9 else ""
                print(f"  {i}. {n}{hint}")
            sel = input(f"Subnet [1-{len(subnets)}, default 1]: ").strip()
            idx = int(sel) - 1 if sel.isdigit() and 1 <= int(sel) <= len(subnets) else 0
            subnet = subnets[idx]
        print(f"Gekozen subnet: {subnet}")

    while True:
        devices = scan(subnet, args.port, args.timeout)
        target = choose(devices, args.port)
        if target is None:
            print("Gestopt.")
            return 0
        if target == "RESCAN":
            continue
        if connect_and_install(adb, target, args.apk):
            return 0
        # Bij mislukking opnieuw het menu tonen (geen rescan) zodat je 'm kunt herproberen.
        again = input("\nNog een keer proberen? [j/N] ").strip().lower()
        if again != "j":
            return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nAfgebroken.")
        sys.exit(130)
