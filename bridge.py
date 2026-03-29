#!/usr/bin/env python3
import sys
import re
import os
import json
import subprocess
import signal
import time
import socket

proxy_process = None

DEFAULT_VPN_PORT = 9735
DATA_DIR = "/data"
CONFIG_PATH = os.path.join(DATA_DIR, "tunnelsatsv3.conf")
APP_CONFIG_PATH = os.path.join(DATA_DIR, "config.json")

def extract_vpn_port(config_content):
    try:
        match = re.search(r'#\s*VPNPort:\s*(\d+)', config_content, re.IGNORECASE)
        if match:
            return int(match.group(1))
    except (ValueError, IndexError):
        pass
    return DEFAULT_VPN_PORT

def get_target_ip():
    try:
        if os.path.exists(APP_CONFIG_PATH):
            with open(APP_CONFIG_PATH, 'r') as f:
                config_data = json.load(f)
                target = config_data.get("target-node", "lnd")
                hostname = f"{target}.embassy"
                return socket.gethostbyname(hostname)
    except Exception as e:
        print(f"Error resolving target IP: {e}", file=sys.stderr)
    return None

def inbound_up():
    target_ip = get_target_ip()
    if not target_ip:
        print("Warning: Could not resolve target IP. Inbound routing disabled.", file=sys.stderr)
        return False
        
    try:
        with open(CONFIG_PATH, 'r') as f:
            config_content = f.read()
    except Exception as e:
        print("Failed to read WireGuard config.", file=sys.stderr)
        return False
        
    vpn_port = extract_vpn_port(config_content)
    
    try:
        # PREROUTING: DNAT inbound TCP traffic from wg0 on <VPNPort> to <TargetIP>:9735
        subprocess.run(["iptables", "-t", "nat", "-A", "PREROUTING", "-i", "tunnelsatsv3", "-p", "tcp", "--dport", str(vpn_port), "-j", "DNAT", "--to-destination", f"{target_ip}:9735"], check=True)
        # POSTROUTING: Masquerade outgoing eth0 traffic targeted at <TargetIP>:9735 to ensure the node replies via VPN natively
        subprocess.run(["iptables", "-t", "nat", "-A", "POSTROUTING", "-o", "eth0", "-d", target_ip, "-p", "tcp", "--dport", "9735", "-j", "MASQUERADE"], check=True)
        # FORWARD RULES
        subprocess.run(["iptables", "-A", "FORWARD", "-i", "tunnelsatsv3", "-o", "eth0", "-p", "tcp", "-d", target_ip, "--dport", "9735", "-j", "ACCEPT"], check=True)
        subprocess.run(["iptables", "-A", "FORWARD", "-i", "eth0", "-o", "tunnelsatsv3", "-m", "state", "--state", "RELATED,ESTABLISHED", "-j", "ACCEPT"], check=True)
        print(f"Inbound routing configured: Port {vpn_port} -> {target_ip}:9735")
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error configuring inbound iptables: {e}", file=sys.stderr)
        return False

def inbound_down():
    target_ip = get_target_ip()
    if not target_ip:
        return
        
    try:
        with open(CONFIG_PATH, 'r') as f:
            config_content = f.read()
    except Exception as e:
        return
        
    vpn_port = extract_vpn_port(config_content)
    
    try:
        subprocess.run(["iptables", "-t", "nat", "-D", "PREROUTING", "-i", "tunnelsatsv3", "-p", "tcp", "--dport", str(vpn_port), "-j", "DNAT", "--to-destination", f"{target_ip}:9735"], check=False)
        subprocess.run(["iptables", "-t", "nat", "-D", "POSTROUTING", "-o", "eth0", "-d", target_ip, "-p", "tcp", "--dport", "9735", "-j", "MASQUERADE"], check=False)
        subprocess.run(["iptables", "-D", "FORWARD", "-i", "tunnelsatsv3", "-o", "eth0", "-p", "tcp", "-d", target_ip, "--dport", "9735", "-j", "ACCEPT"], check=False)
        subprocess.run(["iptables", "-D", "FORWARD", "-i", "eth0", "-o", "tunnelsatsv3", "-m", "state", "--state", "RELATED,ESTABLISHED", "-j", "ACCEPT"], check=False)
        print("Inbound routing disabled.")
    except Exception as e:
        pass

def get_wg_ip():
    try:
        result = subprocess.run(
            ["ip", "-4", "addr", "show", "tunnelsatsv3"],
            check=True, capture_output=True, text=True
        )
        match = re.search(r'inet\s+([0-9\.]+)/\d+', result.stdout)
        if match:
            return match.group(1)
    except subprocess.CalledProcessError:
        pass
    return None

def proxy_up():
    global proxy_process
    wg_ip = get_wg_ip()
    if not wg_ip:
        print("Failed to get tunnelsatsv3 IP address for proxy binding.", file=sys.stderr)
        return False
    try:
        # Apply killswitch rule
        subprocess.run(
            ["iptables", "-I", "OUTPUT", "1", "-m", "owner", "--uid-owner", "proxy_user", "!", "-o", "tunnelsatsv3", "-j", "REJECT"],
            check=True
        )
        # Start microsocks
        cmd = ["su-exec", "proxy_user", "/usr/local/bin/microsocks", "-i", "0.0.0.0", "-p", "1080", "-b", wg_ip]
        proxy_process = subprocess.Popen(cmd)
        print(f"Proxy started on 0.0.0.0:1080 bound securely to {wg_ip}")
        return True
    except Exception as e:
        print(f"Failed to start proxy: {str(e)}", file=sys.stderr)
        return False

