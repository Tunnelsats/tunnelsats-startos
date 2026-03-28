import unittest
import os
import sys
import json
import subprocess
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import bridge

class TestBridgeStatus(unittest.TestCase):
    @patch('subprocess.run')
    def test_status_connected(self, mock_run):
        # Mock wg show output for a connected state
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="""interface: wg0
  public key: key123
  private key: (hidden)
  listening port: 51820

peer: key456
  endpoint: 1.2.3.4:51820
  allowed ips: 0.0.0.0/0
  latest handshake: 10 seconds ago
  transfer: 1.2 KiB received, 3.4 KiB sent
""",
            stderr=""
        )
        
        status = bridge.get_status()
        self.assertEqual(status["status"], "running")
        self.assertTrue(status["vpn_connected"])
        self.assertEqual(status["handshake"], "10 seconds ago")

    @patch('subprocess.run')
    def test_status_disconnected(self, mock_run):
        # Mock wg show output for an interface that doesn't exist
        mock_run.side_effect = subprocess.CalledProcessError(1, "wg show", stderr="Device not found")
        
        status = bridge.get_status()
        self.assertEqual(status["status"], "stopped")
        self.assertFalse(status["vpn_connected"])

if __name__ == '__main__':
    unittest.main()
