import json
import subprocess
import os
import sys

# Simulate the inner spec only
spec = {
    "target-node": {
        "type": "enum",
        "name": "Target Lightning Node",
        "description": "Select which Lightning service on your StartOS server will receive inbound connections.",
        "values": ["lnd", "cln"],
        "valueNames": {
            "lnd": "LND (lnd.embassy)",
            "cln": "Core Lightning (c-lightning.embassy)"
        },
        "default": "lnd",
        "depends-on": {}, # Testing this
        "help-md": None,
        "warning": None
    },
    "tunnelsats-conf": {
        "type": "string",
        "display-as": "textarea",
        "name": "WireGuard Configuration",
        "description": "Paste the content of your TunnelSats .conf file here.",
        "nullable": False,
        "placeholder": "[Interface]...",
        "depends-on": {}, # Testing this
        "pattern": ".*",
        "pattern-description": "Invalid config.",
        "help-md": None,
        "warning": None
    }
}

with open("test_spec.json", "w") as f:
    json.dump(spec, f, indent=4)

print("Running start-sdk verify config-spec test_spec.json...")
result = subprocess.run(["start-sdk", "verify", "config-spec", "test_spec.json"], capture_output=True, text=True)

print("STDOUT:", result.stdout)
print("STDERR:", result.stderr)

if result.returncode == 0:
    print("\n[SUCCESS] Spec is valid!")
else:
    print("\n[FAIL] Spec is invalid!")
