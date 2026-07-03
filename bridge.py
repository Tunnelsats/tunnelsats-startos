#!/usr/bin/env python3
import sys
import re
import os
import json
import subprocess
import signal
import time
import socket
from datetime import datetime, timezone

wireproxy_process = None

DEFAULT_VPN_PORT = 9735
DATA_DIR = os.getenv("DATA_DIR", "/data")
CONFIG_PATH = os.path.join(DATA_DIR, "tunnelsatsv3.conf")
WIREPROXY_CONFIG_PATH = os.path.join(DATA_DIR, "wireproxy.conf")
APP_CONFIG_PATH = os.path.join(DATA_DIR, "config.json")
META_FILE_PATH = os.path.join(DATA_DIR, "tunnelsats-meta.json")
TUNNELSATS_API_URL = "https://tunnelsats.com/api/public/v1"

def parse_config_comments(config_content):
    meta = {}
    for line in config_content.splitlines():
        line = line.strip()
        if match := re.match(r"^#\s*Valid Until:\s*(.+)", line, re.IGNORECASE):
            meta["expiresAt"] = match.group(1).strip()
        elif match := re.match(r"^#\s*(?:VPNPort|Port Forwarding):\s*(\d+)", line, re.IGNORECASE):
            meta["vpnPort"] = int(match.group(1))
    return meta

def lazy_sync(wg_pubkey):
    if not wg_pubkey or wg_pubkey == "Unknown" or wg_pubkey == "Not available":
        return

    import urllib.request
    import urllib.error
    url = f"{TUNNELSATS_API_URL}/subscription/status"
    data = json.dumps({"wgPublicKey": wg_pubkey}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "tunnelsats-startos/0.2.0"
        },
        method="POST"
    )
    
    meta = {}
    try:
        # Load existing metadata if it exists
        if os.path.exists(META_FILE_PATH):
            try:
                with open(META_FILE_PATH, 'r') as f:
                    meta = json.load(f)
            except Exception:
                pass

        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                res_data = json.loads(response.read().decode("utf-8"))
                if isinstance(res_data, dict):
                    expiry = res_data.get("expiry")
                    if expiry:
                        meta["expiresAt"] = expiry
                    
                    server_domain = res_data.get("server_domain")
                    if server_domain:
                        meta["serverDomain"] = server_domain
                    
                    vpn_port = res_data.get("vpn_port")
                    if vpn_port:
                        meta["vpnPort"] = vpn_port

        # Fallback to comments parsing if config file exists and we don't have expiresAt
        if not meta.get("expiresAt") and os.path.exists(CONFIG_PATH):
            try:
                with open(CONFIG_PATH, 'r') as f:
                    config_content = f.read()
                parsed = parse_config_comments(config_content)
                if parsed.get("expiresAt"):
                    meta["expiresAt"] = parsed["expiresAt"]
            except Exception:
                pass

        # Write metadata back
        with open(META_FILE_PATH, 'w') as f:
            json.dump(meta, f, indent=2)
            
    except Exception as e:
        print(f"Error during lazy subscription sync: {e}", file=sys.stderr)
        
        # Fallback to comments parsing on error if file does not have expiry
        if not meta.get("expiresAt") and os.path.exists(CONFIG_PATH):
            try:
                with open(CONFIG_PATH, 'r') as f:
                    config_content = f.read()
                parsed = parse_config_comments(config_content)
                if parsed.get("expiresAt"):
                    meta["expiresAt"] = parsed["expiresAt"]
                    with open(META_FILE_PATH, 'w') as f:
                        json.dump(meta, f, indent=2)
            except Exception:
                pass

def format_subscription_expiry():
    if not os.path.exists(META_FILE_PATH):
        return "Unknown"
    
    try:
        with open(META_FILE_PATH, 'r') as f:
            meta = json.load(f)
        expires_at = meta.get("expiresAt")
        if not expires_at:
            return "Unknown"
            
        try:
            expiry_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if expiry_dt.tzinfo is None:
                expiry_dt = expiry_dt.replace(tzinfo=timezone.utc)
            
            now = datetime.now(timezone.utc)
            if expiry_dt < now:
                return f"Expired (on {expiry_dt.strftime('%Y-%m-%d')})"
                
            delta = expiry_dt - now
            days = delta.days
            hours = delta.seconds // 3600
            
            if days > 0:
                return f"Active (Expires in {days}d {hours}h)"
            else:
                minutes = (delta.seconds % 3600) // 60
                return f"Active (Expires in {hours}h {minutes}m)"
        except Exception:
            return f"Expires: {expires_at}"
    except Exception:
        pass
    return "Unknown"

