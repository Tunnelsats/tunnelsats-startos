#!/usr/bin/env python3
import json
import subprocess
import os
import sys

def run_command(cmd, input_str=None):
    try:
        result = subprocess.run(
            cmd,
            input=input_str,
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"Error running command: {cmd}\nStderr: {e.stderr}", file=sys.stderr)
        raise

def main():
    bridge_path = "./bridge.py"
    sdk_verify_bin = "/home/hakuna/.cargo/bin/start-sdk"

    print("Phase 1: Validating 'config get' Schema with StartOS SDK...")
    try:
        # 1. Fetch JSON from bridge.py
        get_output = run_command(["python3", bridge_path, "config", "get"])
        payload = json.loads(get_output)
        
        # 2. Extract only the 'spec' part as required by the SDK verify tool
        spec_dict = payload['spec']
        for field in spec_dict:
            # We now require depends-on to be a dictionary {} or list [] for strictness
            if "depends-on" not in spec_dict[field]:
                print(f"[FAIL] Missing 'depends-on' field in spec for {field}")
                sys.exit(1)
            
            if not isinstance(spec_dict[field]["depends-on"], (dict, list)):
                print(f"[FAIL] 'depends-on' is not a dictionary or list in spec for {field}")
                sys.exit(1)

        spec_json = json.dumps(spec_dict)
        spec_path = "/tmp/test_spec.json"
        with open(spec_path, 'w') as f:
            f.write(spec_json)

        # 3. Use official SDK validator
        run_command([sdk_verify_bin, "verify", "config-spec", spec_path])
        print("[OK] JSON Schema is compliant with StartOS 0.3.5.x")

    except Exception as e:
        print(f"[FAIL] Schema Validation Failure: {e}")
        sys.exit(1)

    print("\nPhase 2: Testing 'config set' Validation Logic...")
    
    # Define test cases for config set validation
    test_cases = [
        {
            "name": "Valid Config (Standard)",
            "config": {
                "target-node": "lnd",
                "tunnelsats-conf": "[Interface]\nPrivateKey = pk1\nAddress = 10.0.0.1/32\n# VPNPort: 12345\n[Peer]\nEndpoint = 1.1.1.1:51820"
            },
            "should_pass": True
        },
        {
            "name": "Valid Config (Alternative Port Tag)",
            "config": {
                "target-node": "cln",
                "tunnelsats-conf": "[Interface]\nPrivateKey = pk2\nAddress = 10.0.0.2/32\n# Port Forwarding: 54321\n[Peer]\nEndpoint = 2.2.2.2:51820"
            },
            "should_pass": True
        },
        {
            "name": "Invalid Config (Missing Port Tag)",
            "config": {
                "target-node": "lnd",
                "tunnelsats-conf": "[Interface]\nPrivateKey = pk3\nAddress = 10.0.0.3/32\n[Peer]\nEndpoint = 3.3.3.3:51820"
            },
            "should_pass": False
        },
        {
            "name": "Invalid Config (Missing PrivateKey)",
            "config": {
                "target-node": "lnd",
                "tunnelsats-conf": "[Interface]\nAddress = 10.0.0.4/32\n# VPNPort: 11111\n[Peer]\nEndpoint = 4.4.4.4:51820"
            },
            "should_pass": False
        }
    ]

    # Pre-setup mock data dir
    os.makedirs("/tmp/data", exist_ok=True)
    os.environ["DATA_DIR"] = "/tmp/data" # Ensure bridge.py uses /tmp/data for tests

    for tc in test_cases:
        print(f"Testing Case: {tc['name']}...", end=" ")
        input_json = json.dumps({"config": tc['config'], "depends-on": {}})
        try:
            cmd = ["python3", bridge_path, "config", "set"]
            output = run_command(cmd, input_str=input_json)
            # Verify response includes depends-on
            resp = json.loads(output)
            assert "depends-on" in resp, f"Response missing 'depends-on': {resp}"
            if tc['should_pass']:
                print("[OK] Passed as expected")
            else:
                print("[FAIL] Accepted invalid config!")
                sys.exit(1)
        except subprocess.CalledProcessError:
            if not tc['should_pass']:
                print("[OK] Rejected as expected")
            else:
                print("[FAIL] Rejected valid config!")
                sys.exit(1)

    print("\nAll Tests Passed Successfully! Deployment is safe.")

if __name__ == "__main__":
    main()
