#!/usr/bin/env python3
import sys
import re
import os
import json
import subprocess

DEFAULT_VPN_PORT = 9735
DATA_DIR = "/data"
CONFIG_PATH = os.path.join(DATA_DIR, "tunnelsats.conf")
APP_CONFIG_PATH = os.path.join(DATA_DIR, "config.json")

def extract_vpn_port(config_content):
    try:
        match = re.search(r'#\s*VPNPort:\s*(\d+)', config_content, re.IGNORECASE)
        if match:
            return int(match.group(1))
    except (ValueError, IndexError):
        pass
    return DEFAULT_VPN_PORT

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
            ["wg", "show", "wg0"],
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
        try:
            vpn_up(CONFIG_PATH)
            print("VPN Started Successfully")
            # Stay alive
            subprocess.run(["tail", "-f", "/dev/null"])
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            stderr = getattr(e, 'stderr', str(e))
            print(f"Failed to start VPN: {stderr}", file=sys.stderr)
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
        status = get_status()
        if status["vpn_connected"]:
            print(json.dumps({"result": "ok"}))
        else:
            print(json.dumps({"result": "VPN is not connected"}))
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