def proxy_down():
    global proxy_process
    try:
        if proxy_process:
            proxy_process.terminate()
            proxy_process.wait(timeout=5)
            proxy_process = None
        subprocess.run(
            ["iptables", "-D", "OUTPUT", "-m", "owner", "--uid-owner", "proxy_user", "!", "-o", "tunnelsatsv3", "-j", "REJECT"],
            check=False
        )
        print("Proxy stopped.")
    except Exception as e:
        print(f"Error stopping proxy: {str(e)}", file=sys.stderr)

def check_proxy_health():
    try:
        with socket.create_connection(("127.0.0.1", 1080), timeout=2):
            return {"status": "running", "proxy_ready": True}
    except OSError:
        pass
    return {"status": "stopped", "proxy_ready": False}

def shutdown_handler(signum, frame):
    print("Received shutdown signal. Stopping services...")
    inbound_down()
    proxy_down()
    try:
        vpn_down(CONFIG_PATH)
        print("VPN Stopped Successfully")
    except Exception as e:
        print(f"Error stopping VPN: {str(e)}", file=sys.stderr)
    sys.exit(0)

def vpn_up(config_path):
    return subprocess.run(
        ["wg-quick", "up", config_path],
        check=True,
        capture_output=True,
        text=True
    )

def vpn_down(config_path):
    return subprocess.run(
        ["wg-quick", "down", config_path],
        check=True,
        capture_output=True,
        text=True
    )

def get_status():
    try:
        result = subprocess.run(
            ["wg", "show", "tunnelsatsv3"],
            check=True,
            capture_output=True,
            text=True
        )
        handshake_match = re.search(r'latest handshake: (.*)', result.stdout)
        handshake = handshake_match.group(1) if handshake_match else "unknown"
        
        return {
            "status": "running",
            "vpn_connected": True,
            "handshake": handshake
        }
    except (subprocess.CalledProcessError, FileNotFoundError):
        return {
            "status": "stopped",
            "vpn_connected": False,
            "handshake": "none"
        }

def main():
    if len(sys.argv) < 2:
        print("Usage: bridge.py <command> [args]")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "start":
        signal.signal(signal.SIGTERM, shutdown_handler)
        signal.signal(signal.SIGINT, shutdown_handler)
        try:
            if not os.path.exists(CONFIG_PATH):
                print(f"WireGuard config not found at {CONFIG_PATH}. Waiting for user setup...", file=sys.stderr)
                while True:
                    time.sleep(5)
                    # We block instead of crashing because StartOS relies on initial healthchecks to prompt config.
            vpn_up(CONFIG_PATH)
            print("VPN Started Successfully")
            
            if not proxy_up():
                print("Failed to initialize outbound privacy engine. Aborting.", file=sys.stderr)
                sys.exit(1)
                
            inbound_up()
            
            # Stay alive
            while True:
                time.sleep(1)
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            stderr = getattr(e, 'stderr', str(e))
            print(f"Failed to start services: {stderr}", file=sys.stderr)
            sys.exit(1)
            
    elif command == "stop":
        try:
            vpn_down(CONFIG_PATH)
            print("VPN Stopped Successfully")
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            stderr = getattr(e, 'stderr', str(e))
            print(f"Failed to stop VPN: {stderr}", file=sys.stderr)
            sys.exit(1)
            
    elif command == "status":
        print(json.dumps(get_status(), indent=2))
        
    elif command == "health":
        target = sys.argv[2] if len(sys.argv) > 2 else "vpn"
        
        if target == "vpn":
            status = get_status()
            if status["vpn_connected"]:
                print(json.dumps({"result": "ok"}))
            else:
                print(json.dumps({"result": "VPN is not connected"}))
                sys.exit(1)
        elif target == "proxy":
            status = check_proxy_health()
            if status["proxy_ready"]:
                print(json.dumps({"result": "ok"}))
            else:
                print(json.dumps({"result": "Proxy is not accepting connections"}))
                sys.exit(1)


    elif command == "config":
        subcommand = sys.argv[2] if len(sys.argv) > 2 else None
        
        if subcommand == "get":
            # StartOS calls this to populate the UI
            if os.path.exists(APP_CONFIG_PATH):
                with open(APP_CONFIG_PATH, 'r') as f:
                    print(f.read())
            else:
                # Default empty config for initial install
                print(json.dumps({
                    "target-node": "lnd",
                    "tunnelsats-conf": ""
                }))
                
        elif subcommand == "set":
            # StartOS passes the UI values via stdin
            try:
                config_data = json.load(sys.stdin)
                
                # 1. Save the JSON config for future "get" calls
                with open(APP_CONFIG_PATH, 'w') as f:
                    json.dump(config_data, f, indent=2)
                
                # 2. Extract the .conf blob and write it to the WireGuard path
                wg_conf = config_data.get("tunnelsats-conf", "")
                if wg_conf:
                    with open(CONFIG_PATH, 'w') as f:
                        f.write(wg_conf)
                
                # StartOS expects the config back on success
                print(json.dumps(config_data))
                
            except Exception as e:
                print(f"Error setting config: {str(e)}", file=sys.stderr)
                sys.exit(1)
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)

if __name__ == "__main__":
    main()
