#!/usr/bin/env python3
import sys
import re
import os
import json
import subprocess
import signal
import time
import socket

wireproxy_process = None

DEFAULT_VPN_PORT = 9735
DATA_DIR = os.getenv("DATA_DIR", "/data")
CONFIG_PATH = os.path.join(DATA_DIR, "tunnelsatsv3.conf")
WIREPROXY_CONFIG_PATH = os.path.join(DATA_DIR, "wireproxy.conf")
APP_CONFIG_PATH = os.path.join(DATA_DIR, "config.json")

def extract_vpn_port(config_content):
    try:
        # Match either "# VPNPort: 12345" or "# Port Forwarding: 12345"
        match = re.search(r'#\s*(?:VPNPort|Port Forwarding):\s*(\d+)', config_content, re.IGNORECASE)
        if match:
            return int(match.group(1))
    except (ValueError, IndexError):
        pass
    return DEFAULT_VPN_PORT

def get_target_details():
    """
    Returns (target_host, target_port) based on the target node config.
    """
    target = "lnd"
    try:
        if os.path.exists(APP_CONFIG_PATH):
            with open(APP_CONFIG_PATH, 'r') as f:
                config_data = json.load(f)
                target = config_data.get("target-node", "lnd")
    except Exception as e:
        print(f"Error reading target node from config: {e}", file=sys.stderr)

    # Map to StartOS service ID and default port
    if target in ("cln", "c-lightning"):
        hostname = "c-lightning.embassy"
    else:
        hostname = "lnd.embassy"
    return hostname, 9735

def get_target_ip():
    host, _ = get_target_details()
    try:
        return socket.gethostbyname(host)
    except Exception:
        return None

def generate_wireproxy_config():
    try:
        with open(CONFIG_PATH, 'r') as f:
            wg_config = f.read()
            
        vpn_port = extract_vpn_port(wg_config)
        target_host, target_port = get_target_details()
        target_ip = get_target_ip() or target_host
        
        extra_config = f"""
[Socks5]
BindAddress = 0.0.0.0:1080

[TCPServerTunnel]
ListenPort = {vpn_port}
Target = {target_ip}:{target_port}
"""
        with open(WIREPROXY_CONFIG_PATH, 'w') as f:
            f.write(wg_config + "\n" + extra_config)
        print("Generated wireproxy config successfully.")
        return True
    except Exception as e:
        print(f"Failed to generate wireproxy config: {e}", file=sys.stderr)
        return False

def inbound_up():
    print("Inbound forwarding handled natively by wireproxy userspace tunnel.")
    return True

def inbound_down():
    print("Inbound forwarding stopped natively by wireproxy.")
    return True

def get_wg_ip():
    try:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, 'r') as f:
                config_content = f.read()
            match = re.search(r'Address\s*=\s*([0-9\.]+)', config_content, re.IGNORECASE)
            if match:
                return match.group(1)
    except Exception as e:
        print(f"Error parsing WG IP: {e}", file=sys.stderr)
    return None

def proxy_up():
    print("Outbound proxy handled natively by wireproxy.")
    return True

def proxy_down():
    print("Outbound proxy stopped natively by wireproxy.")

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
    global wireproxy_process
    # Generate wireproxy config first
    if not generate_wireproxy_config():
        raise RuntimeError("Failed to generate wireproxy config")
        
    cmd = ["/usr/local/bin/wireproxy", "-c", WIREPROXY_CONFIG_PATH]
    wireproxy_process = subprocess.Popen(
        cmd,
        text=True
    )
    print("wireproxy started successfully.")

def vpn_down(config_path):
    global wireproxy_process
    if wireproxy_process:
        wireproxy_process.terminate()
        try:
            wireproxy_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            wireproxy_process.kill()
        wireproxy_process = None
        print("wireproxy stopped.")

def is_wireproxy_running():
    try:
        proc = subprocess.run(["pgrep", "wireproxy"], capture_output=True)
        return proc.returncode == 0
    except Exception:
        return False

def get_status():
    if not is_wireproxy_running():
        return {
            "status": "stopped",
            "vpn_connected": False,
            "handshake": "none"
        }
        
    try:
        # Connect to 1.1.1.1:80 via SOCKS5 proxy to test the tunnel
        proc = subprocess.run(
            ["curl", "-s", "--socks5-hostname", "127.0.0.1:1080", "--connect-timeout", "3", "-I", "http://1.1.1.1"],
            capture_output=True
        )
        if proc.returncode == 0:
            return {
                "status": "running",
                "vpn_connected": True,
                "handshake": "active"
            }
    except Exception as e:
        print(f"Health check connectivity error: {e}", file=sys.stderr)
        
    return {
        "status": "running",
        "vpn_connected": False,
        "handshake": "none"
    }