def subscription_sync_loop():
    try:
        time.sleep(5)
    except KeyboardInterrupt:
        return
    while True:
        try:
            pubkey = "Unknown"
            if os.path.exists(CONFIG_PATH):
                with open(CONFIG_PATH, 'r') as f:
                    config_content = f.read()
                private_key_match = re.search(r'PrivateKey\s*=\s*(.+)', config_content, re.IGNORECASE)
                if private_key_match:
                    try:
                        proc = subprocess.run(["wg", "pubkey"], input=private_key_match.group(1).strip().encode(), capture_output=True)
                        pubkey = proc.stdout.decode().strip()
                    except Exception:
                        pass
            
            if pubkey and pubkey != "Unknown":
                lazy_sync(pubkey)
        except Exception as e:
            print(f"Error in subscription sync loop: {e}", file=sys.stderr)
        
        try:
            time.sleep(86400)
        except KeyboardInterrupt:
            break

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class DashboardHTTPRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_GET(self):
        if self.path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            
            status_data = get_status()
            
            pubkey = "Unknown"
            if os.path.exists(CONFIG_PATH):
                try:
                    with open(CONFIG_PATH, 'r') as f:
                        config_content = f.read()
                    private_key_match = re.search(r'PrivateKey\s*=\s*(.+)', config_content, re.IGNORECASE)
                    if private_key_match:
                        proc = subprocess.run(["wg", "pubkey"], input=private_key_match.group(1).strip().encode(), capture_output=True)
                        pubkey = proc.stdout.decode().strip()
                except Exception:
                    pass
            
            expiry = "Unknown"
            if os.path.exists(META_FILE_PATH):
                try:
                    with open(META_FILE_PATH, 'r') as f:
                        meta = json.load(f)
                        expiry = meta.get("expiresAt", "Unknown")
                except Exception:
                    pass
                    
            target_host, target_port = get_target_details()
            
            vpn_port = DEFAULT_VPN_PORT
            public_ip = "Unknown"
            if os.path.exists(CONFIG_PATH):
                try:
                    with open(CONFIG_PATH, 'r') as f:
                        config_content = f.read()
                    vpn_port = extract_vpn_port(config_content)
                    endpoint_match = re.search(r'Endpoint\s*=\s*([^:\s]+):\d+', config_content, re.IGNORECASE)
                    public_ip = endpoint_match.group(1) if endpoint_match else "Unknown"
                except Exception:
                    pass

            wg_ip = get_wg_ip()
            internal_octet = wg_ip.split('.')[-1] if wg_ip else "Unknown"

            response = {
                "enabled": is_enabled(),
                "status": status_data["status"],
                "vpn_connected": status_data["vpn_connected"],
                "handshake": status_data["handshake"],
                "pubkey": pubkey,
                "expires_at": expiry,
                "target_host": target_host,
                "target_port": target_port,
                "vpn_port": vpn_port,
                "public_ip": public_ip,
                "socks5_port": 1080,
                "internal_octet": internal_octet
            }
            self.wfile.write(json.dumps(response).encode("utf-8"))
            return

        web_dir = os.path.join(os.path.dirname(__file__), "web")
        target_path = self.path.lstrip("/")
        if not target_path or target_path == "":
            target_path = "index.html"
            
        safe_path = os.path.abspath(os.path.join(web_dir, target_path))
        if not safe_path.startswith(os.path.abspath(web_dir)):
            self.send_error(403, "Access denied")
            return

        if os.path.exists(safe_path) and os.path.isfile(safe_path):
            self.send_response(200)
            if safe_path.endswith(".html"):
                self.send_header("Content-Type", "text/html")
            elif safe_path.endswith(".css"):
                self.send_header("Content-Type", "text/css")
            elif safe_path.endswith(".js"):
                self.send_header("Content-Type", "application/javascript")
            elif safe_path.endswith(".svg"):
                self.send_header("Content-Type", "image/svg+xml")
            elif safe_path.endswith(".png"):
                self.send_header("Content-Type", "image/png")
            else:
                self.send_header("Content-Type", "application/octet-stream")
            self.end_headers()
            
            with open(safe_path, "rb") as f:
                self.wfile.write(f.read())
        else:
            self.send_error(404, "File not found")

