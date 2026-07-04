import unittest
import os
import sys
import json
from unittest.mock import patch, MagicMock
from io import BytesIO

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import bridge

class DummyHeaders:
    def __init__(self, headers):
        self.headers = {k.lower(): v for k, v in headers.items()}
    def get(self, name, default=None):
        return self.headers.get(name.lower(), default)
    def __contains__(self, name):
        return name.lower() in self.headers

class TestHTTPHandler(unittest.TestCase):
    @patch('bridge.get_default_gateway')
    @patch('socket.gethostbyname')
    @patch('bridge.get_status')
    @patch('bridge.get_wg_pubkey')
    def test_do_GET_api_status_authorization(self, mock_pubkey, mock_status, mock_gethostbyname, mock_get_gw):
        mock_get_gw.return_value = "172.18.0.1"
        mock_gethostbyname.return_value = "172.18.0.1"
        mock_pubkey.return_value = "pubkey123"
        mock_status.return_value = {
            "status": "running",
            "vpn_connected": True,
            "handshake": "active"
        }
        
        # Test local address: bypasses gateway check
        req = MagicMock()
        req.client_address = ("127.0.0.1", 12345)
        req.path = "/api/status"
        req.headers = DummyHeaders({"Host": "localhost"})
        
        wfile = BytesIO()
        req.wfile = wfile
        
        handler = bridge.DashboardHTTPRequestHandler.__new__(bridge.DashboardHTTPRequestHandler)
        handler.client_address = req.client_address
        handler.path = req.path
        handler.headers = req.headers
        handler.wfile = wfile
        handler.send_response = MagicMock()
        handler.send_header = MagicMock()
        handler.end_headers = MagicMock()
        handler.send_error = MagicMock()
        
        bridge.DashboardHTTPRequestHandler.do_GET(handler)
        
        # Should NOT have sent an error
        handler.send_error.assert_not_called()
        handler.send_response.assert_called_with(200)
        
        # Test untrusted subnet peer container: returns 403
        wfile_untrusted = BytesIO()
        handler_untrusted = bridge.DashboardHTTPRequestHandler.__new__(bridge.DashboardHTTPRequestHandler)
        handler_untrusted.client_address = ("172.18.0.3", 12345)
        handler_untrusted.path = "/api/status"
        handler_untrusted.headers = DummyHeaders({
            "Host": "tunnelsats.local",
            "X-Forwarded-For": "1.2.3.4",
            "X-Forwarded-Host": "tunnelsats.local"
        })
        handler_untrusted.wfile = wfile_untrusted
        handler_untrusted.send_response = MagicMock()
        handler_untrusted.send_header = MagicMock()
        handler_untrusted.end_headers = MagicMock()
        handler_untrusted.send_error = MagicMock()
        
        bridge.DashboardHTTPRequestHandler.do_GET(handler_untrusted)
        handler_untrusted.send_error.assert_called_with(403, "Access denied")
        
        # Test trusted embassy proxy IP: returns 200
        wfile_trusted = BytesIO()
        handler_trusted = bridge.DashboardHTTPRequestHandler.__new__(bridge.DashboardHTTPRequestHandler)
        handler_trusted.client_address = ("172.18.0.1", 12345)
        handler_trusted.path = "/api/status"
        handler_trusted.headers = DummyHeaders({
            "Host": "tunnelsats.local",
            "X-Forwarded-For": "1.2.3.4",
            "X-Forwarded-Host": "tunnelsats.local"
        })
        handler_trusted.wfile = wfile_trusted
        handler_trusted.send_response = MagicMock()
        handler_trusted.send_header = MagicMock()
        handler_trusted.end_headers = MagicMock()
        handler_trusted.send_error = MagicMock()
        
        bridge.DashboardHTTPRequestHandler.do_GET(handler_trusted)
        handler_trusted.send_error.assert_not_called()
        handler_trusted.send_response.assert_called_with(200)

if __name__ == '__main__':
    unittest.main()
