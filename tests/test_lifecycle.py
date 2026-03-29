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
        
        bridge.vpn_up("/data/tunnelsatsv3.conf")
        
        # Verify it calls wg-quick up
        mock_run.assert_called_with(
            ["wg-quick", "up", "/data/tunnelsatsv3.conf"],
            check=True,
            capture_output=True,
            text=True
        )

    @patch('subprocess.run')
    def test_stop_vpn_calls_wg_quick(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0)
        
        bridge.vpn_down("/data/tunnelsatsv3.conf")
        
        mock_run.assert_called_with(
            ["wg-quick", "down", "/data/tunnelsatsv3.conf"],
            check=True,
            capture_output=True,
            text=True
        )

    @patch('subprocess.run')
    def test_get_wg_ip_success(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="inet 10.9.9.9/32 scope global tunnelsatsv3\n")
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
            ["iptables", "-I", "OUTPUT", "1", "-m", "owner", "--uid-owner", "proxy_user", "!", "-o", "tunnelsatsv3", "-j", "REJECT"],
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
            ["iptables", "-D", "OUTPUT", "-m", "owner", "--uid-owner", "proxy_user", "!", "-o", "tunnelsatsv3", "-j", "REJECT"],
            check=False
        )


    def test_extract_vpn_port_success(self):
        config = "[Interface]\n# VPNPort: 12345\nPrivateKey=..."
        port = bridge.extract_vpn_port(config)
        self.assertEqual(port, 12345)
        
    def test_extract_vpn_port_fallback(self):
        config = "[Interface]\nPrivateKey=..."
        port = bridge.extract_vpn_port(config)
        self.assertEqual(port, 9735)

    @patch('os.path.exists')
    @patch('builtins.open', new_callable=unittest.mock.mock_open, read_data='{"target-node": "cln"}')
    @patch('socket.gethostbyname')
    def test_get_target_ip_success(self, mock_socket, mock_open, mock_exists):
        mock_exists.return_value = True
        mock_socket.return_value = "10.0.0.5"
        
        ip = bridge.get_target_ip()
        
        mock_socket.assert_called_with("cln.embassy")
        self.assertEqual(ip, "10.0.0.5")

    @patch('bridge.get_target_ip')
    @patch('builtins.open', new_callable=unittest.mock.mock_open, read_data='# VPNPort: 54321')
    @patch('subprocess.run')
    def test_inbound_up_success(self, mock_run, mock_open, mock_get_target):
        mock_get_target.return_value = "10.0.0.10"
        
        result = bridge.inbound_up()
        
        self.assertTrue(result)
        # Should be called 4 times for the 4 iptables rules
        self.assertEqual(mock_run.call_count, 4)
        mock_run.assert_any_call(["iptables", "-t", "nat", "-A", "PREROUTING", "-i", "tunnelsatsv3", "-p", "tcp", "--dport", "54321", "-j", "DNAT", "--to-destination", "10.0.0.10:9735"], check=True)
        mock_run.assert_any_call(["iptables", "-t", "nat", "-A", "POSTROUTING", "-o", "eth0", "-d", "10.0.0.10", "-p", "tcp", "--dport", "9735", "-j", "MASQUERADE"], check=True)

    @patch('bridge.get_target_ip')
    @patch('builtins.open', new_callable=unittest.mock.mock_open, read_data='# VPNPort: 54321')
    @patch('subprocess.run')
    def test_inbound_down_teardown(self, mock_run, mock_open, mock_get_target):
        mock_get_target.return_value = "10.0.0.10"
        
        bridge.inbound_down()
        
        self.assertEqual(mock_run.call_count, 4)
        mock_run.assert_any_call(["iptables", "-t", "nat", "-D", "PREROUTING", "-i", "tunnelsatsv3", "-p", "tcp", "--dport", "54321", "-j", "DNAT", "--to-destination", "10.0.0.10:9735"], check=False)

if __name__ == '__main__':
    unittest.main()
