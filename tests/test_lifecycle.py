import unittest
import os
import sys
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import bridge

class TestBridgeLifecycle(unittest.TestCase):
    @patch('subprocess.run')
    def test_start_vpn_calls_wg_quick(self, mock_run):
        # Mock successful execution
        mock_run.return_value = MagicMock(returncode=0)
        
        bridge.vpn_up("/data/tunnelsats.conf")
        
        # Verify it calls wg-quick up
        mock_run.assert_called_with(
            ["wg-quick", "up", "/data/tunnelsats.conf"],
            check=True,
            capture_output=True,
            text=True
        )

    @patch('subprocess.run')
    def test_stop_vpn_calls_wg_quick(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0)
        
        bridge.vpn_down("/data/tunnelsats.conf")
        
        mock_run.assert_called_with(
            ["wg-quick", "down", "/data/tunnelsats.conf"],
            check=True,
            capture_output=True,
            text=True
        )

    @patch('subprocess.run')
    def test_get_wg_ip_success(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="inet 10.9.9.9/32 scope global wg0\n")
        ip = bridge.get_wg_ip()
        self.assertEqual(ip, "10.9.9.9")

    @patch('subprocess.run')
    def test_get_wg_ip_failure(self, mock_run):
        import subprocess
        mock_run.side_effect = subprocess.CalledProcessError(1, "cmd")
        ip = bridge.get_wg_ip()
        self.assertIsNone(ip)

    @patch('subprocess.Popen')
    @patch('subprocess.run')
    @patch('bridge.get_wg_ip')
    def test_proxy_up_success(self, mock_get_ip, mock_run, mock_popen):
        mock_get_ip.return_value = "10.9.9.9"
        mock_run.return_value = MagicMock(returncode=0)
        mock_popen.return_value = MagicMock()

        result = bridge.proxy_up()
        
        self.assertTrue(result)
        mock_run.assert_called_with(
            ["iptables", "-I", "OUTPUT", "1", "-m", "owner", "--uid-owner", "proxy_user", "!", "-o", "wg0", "-j", "REJECT"],
            check=True
        )
        mock_popen.assert_called_with(
            ["su-exec", "proxy_user", "/usr/local/bin/microsocks", "-i", "0.0.0.0", "-p", "1080", "-b", "10.9.9.9"]
        )

    @patch('bridge.get_wg_ip')
    def test_proxy_up_fails_without_ip(self, mock_get_ip):
        mock_get_ip.return_value = None
        result = bridge.proxy_up()
        self.assertFalse(result)

    @patch('subprocess.run')
    def test_proxy_down_teardown(self, mock_run):
        mock_proc = MagicMock()
        bridge.proxy_process = mock_proc
        bridge.proxy_down()
        
        mock_proc.terminate.assert_called_once()
        mock_proc.wait.assert_called_with(timeout=5)
        self.assertIsNone(bridge.proxy_process)
        mock_run.assert_called_with(
            ["iptables", "-D", "OUTPUT", "-m", "owner", "--uid-owner", "proxy_user", "!", "-o", "wg0", "-j", "REJECT"],
            check=False
        )

if __name__ == '__main__':
    unittest.main()
