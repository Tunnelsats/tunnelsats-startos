import unittest
import os
import sys
import json
from unittest.mock import patch, mock_open, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import bridge

class TestBridgeConfigCLI(unittest.TestCase):
    @patch('os.path.exists')
    @patch('builtins.open', new_callable=mock_open, read_data='{"enabled": true, "target-node": "cln", "tunnelsats-conf": "Interface..."}')
    @patch('sys.stdout', new_callable=MagicMock)
    @patch('sys.argv', ['bridge.py', 'config', 'get'])
    def test_config_get_cln(self, mock_stdout, mock_file_open, mock_exists):
        mock_exists.return_value = True
        
        bridge.main()
        
        args, kwargs = mock_stdout.write.call_args_list[0]
        output = json.loads(args[0])
        
        self.assertEqual(output["config"]["target-node"], "cln")
        self.assertEqual(output["depends-on"], {"c-lightning": []})

    @patch('os.path.exists')
    @patch('builtins.open', new_callable=mock_open, read_data='{"enabled": true, "target-node": "lnd", "tunnelsats-conf": "Interface..."}')
    @patch('sys.stdout', new_callable=MagicMock)
    @patch('sys.argv', ['bridge.py', 'config', 'get'])
    def test_config_get_lnd(self, mock_stdout, mock_file_open, mock_exists):
        mock_exists.return_value = True
        
        bridge.main()
        
        args, kwargs = mock_stdout.write.call_args_list[0]
        output = json.loads(args[0])
        
        self.assertEqual(output["config"]["target-node"], "lnd")
        self.assertEqual(output["depends-on"], {"lnd": []})

    @patch('sys.stdin')
    @patch('bridge.atomic_write_json')
    @patch('bridge.validate_config')
    @patch('builtins.open', new_callable=mock_open)
    @patch('sys.stdout', new_callable=MagicMock)
    @patch('sys.argv', ['bridge.py', 'config', 'set'])
    def test_config_set_lnd(self, mock_stdout, mock_file_open, mock_validate, mock_atomic_write, mock_stdin):
        # Mock stdin to supply input JSON for LND
        stdin_payload = {
            "config": {
                "enabled": True,
                "target-node": "lnd",
                "tunnelsats-conf": "[Interface]\nPrivateKey = hidden_key\nAddress = 10.x.x.x/32\n# VPNPort: 54321\n[Peer]\nEndpoint = 1.1.1.1:51820"
            }
        }
        mock_stdin.read.return_value = json.dumps(stdin_payload)
        
        bridge.main()
        
        args, kwargs = mock_stdout.write.call_args_list[0]
        output = json.loads(args[0])
        
        self.assertEqual(output["config"]["target-node"], "lnd")
        self.assertEqual(output["depends-on"], {"lnd": []})
        mock_atomic_write.assert_called_once()

    @patch('sys.stdin')
    @patch('bridge.atomic_write_json')
    @patch('bridge.validate_config')
    @patch('builtins.open', new_callable=mock_open)
    @patch('sys.stdout', new_callable=MagicMock)
    @patch('sys.argv', ['bridge.py', 'config', 'set'])
    def test_config_set_cln(self, mock_stdout, mock_file_open, mock_validate, mock_atomic_write, mock_stdin):
        # Mock stdin to supply input JSON for CLN
        stdin_payload = {
            "config": {
                "enabled": True,
                "target-node": "cln",
                "tunnelsats-conf": "[Interface]\nPrivateKey = hidden_key\nAddress = 10.x.x.x/32\n# VPNPort: 54321\n[Peer]\nEndpoint = 1.1.1.1:51820"
            }
        }
        mock_stdin.read.return_value = json.dumps(stdin_payload)
        
        bridge.main()
        
        args, kwargs = mock_stdout.write.call_args_list[0]
        output = json.loads(args[0])
        
        self.assertEqual(output["config"]["target-node"], "cln")
        self.assertEqual(output["depends-on"], {"c-lightning": []})
        mock_atomic_write.assert_called_once()

    @patch('os.path.exists')
    @patch('builtins.open', new_callable=mock_open, read_data='{"enabled": true, "target-node": "c-lightning", "tunnelsats-conf": "Interface..."}')
    @patch('sys.stdout', new_callable=MagicMock)
    @patch('sys.argv', ['bridge.py', 'config', 'get'])
    def test_config_get_c_lightning(self, mock_stdout, mock_file_open, mock_exists):
        mock_exists.return_value = True
        
        bridge.main()
        
        args, kwargs = mock_stdout.write.call_args_list[0]
        output = json.loads(args[0])
        
        self.assertEqual(output["config"]["target-node"], "c-lightning")
        self.assertEqual(output["depends-on"], {"c-lightning": []})

    @patch('sys.stdin')
    @patch('bridge.atomic_write_json')
    @patch('bridge.validate_config')
    @patch('builtins.open', new_callable=mock_open)
    @patch('sys.stdout', new_callable=MagicMock)
    @patch('sys.argv', ['bridge.py', 'config', 'set'])
    def test_config_set_c_lightning(self, mock_stdout, mock_file_open, mock_validate, mock_atomic_write, mock_stdin):
        # Mock stdin to supply input JSON for c-lightning alias
        stdin_payload = {
            "config": {
                "enabled": True,
                "target-node": "c-lightning",
                "tunnelsats-conf": "[Interface]\nPrivateKey = hidden_key\nAddress = 10.x.x.x/32\n# VPNPort: 54321\n[Peer]\nEndpoint = 1.1.1.1:51820"
            }
        }
        mock_stdin.read.return_value = json.dumps(stdin_payload)
        
        bridge.main()
        
        args, kwargs = mock_stdout.write.call_args_list[0]
        output = json.loads(args[0])
        
        self.assertEqual(output["config"]["target-node"], "c-lightning")
        self.assertEqual(output["depends-on"], {"c-lightning": []})
        mock_atomic_write.assert_called_once()

    @patch('os.path.exists')
    @patch('builtins.open', new_callable=mock_open, read_data='"not-a-dictionary-string"')
    @patch('sys.stdout', new_callable=MagicMock)
    @patch('sys.argv', ['bridge.py', 'config', 'get'])
    def test_config_get_invalid_type(self, mock_stdout, mock_file_open, mock_exists):
        mock_exists.return_value = True
        
        bridge.main()
        
        args, kwargs = mock_stdout.write.call_args_list[0]
        output = json.loads(args[0])
        
        # Should fallback to defaults
        self.assertEqual(output["config"]["target-node"], "lnd")
        self.assertEqual(output["config"]["enabled"], False)
        self.assertEqual(output["depends-on"], {"lnd": []})

    @patch('sys.stdin')
    @patch('bridge.atomic_write_json')
    @patch('bridge.validate_config')
    @patch('builtins.open', new_callable=mock_open)
    @patch('sys.stdout', new_callable=MagicMock)
    @patch('sys.argv', ['bridge.py', 'config', 'set'])
    def test_config_set_invalid_type(self, mock_stdout, mock_file_open, mock_validate, mock_atomic_write, mock_stdin):
        # Mock stdin to supply non-dictionary JSON
        mock_stdin.read.return_value = '"not-a-dictionary-string"'
        
        bridge.main()
        
        args, kwargs = mock_stdout.write.call_args_list[0]
        output = json.loads(args[0])
        
        # Should fallback config to empty dict, and depends-on to empty dict as well
        self.assertEqual(output["config"], {})
        self.assertEqual(output["depends-on"], {"lnd": []})
        mock_atomic_write.assert_called_once()

    @patch('os.path.exists')
    @patch('builtins.open', new_callable=mock_open, read_data='{invalid_json: "yes"}')
    @patch('sys.stdout', new_callable=MagicMock)
    @patch('sys.argv', ['bridge.py', 'config', 'get'])
    def test_config_get_corrupted_json(self, mock_stdout, mock_file_open, mock_exists):
        mock_exists.return_value = True
        
        bridge.main()
        
        args, kwargs = mock_stdout.write.call_args_list[0]
        output = json.loads(args[0])
        
        # Should catch JSONDecodeError and fallback to defaults
        self.assertEqual(output["config"]["target-node"], "lnd")
        self.assertEqual(output["config"]["enabled"], False)
        self.assertEqual(output["depends-on"], {"lnd": []})

    @patch('bridge.get_target_details')
    @patch('builtins.open')
    def test_generate_wireproxy_config_listen_port(self, mock_file_open, mock_target_details):
        mock_target_details.return_value = ("lnd.embassy", 9735)
        wg_sample = "[Interface]\nAddress = 10.9.0.102/32\n# Port Forwarding: 24556\n"
        
        # Setup mock open for reading CONFIG_PATH and writing WIREPROXY_CONFIG_PATH
        mock_read = mock_open(read_data=wg_sample)
        mock_file_open.side_effect = [
            mock_read.return_value,  # open CONFIG_PATH
            mock_read.return_value   # open WIREPROXY_CONFIG_PATH
        ]
        
        res = bridge.generate_wireproxy_config()
        self.assertTrue(res)
        
        # Verify written content includes ListenPort = 9735 and ListenPort = 24556
        write_calls = mock_read.return_value.write.call_args_list
        written_text = "".join(call[0][0] for call in write_calls)
        self.assertIn("ListenPort = 9735", written_text)
        self.assertIn("ListenPort = 24556", written_text)
        self.assertIn("Target = lnd.embassy:9735", written_text)

if __name__ == '__main__':
    unittest.main()
