import unittest
import os
import sys
from unittest.mock import patch, MagicMock
from io import BytesIO

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import bridge

class TestBridgeStatus(unittest.TestCase):
    @patch('socket.create_connection')
    @patch('urllib.request.urlopen')
    @patch('subprocess.run')
    def test_status_connected(self, mock_run, mock_urlopen, mock_socket):
        # pgrep returns 0 (running)
        mock_run.return_value = MagicMock(returncode=0)
        # urllib returns metrics with active handshake
        mock_response = MagicMock()
        mock_response.read.return_value = b"last_handshake_time_sec=1629837493\n"
        mock_response.__enter__ = lambda s: s
        mock_response.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_response

        status = bridge.get_status()
        self.assertEqual(status["status"], "running")
        self.assertTrue(status["vpn_connected"])
        self.assertEqual(status["handshake"], "active")

    @patch('socket.create_connection')
    @patch('urllib.request.urlopen')
    @patch('subprocess.run')
    def test_status_disconnected(self, mock_run, mock_urlopen, mock_socket):
        # pgrep returns 0 (running), urllib raises (metrics unavailable)
        mock_run.return_value = MagicMock(returncode=0)
        mock_urlopen.side_effect = Exception("Connection refused")
        mock_socket.side_effect = OSError("Connection refused")

        status = bridge.get_status()
        self.assertEqual(status["status"], "running")
        self.assertFalse(status["vpn_connected"])
        self.assertEqual(status["handshake"], "none")

    @patch('subprocess.run')
    def test_status_stopped(self, mock_run):
        # pgrep returns 1 (not running)
        mock_run.return_value = MagicMock(returncode=1)

        status = bridge.get_status()
        self.assertEqual(status["status"], "stopped")
        self.assertFalse(status["vpn_connected"])
        self.assertEqual(status["handshake"], "none")

if __name__ == '__main__':
    unittest.main()
