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
        
        # Test local address with port and IPv6 formats
        for host in ["localhost:8080", "[::1]", "[::1]:8080", "127.0.0.1:8080"]:
            req_host = MagicMock()
            req_host.client_address = ("127.0.0.1", 12345)
            req_host.path = "/api/status"
            req_host.headers = DummyHeaders({"Host": host})
            wfile_host = BytesIO()
            handler_host = bridge.DashboardHTTPRequestHandler.__new__(bridge.DashboardHTTPRequestHandler)
            handler_host.client_address = req_host.client_address
            handler_host.path = req_host.path
            handler_host.headers = req_host.headers
            handler_host.wfile = wfile_host
            handler_host.send_response = MagicMock()
            handler_host.send_header = MagicMock()
            handler_host.end_headers = MagicMock()
            handler_host.send_error = MagicMock()
            
            bridge.DashboardHTTPRequestHandler.do_GET(handler_host)
            handler_host.send_error.assert_not_called()
            handler_host.send_response.assert_called_with(200)
        
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
        
        # Test trusted embassy proxy IP (with standard .local Host): returns 200
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

        # Test trusted embassy proxy IP (with RFC 1918 private IP Host): returns 200
        wfile_ip = BytesIO()
        handler_ip = bridge.DashboardHTTPRequestHandler.__new__(bridge.DashboardHTTPRequestHandler)
        handler_ip.client_address = ("172.18.0.1", 12345)
        handler_ip.path = "/api/status"
        handler_ip.headers = DummyHeaders({
            "Host": "192.168.1.150:443",
            "X-Forwarded-For": "1.2.3.4",
            "X-Forwarded-Host": "192.168.1.150"
        })
        handler_ip.wfile = wfile_ip
        handler_ip.send_response = MagicMock()
        handler_ip.send_header = MagicMock()
        handler_ip.end_headers = MagicMock()
        handler_ip.send_error = MagicMock()
        
        bridge.DashboardHTTPRequestHandler.do_GET(handler_ip)
        handler_ip.send_error.assert_not_called()
        handler_ip.send_response.assert_called_with(200)

        # Test trusted embassy proxy IP (with RFC 4193 private IPv6 Host): returns 200
        wfile_ipv6_private = BytesIO()
        handler_ipv6_private = bridge.DashboardHTTPRequestHandler.__new__(bridge.DashboardHTTPRequestHandler)
        handler_ipv6_private.client_address = ("172.18.0.1", 12345)
        handler_ipv6_private.path = "/api/status"
        handler_ipv6_private.headers = DummyHeaders({
            "Host": "[fd00::1]:8443",
            "X-Forwarded-For": "1.2.3.4",
            "X-Forwarded-Host": "fd00::1"
        })
        handler_ipv6_private.wfile = wfile_ipv6_private
        handler_ipv6_private.send_response = MagicMock()
        handler_ipv6_private.send_header = MagicMock()
        handler_ipv6_private.end_headers = MagicMock()
        handler_ipv6_private.send_error = MagicMock()
        
        bridge.DashboardHTTPRequestHandler.do_GET(handler_ipv6_private)
        handler_ipv6_private.send_error.assert_not_called()
        handler_ipv6_private.send_response.assert_called_with(200)

        # Test trusted embassy proxy IP (with invalid public IPv6 Host): returns 403
        wfile_ipv6_public = BytesIO()
        handler_ipv6_public = bridge.DashboardHTTPRequestHandler.__new__(bridge.DashboardHTTPRequestHandler)
        handler_ipv6_public.client_address = ("172.18.0.1", 12345)
        handler_ipv6_public.path = "/api/status"
        handler_ipv6_public.headers = DummyHeaders({
            "Host": "[2001:4860:4860::8888]",
            "X-Forwarded-For": "1.2.3.4",
            "X-Forwarded-Host": "2001:4860:4860::8888"
        })
        handler_ipv6_public.wfile = wfile_ipv6_public
        handler_ipv6_public.send_response = MagicMock()
        handler_ipv6_public.send_header = MagicMock()
        handler_ipv6_public.end_headers = MagicMock()
        handler_ipv6_public.send_error = MagicMock()
        
        bridge.DashboardHTTPRequestHandler.do_GET(handler_ipv6_public)
        handler_ipv6_public.send_error.assert_called_with(403, "Access denied")

        # Test trusted embassy proxy IP (with invalid public IP Host): returns 403
        wfile_pub_ip = BytesIO()
        handler_pub_ip = bridge.DashboardHTTPRequestHandler.__new__(bridge.DashboardHTTPRequestHandler)
        handler_pub_ip.client_address = ("172.18.0.1", 12345)
        handler_pub_ip.path = "/api/status"
        handler_pub_ip.headers = DummyHeaders({
            "Host": "8.8.8.8",
            "X-Forwarded-For": "1.2.3.4",
            "X-Forwarded-Host": "8.8.8.8"
        })
        handler_pub_ip.wfile = wfile_pub_ip
        handler_pub_ip.send_response = MagicMock()
        handler_pub_ip.send_header = MagicMock()
        handler_pub_ip.end_headers = MagicMock()
        handler_pub_ip.send_error = MagicMock()
        
        bridge.DashboardHTTPRequestHandler.do_GET(handler_pub_ip)
        handler_pub_ip.send_error.assert_called_with(403, "Access denied")

if __name__ == '__main__':
    unittest.main()