def validate_config(wg_conf):
    if not wg_conf:
        return
    if not re.search(r'PrivateKey\s*=', wg_conf, re.IGNORECASE):
        raise ValueError("Missing 'PrivateKey' property.")
    if not re.search(r'Address\s*=', wg_conf, re.IGNORECASE):
        raise ValueError("Missing 'Address' property.")
    if not re.search(r'Endpoint\s*=', wg_conf, re.IGNORECASE):
        raise ValueError("Missing 'Endpoint' routing property.")
    if not re.search(r'#\s*(?:VPNPort|Port Forwarding):\s*\d+', wg_conf, re.IGNORECASE):
        raise ValueError("Missing port-forwarding metadata (e.g., # Port Forwarding: XXXXX).")

def get_properties():
    try:
        with open(CONFIG_PATH, 'r') as f:
            config_content = f.read()
            
        vpn_port = extract_vpn_port(config_content)
        
        endpoint_match = re.search(r'Endpoint\s*=\s*([^:\s]+):\d+', config_content, re.IGNORECASE)
        public_ip = endpoint_match.group(1) if endpoint_match else "Unknown"
        
        private_key_match = re.search(r'PrivateKey\s*=\s*(.+)', config_content, re.IGNORECASE)
        pubkey = "Unknown"
        if private_key_match:
            try:
                proc = subprocess.run(["wg", "pubkey"], input=private_key_match.group(1).strip().encode(), capture_output=True)
                pubkey = proc.stdout.decode().strip()
            except Exception:
                pass
                
        wg_ip = get_wg_ip()
        internal_octet = wg_ip.split('.')[-1] if wg_ip else "Unknown"
        
        properties = {
            "version": 2,
            "data": {
                "WireGuard Public Key": {
                    "type": "string",
                    "value": pubkey,
                    "description": "Used to link this StartOS node to your tunnelsats.com dashboard.",
                    "copyable": True
                },
                "Internal IP (Last Octet)": {
                    "type": "string",
                    "value": internal_octet,
                    "description": "Provide this 3-digit octet on the dashboard to confirm your identity.",
                    "copyable": True
                },
                "TunnelSats Public IP": {
                    "type": "string",
                    "value": public_ip,
                    "description": "Your designated external IPv4 address for Clearnet routing.",
                    "copyable": True
                },
                "Forwarding Port": {
                    "type": "string",
                    "value": str(vpn_port),
                    "description": "Your assigned port for inbound Lightning connections.",
                    "copyable": True
                }
            }
        }
        
    except FileNotFoundError:
        properties = {
            "version": 2,
            "data": {
                "Service Status": {
                    "type": "string",
                    "value": "Unconfigured",
                    "description": "Configure your TunnelSats config in the settings to display connection properties."
                }
            }
        }
    print(json.dumps(properties))

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


    elif command == "properties":
        get_properties()
        
    elif command == "config":
        subcommand = sys.argv[2] if len(sys.argv) > 2 else None
        
        if subcommand == "get":
            # The UI requires the 'spec' metadata exactly as defined in config_spec.yaml
            spec = {
                "target-node": {
                    "type": "enum",
                    "name": "Target Lightning Node",
                    "description": "Select which Lightning service on your StartOS server will receive inbound connections.",
                    "values": ["lnd", "cln"],
                    "value-names": {
                        "lnd": "LND (lnd.embassy)",
                        "cln": "Core Lightning (c-lightning.embassy)"
                    },
                    "default": "lnd"
                },
                "tunnelsats-conf": {
                    "type": "string",
                    "name": "WireGuard Configuration",
                    "description": "Paste the content of your TunnelSats .conf file here. Ensure it includes the '# VPNPort: XXXXX' metadata comment for automatic port-forwarding.",
                    "nullable": False,
                    "default": None,
                    "placeholder": "[Interface]\nPrivateKey = <your_private_key>\nAddress = 10.x.x.x/32\n# VPNPort: 12345\n...\n",
                    "pattern": ".*",
                    "pattern-description": "Please paste a valid WireGuard configuration.",
                    "textarea": True,
                    "copyable": True,
                    "masked": False
                }
            }
            
            # StartOS calls this to populate the UI
            if os.path.exists(APP_CONFIG_PATH):
                with open(APP_CONFIG_PATH, 'r') as f:
                    config_data = json.load(f)
            else:
                config_data = {
                    "target-node": "lnd",
                    "tunnelsats-conf": ""
                }
                
            print(json.dumps({
                "config": config_data,
                "spec": spec
            }))
                
        elif subcommand == "set":
            # StartOS passes the UI values via stdin
            try:
                config_data = json.load(sys.stdin)
                
                # Validation checking malformed fields
                wg_conf = config_data.get("tunnelsats-conf", "")
                try:
                    validate_config(wg_conf)
                except ValueError as ve:
                    print(f"Invalid WireGuard Configuration: {str(ve)}", file=sys.stderr)
                    sys.exit(1)
                
                # 1. Save the JSON config for future "get" calls
                with open(APP_CONFIG_PATH, 'w') as f:
                    json.dump(config_data, f, indent=2)
                
                # 2. Extract the .conf blob and write it to the WireGuard path
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