def web_server_thread():
    try:
        server = ThreadingHTTPServer(("0.0.0.0", 80), DashboardHTTPRequestHandler)
        print("Web UI Dashboard server running on port 80...")
        server.serve_forever()
    except Exception as e:
        print(f"Failed to start web server on port 80: {e}", file=sys.stderr)

def is_enabled():
    try:
        if os.path.exists(APP_CONFIG_PATH):
            with open(APP_CONFIG_PATH, 'r') as f:
                config_data = json.load(f)
                return config_data.get("enabled", False)
    except Exception as e:
        print(f"Error checking enabled status: {e}", file=sys.stderr)
    return False

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


def generate_wireproxy_config():
    try:
        with open(CONFIG_PATH, 'r') as f:
            wg_config = f.read()
            
        vpn_port = extract_vpn_port(wg_config)
        target_host, target_port = get_target_details()
        
        extra_config = f"""
[Socks5]
BindAddress = 0.0.0.0:1080

[TCPServerTunnel]
ListenPort = {vpn_port}
Target = {target_host}:{target_port}
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
            match = re.search(r'^\s*(?!#|;)\s*Address\s*=\s*([0-9\.]+)', config_content, re.IGNORECASE | re.MULTILINE)
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
        
    cmd = ["/usr/local/bin/wireproxy", "-c", WIREPROXY_CONFIG_PATH, "-i", "127.0.0.1:8080"]
    wireproxy_process = subprocess.Popen(
        cmd,
        text=True
    )
    # Give wireproxy a brief moment to initialize and check if it crashed immediately
    time.sleep(1)
    if wireproxy_process.poll() is not None:
        raise RuntimeError("wireproxy failed to start or crashed immediately after spawning")
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
        # Check wireproxy metrics locally without making WAN traffic
        import urllib.request
        req = urllib.request.Request("http://127.0.0.1:8080/metrics")
        with urllib.request.urlopen(req, timeout=3) as response:
            content = response.read().decode('utf-8')
        if content:
            for line in content.splitlines():
                if "last_handshake_time_sec=" in line:
                    parts = line.strip().split("=")
                    if len(parts) >= 2:
                        try:
                            val = float(parts[1])
                            if val > 0 and (time.time() - val) < 300:
                                return {
                                    "status": "running",
                                    "vpn_connected": True,
                                    "handshake": "active"
                                }
                        except ValueError:
                            pass
    except Exception as e:
        print(f"Health check metrics query error: {e}", file=sys.stderr)
        
    # Fallback to checking SOCKS5 port availability if HTTP /metrics fails
    try:
        with socket.create_connection(("127.0.0.1", 1080), timeout=2):
            return {
                "status": "running",
                "vpn_connected": False,
                "handshake": "none"
            }
    except OSError:
        pass
        
    return {
        "status": "stopped",
        "vpn_connected": False,
        "handshake": "none"
    }

def validate_config(wg_conf):
    if not wg_conf:
        return
    if not re.search(r'^\s*(?!#|;)\s*PrivateKey\s*=', wg_conf, re.IGNORECASE | re.MULTILINE):
        raise ValueError("Missing 'PrivateKey' property.")
    if not re.search(r'^\s*(?!#|;)\s*Address\s*=', wg_conf, re.IGNORECASE | re.MULTILINE):
        raise ValueError("Missing 'Address' property.")
    if not re.search(r'^\s*(?!#|;)\s*Endpoint\s*=', wg_conf, re.IGNORECASE | re.MULTILINE):
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
                },
                "Subscription Expiry": {
                    "type": "string",
                    "value": format_subscription_expiry(),
                    "description": "Remaining validity of your TunnelSats subscription.",
                    "copyable": False
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
            import threading
            sync_thread = threading.Thread(target=subscription_sync_loop, daemon=True)
            sync_thread.start()

            web_thread = threading.Thread(target=web_server_thread, daemon=True)
            web_thread.start()

            if not is_enabled():
                print("TunnelSats is disabled. Staying idle...", file=sys.stderr)
                while True:
                    time.sleep(1)
            if not os.path.exists(CONFIG_PATH):
                print(f"WireGuard config not found at {CONFIG_PATH}. Waiting for user setup...", file=sys.stderr)
                while not os.path.exists(CONFIG_PATH):
                    time.sleep(5)
            vpn_up(CONFIG_PATH)
            print("VPN Started Successfully")
            
            if not proxy_up():
                print("Failed to initialize outbound privacy engine. Aborting.", file=sys.stderr)
                sys.exit(1)
                
            inbound_up()
            
            # Stay alive and monitor the wireproxy process
            while True:
                if wireproxy_process and wireproxy_process.poll() is not None:
                    print("wireproxy process exited unexpectedly.", file=sys.stderr)
                    sys.exit(1)
                time.sleep(1)
        except Exception as e:
            stderr = getattr(e, 'stderr', str(e))
            print(f"Failed to start services: {stderr}", file=sys.stderr)
            sys.exit(1)
            
    elif command == "stop":
        try:
            vpn_down(CONFIG_PATH)
            print("VPN Stopped Successfully")
        except Exception as e:
            stderr = getattr(e, 'stderr', str(e))
            print(f"Failed to stop VPN: {stderr}", file=sys.stderr)
            sys.exit(1)
            
    elif command == "status":
        print(json.dumps(get_status(), indent=2))
        
    elif command == "health":
        target = sys.argv[2] if len(sys.argv) > 2 else "vpn"
        
        if not is_enabled():
            print(json.dumps({"result": "ok"}))
            sys.exit(0)
            
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
                "enabled": {
                    "type": "boolean",
                    "name": "Enable TunnelSats",
                    "description": "Turn the TunnelSats VPN tunnel On or Off.",
                    "nullable": True,
                    "default": False,
                    "depends-on": {}
                },
                "target-node": {
                    "type": "enum",
                    "name": "Target Lightning Node",
                    "description": "Select which Lightning service on your StartOS server will receive inbound connections.",
                    "values": ["lnd", "cln"],
                    "value-names": {
                        "lnd": "LND (lnd.embassy)",
                        "cln": "Core Lightning (c-lightning.embassy)"
                    },
                    "default": "lnd",
                    "depends-on": {}
                },
                "tunnelsats-conf": {
                    "type": "string",
                    "name": "WireGuard Configuration",
                    "description": "Paste the content of your TunnelSats .conf file here. Ensure it includes the '# VPNPort: XXXXX' metadata comment for automatic port-forwarding.",
                    "nullable": True,
                    "default": None,
                    "placeholder": "[Interface]\nPrivateKey = <your_private_key>\nAddress = 10.x.x.x/32\n# VPNPort: 12345\n...\n",
                    "textarea": True,
                    "copyable": True,
                    "masked": False,
                    "depends-on": {}
                }
            }
            
            # StartOS calls this to populate the UI
            if os.path.exists(APP_CONFIG_PATH):
                with open(APP_CONFIG_PATH, 'r') as f:
                    config_data = json.load(f)
            else:
                config_data = {
                    "enabled": False,
                    "target-node": "lnd",
                    "tunnelsats-conf": ""
                }
                
            print(json.dumps({
                "config": config_data,
                "spec": spec,
                "depends-on": {}
            }))
                
        elif subcommand == "set":
            # StartOS passes the UI values via stdin
            try:
                raw_input = json.load(sys.stdin)
                
                # Handle both wrapped and unwrapped (for tests) formats
                if isinstance(raw_input, dict) and "config" in raw_input:
                    config_data = raw_input.get("config", {})
                    depends_on = raw_input.get("depends-on", {})
                else:
                    config_data = raw_input
                    depends_on = {}
                
                enabled = config_data.get("enabled", False)
                wg_conf = config_data.get("tunnelsats-conf") or ""
                
                if enabled or wg_conf:
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
                elif os.path.exists(CONFIG_PATH):
                    try:
                        os.remove(CONFIG_PATH)
                    except Exception:
                        pass
                
                # StartOS always expects the wrapped format with top-level depends-on
                print(json.dumps({
                    "config": config_data,
                    "depends-on": {}
                }))
                    
            except Exception as e:
                print(f"Error setting config: {str(e)}", file=sys.stderr)
                sys.exit(1)
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)

if __name__ == "__main__":
    main()
