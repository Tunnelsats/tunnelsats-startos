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

class TestPackageVersion(unittest.TestCase):
    def setUp(self):
        bridge._package_version_cache = None

    def tearDown(self):
        bridge._package_version_cache = None

    def test_get_package_version_from_version_json(self):
        ver = bridge.get_package_version()
        self.assertEqual(ver, "0.4.0")

    def test_get_package_version_from_env(self):
        with unittest.mock.patch.dict(os.environ, {"PACKAGE_VERSION": "1.2.3:4"}):
            bridge._package_version_cache = None
            ver = bridge.get_package_version()
            self.assertEqual(ver, "1.2.3")
