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

if __name__ == '__main__':
    unittest.main()
