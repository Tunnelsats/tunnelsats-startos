import unittest
import os
import sys

# Add the parent directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import bridge

class TestBridgeConfig(unittest.TestCase):
    def test_extract_vpn_port_found(self):
        config_content = """
[Interface]
PrivateKey = key
# VPNPort: 12345
Address = 10.0.0.1/32
"""
        port = bridge.extract_vpn_port(config_content)
        self.assertEqual(port, 12345)

    def test_extract_vpn_port_missing_defaults(self):
        config_content = """
[Interface]
PrivateKey = key
Address = 10.0.0.1/32
"""
        port = bridge.extract_vpn_port(config_content)
        self.assertEqual(port, 9735) # Default as per implementation plan

    def test_extract_vpn_port_invalid_defaults(self):
        config_content = """
# VPNPort: abc
"""
        port = bridge.extract_vpn_port(config_content)
        self.assertEqual(port, 9735)

if __name__ == '__main__':
    unittest.main()
