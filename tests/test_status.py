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
        # First call (pgrep) returns 0 (running), second call (curl) returns 0 (connected)
        mock_run.side_effect = [MagicMock(returncode=0), MagicMock(returncode=0)]
        
        status = bridge.get_status()
        self.assertEqual(status["status"], "running")
        self.assertTrue(status["vpn_connected"])
        self.assertEqual(status["handshake"], "active")

    @patch('subprocess.run')
    def test_status_disconnected(self, mock_run):
        # First call (pgrep) returns 0 (running), second call (curl) returns 1 (disconnected)
        mock_run.side_effect = [MagicMock(returncode=0), MagicMock(returncode=1)]
        
        status = bridge.get_status()
        self.assertEqual(status["status"], "running")
        self.assertFalse(status["vpn_connected"])
        self.assertEqual(status["handshake"], "none")

    @patch('subprocess.run')
    def test_status_stopped(self, mock_run):
        # First call (pgrep) returns 1 (not running)
        mock_run.return_value = MagicMock(returncode=1)
        
        status = bridge.get_status()
        self.assertEqual(status["status"], "stopped")
        self.assertFalse(status["vpn_connected"])
        self.assertEqual(status["handshake"], "none")

if __name__ == '__main__':
    unittest.main()
