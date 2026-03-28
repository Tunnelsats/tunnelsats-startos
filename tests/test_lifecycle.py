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

if __name__ == '__main__':
    unittest.main()
