import unittest
import os
import sys
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import bridge

class TestBridgeStatus(unittest.TestCase):
    @patch('os.path.exists')
    @patch('bridge.is_enabled')
    @patch('bridge.get_wg_ip')
    @patch('builtins.open', new_callable=unittest.mock.mock_open, read_data='[Interface]\nAddress = 10.9.0.102/32\n# VPNPort: 24556\n[Peer]\nEndpoint = ch1.tunnelsats.com:51820')
    def test_status_connected(self, mock_open, mock_get_ip, mock_is_enabled, mock_exists):
        mock_exists.return_value = True
        mock_is_enabled.return_value = True
        mock_get_ip.return_value = "10.9.0.102"

        status = bridge.get_status()
        self.assertEqual(status["status"], "running")
        self.assertTrue(status["vpn_connected"])
        self.assertEqual(status["handshake"], "active")
        self.assertEqual(status["vpn_ip"], "10.9.0.102")
        self.assertEqual(status["vpn_port"], 24556)
        self.assertEqual(status["server"], "ch1.tunnelsats.com")

    @patch('bridge.is_enabled')
    def test_status_disconnected(self, mock_is_enabled):
        mock_is_enabled.return_value = False

        status = bridge.get_status()
        self.assertEqual(status["status"], "stopped")
        self.assertFalse(status["vpn_connected"])
        self.assertEqual(status["handshake"], "none")

    @patch('os.path.exists')
    @patch('bridge.is_enabled')
    def test_status_stopped(self, mock_is_enabled, mock_exists):
        mock_is_enabled.return_value = True
        mock_exists.return_value = False

        status = bridge.get_status()
        self.assertEqual(status["status"], "stopped")
        self.assertFalse(status["vpn_connected"])
        self.assertEqual(status["handshake"], "none")

    @patch('bridge.is_enabled')
    @patch('sys.stdout', new_callable=MagicMock)
    @patch('sys.argv', ['bridge.py', 'health', 'vpn'])
    def test_health_vpn_disabled(self, mock_stdout, mock_is_enabled):
        mock_is_enabled.return_value = False
        
        with self.assertRaises(SystemExit) as cm:
            bridge.main()
            
        self.assertEqual(cm.exception.code, 0)
        
        args, kwargs = mock_stdout.write.call_args_list[0]
        import json
        output = json.loads(args[0])
        self.assertEqual(output["result"], "ok")

    @patch('bridge.is_enabled')
    @patch('sys.stdout', new_callable=MagicMock)
    @patch('sys.argv', ['bridge.py', 'health', 'proxy'])
    def test_health_proxy_disabled(self, mock_stdout, mock_is_enabled):
        mock_is_enabled.return_value = False
        
        with self.assertRaises(SystemExit) as cm:
            bridge.main()
            
        self.assertEqual(cm.exception.code, 0)
        
        args, kwargs = mock_stdout.write.call_args_list[0]
        import json
        output = json.loads(args[0])
        self.assertEqual(output["result"], "ok")

if __name__ == '__main__':
    unittest.main()
