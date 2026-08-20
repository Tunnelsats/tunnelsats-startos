import unittest
import os
import sys
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import bridge

class TestBridgeLifecycle(unittest.TestCase):
    def test_vpn_up_and_down(self):
        # vpn_up and vpn_down should log and execute cleanly without raising
        bridge.vpn_up("/data/tunnelsatsv3.conf")
        bridge.vpn_down("/data/tunnelsatsv3.conf")

    @patch('os.path.exists')
    @patch('builtins.open', new_callable=unittest.mock.mock_open, read_data='[Interface]\nAddress = 10.9.9.9/32')
    def test_get_wg_ip_success(self, mock_open, mock_exists):
        mock_exists.return_value = True
        ip = bridge.get_wg_ip()
        self.assertEqual(ip, "10.9.9.9")

    @patch('os.path.exists')
    def test_get_wg_ip_failure(self, mock_exists):
        mock_exists.return_value = False
        ip = bridge.get_wg_ip()
        self.assertIsNone(ip)

    def test_proxy_up_success(self):
        result = bridge.proxy_up()
        self.assertTrue(result)

    def test_proxy_down_teardown(self):
        bridge.proxy_down()

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
    def test_get_target_details_cln(self, mock_open, mock_exists):
        mock_exists.return_value = True
        host, port = bridge.get_target_details()
        self.assertEqual(host, "c-lightning.embassy")
        self.assertEqual(port, 9735)

    @patch('os.path.exists')
    @patch('builtins.open', new_callable=unittest.mock.mock_open, read_data='{"target-node": "lnd"}')
    def test_get_target_details_lnd(self, mock_open, mock_exists):
        mock_exists.return_value = True
        host, port = bridge.get_target_details()
        self.assertEqual(host, "lnd.embassy")
        self.assertEqual(port, 9735)

    def test_inbound_up_success(self):
        result = bridge.inbound_up()
        self.assertTrue(result)

    def test_inbound_down_teardown(self):
        bridge.inbound_down()

    def test_validate_config_success(self):
        valid_conf = "[Interface]\nPrivateKey = hidden_key\nAddress = 10.x.x.x/32\n# VPNPort: 54321\n[Peer]\nEndpoint = 198.51.100.1:51820"
        bridge.validate_config(valid_conf) # Should not raise
        
    def test_validate_config_missing_privatekey(self):
        invalid_conf = "[Interface]\nAddress = 10.x.x.x/32\n# VPNPort: 54321\n[Peer]\nEndpoint = 198.51.100.1:51820"
        with self.assertRaisesRegex(ValueError, "Missing 'PrivateKey'"):
            bridge.validate_config(invalid_conf)
            
    def test_validate_config_missing_endpoint(self):
        invalid_conf = "[Interface]\nPrivateKey = hidden_key\nAddress = 10.x.x.x/32\n# VPNPort: 54321\n[Peer]\n"
        with self.assertRaisesRegex(ValueError, "Missing 'Endpoint'"):
            bridge.validate_config(invalid_conf)

    def test_validate_config_missing_vpnport(self):
        invalid_conf = "[Interface]\nPrivateKey = hidden_key\nAddress = 10.x.x.x/32\n[Peer]\nEndpoint = 198.51.100.1:51820"
        with self.assertRaisesRegex(ValueError, "Missing port-forwarding metadata"):
            bridge.validate_config(invalid_conf)

    def test_validate_config_with_port_forwarding_tag(self):
        valid_conf = "[Interface]\nPrivateKey = hidden_key\nAddress = 10.x.x.x/32\n# Port Forwarding: 54321\n[Peer]\nEndpoint = 198.51.100.1:51820"
        bridge.validate_config(valid_conf) # Should work cleanly now

    @patch('bridge.is_enabled')
    @patch('bridge.vpn_up')
    @patch('time.sleep')
    @patch('sys.argv', ['bridge.py', 'start'])
    def test_main_start_disabled(self, mock_sleep, mock_vpn_up, mock_is_enabled):
        mock_is_enabled.return_value = False
        mock_sleep.side_effect = KeyboardInterrupt("Stop loop")
        
        with self.assertRaises(KeyboardInterrupt):
            bridge.main()
            
        mock_vpn_up.assert_not_called()

    @patch('os.replace')
    @patch('urllib.request.urlopen')
    @patch('builtins.open', new_callable=unittest.mock.mock_open)
    def test_lazy_sync_success(self, mock_open, mock_urlopen, mock_replace):
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = b'{"expiry": "2026-12-31T23:59:59Z"}'
        mock_response.__enter__ = lambda s: s
        mock_response.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_response
        
        bridge.lazy_sync("mock_pubkey_123")
        
        mock_open.assert_called_with(bridge.META_FILE_PATH + ".tmp", 'w')
        handle = mock_open()
        written_data = "".join([call.args[0] for call in handle.write.call_args_list])
        import json
        parsed_written = json.loads(written_data)
        self.assertEqual(parsed_written["expiresAt"], "2026-12-31T23:59:59Z")

    @patch('builtins.open', new_callable=unittest.mock.mock_open, read_data='{"expiresAt": "2026-12-31T23:59:59Z"}')
    @patch('os.path.exists')
    @patch('bridge.datetime')
    def test_format_subscription_expiry_active(self, mock_datetime, mock_exists, mock_open):
        mock_exists.return_value = True
        
        from datetime import datetime, timezone
        fixed_now = datetime(2026, 12, 20, 12, 0, 0, tzinfo=timezone.utc)
        mock_datetime.now.return_value = fixed_now
        mock_datetime.fromisoformat.side_effect = lambda s: datetime.fromisoformat(s)
        
        result = bridge.format_subscription_expiry()
        self.assertEqual(result, "Active (Expires in 11d 11h)")

if __name__ == '__main__':
    unittest.main()
