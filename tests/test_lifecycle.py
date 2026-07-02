import unittest
import os
import sys
import subprocess
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import bridge

class TestBridgeLifecycle(unittest.TestCase):
    @patch('bridge.generate_wireproxy_config')
    @patch('subprocess.Popen')
    def test_start_vpn_calls_wireproxy(self, mock_popen, mock_gen_config):
        mock_gen_config.return_value = True
        mock_popen.return_value = MagicMock()
        
        bridge.vpn_up("/data/tunnelsatsv3.conf")
        
        mock_popen.assert_called_with(
            ["/usr/local/bin/wireproxy", "-c", bridge.WIREPROXY_CONFIG_PATH],
            text=True
        )

    def test_stop_vpn_calls_wireproxy(self):
        mock_proc = MagicMock()
        bridge.wireproxy_process = mock_proc
        
        bridge.vpn_down("/data/tunnelsatsv3.conf")
        
        mock_proc.terminate.assert_called_once()
        mock_proc.wait.assert_called_with(timeout=5)
        self.assertIsNone(bridge.wireproxy_process)

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

    @patch('bridge.get_wg_ip')
    @patch('subprocess.run')
    @patch('builtins.open', new_callable=unittest.mock.mock_open, read_data='[Interface]\nPrivateKey = hidden_key\n# VPNPort: 54321\n[Peer]\nEndpoint = 198.51.100.1:51820')
    @patch('sys.stdout', new_callable=unittest.mock.MagicMock)
    def test_get_properties_success(self, mock_stdout, mock_open, mock_run, mock_get_ip):
        mock_get_ip.return_value = "10.9.9.45"
        
        # Mock `wg pubkey`
        mock_run.return_value = MagicMock(stdout=b'public_key_abc123\n')
        
        bridge.get_properties()
        
        # Verify JSON properties output
        args, kwargs = mock_stdout.write.call_args_list[0]
        import json
        output = json.loads(args[0])
        self.assertEqual(output["version"], 2)
        self.assertEqual(output["data"]["TunnelSats Public IP"]["value"], "198.51.100.1")
        self.assertEqual(output["data"]["Forwarding Port"]["value"], "54321")
        self.assertEqual(output["data"]["WireGuard Public Key"]["value"], "public_key_abc123")
        self.assertEqual(output["data"]["Internal IP (Last Octet)"]["value"], "45")

if __name__ == '__main__':
    unittest.main()
