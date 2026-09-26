"""Expiry provenance: only the TunnelSats API's answer for the current key
counts as a confirmed expiry. The `# Valid Until` comment is a hint and must
never be written into, or read back as, the confirmed expiry (Issue #3)."""
import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import bridge

CONF_WITH_COMMENT = (
    "[Interface]\n"
    "PrivateKey = aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=\n"
    "Address = 10.9.0.2/32\n"
    "# VPNPort: 24556\n"
    "# Valid Until: 2099-12-31T23:59:59Z\n"
    "\n"
    "[Peer]\n"
    "PublicKey = bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb=\n"
    "Endpoint = de2.tunnelsats.com:51820\n"
)


def api_response(payload):
    resp = MagicMock()
    resp.read.return_value = json.dumps(payload).encode()
    resp.__enter__ = lambda s: s
    resp.__exit__ = MagicMock(return_value=False)
    return resp


class ProvenanceTestBase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        d = self._tmp.name
        self.meta_path = os.path.join(d, "tunnelsats-meta.json")
        self.conf_path = os.path.join(d, "tunnelsatsv3.conf")
        self.app_path = os.path.join(d, "config.json")
        self._orig = (bridge.META_FILE_PATH, bridge.CONFIG_PATH, bridge.APP_CONFIG_PATH)
        bridge.META_FILE_PATH = self.meta_path
        bridge.CONFIG_PATH = self.conf_path
        bridge.APP_CONFIG_PATH = self.app_path
        with open(self.conf_path, "w") as f:
            f.write(CONF_WITH_COMMENT)

    def tearDown(self):
        bridge.META_FILE_PATH, bridge.CONFIG_PATH, bridge.APP_CONFIG_PATH = self._orig
        self._tmp.cleanup()

    def write_meta(self, meta):
        with open(self.meta_path, "w") as f:
            json.dump(meta, f)

    def read_meta(self):
        with open(self.meta_path) as f:
            return json.load(f)


class TestLazySyncProvenance(ProvenanceTestBase):
    @patch('urllib.request.urlopen')
    def test_success_records_api_provenance_and_key(self, mock_urlopen):
        mock_urlopen.return_value = api_response(
            {"expiry": "2026-12-31T23:59:59Z", "server_domain": "de2.tunnelsats.com", "vpn_port": 24556}
        )
        bridge.lazy_sync("pk_current")
        meta = self.read_meta()
        self.assertEqual(meta["expiresAt"], "2026-12-31T23:59:59Z")
        self.assertEqual(meta["expirySource"], "api")
        self.assertEqual(meta["publicKey"], "pk_current")
        self.assertTrue(meta["syncSuccess"])

    @patch('bridge.time.sleep')
    @patch('urllib.request.urlopen', side_effect=urllib.error.URLError("unreachable"))
    def test_failure_never_seeds_expiry_from_comment(self, _urlopen, _sleep):
        bridge.lazy_sync("pk_current")
        meta = self.read_meta()
        self.assertNotIn("expiresAt", meta)
        self.assertNotIn("expirySource", meta)
        self.assertFalse(meta["syncSuccess"])
        self.assertIn("unreachable", meta["syncError"])

    @patch('bridge.time.sleep')
    @patch('urllib.request.urlopen', side_effect=urllib.error.URLError("unreachable"))
    def test_failure_keeps_last_confirmed_value_for_the_same_key(self, _urlopen, _sleep):
        self.write_meta({
            "expiresAt": "2026-10-01T00:00:00Z", "expirySource": "api",
            "publicKey": "pk_current", "lastSync": "2026-09-01T00:00:00Z", "syncSuccess": True,
        })
        bridge.lazy_sync("pk_current")
        meta = self.read_meta()
        self.assertEqual(meta["expiresAt"], "2026-10-01T00:00:00Z")
        self.assertEqual(meta["expirySource"], "api")
        self.assertEqual(meta["lastSync"], "2026-09-01T00:00:00Z")
        self.assertFalse(meta["syncSuccess"])

    @patch('bridge.time.sleep')
    @patch('urllib.request.urlopen', side_effect=urllib.error.URLError("unreachable"))
    def test_key_change_drops_previous_confirmation(self, _urlopen, _sleep):
        self.write_meta({
            "expiresAt": "2026-10-01T00:00:00Z", "expirySource": "api",
            "publicKey": "pk_old", "lastSync": "2026-09-01T00:00:00Z",
            "syncSuccess": True, "bandwidth_used_gb": 12.5,
        })
        bridge.lazy_sync("pk_new")
        meta = self.read_meta()
        self.assertEqual(meta["publicKey"], "pk_new")
        for k in ("expiresAt", "expirySource", "lastSync", "bandwidth_used_gb"):
            self.assertNotIn(k, meta)
        self.assertFalse(meta["syncSuccess"])

    @patch('urllib.request.urlopen')
    def test_answer_without_valid_expiry_is_a_sync_error(self, mock_urlopen):
        mock_urlopen.return_value = api_response({"server_domain": "de2.tunnelsats.com"})
        bridge.lazy_sync("pk_current")
        meta = self.read_meta()
        self.assertNotIn("expiresAt", meta)
        self.assertFalse(meta["syncSuccess"])
        self.assertTrue(meta["syncError"])


class TestSaveConfigurationProvenance(ProvenanceTestBase):
    def test_does_not_seed_expiry_from_comment(self):
        bridge.save_configuration(CONF_WITH_COMMENT, "lnd")
        meta = self.read_meta()
        self.assertNotIn("expiresAt", meta)
        self.assertNotIn("expirySource", meta)
        self.assertFalse(meta["syncSuccess"])


class TestSubscriptionInfoProvenance(ProvenanceTestBase):
    def test_legacy_unconfirmed_expiry_is_ignored(self):
        self.write_meta({"expiresAt": "2099-01-01T00:00:00Z", "syncSuccess": True,
                         "lastSync": "2026-09-01T00:00:00Z"})
        info = bridge.get_subscription_info("pk_current")
        self.assertIsNone(info["expiresAt"])
        self.assertFalse(info["linked"])

    def test_expiry_confirmed_for_another_key_is_ignored(self):
        self.write_meta({"expiresAt": "2099-01-01T00:00:00Z", "expirySource": "api",
                         "publicKey": "pk_old", "syncSuccess": True,
                         "lastSync": "2026-09-01T00:00:00Z"})
        info = bridge.get_subscription_info("pk_new")
        self.assertIsNone(info["expiresAt"])
        self.assertFalse(info["linked"])

    def test_expiry_confirmed_for_current_key_is_used(self):
        self.write_meta({"expiresAt": "2099-01-01T00:00:00Z", "expirySource": "api",
                         "publicKey": "pk_current", "syncSuccess": True,
                         "lastSync": "2026-09-01T00:00:00Z"})
        info = bridge.get_subscription_info("pk_current")
        self.assertEqual(info["expiresAt"], "2099-01-01T00:00:00Z")
        self.assertTrue(info["linked"])
        self.assertFalse(info["isExpired"])


class TestHealthProvenance(ProvenanceTestBase):
    @patch('bridge.is_enabled', return_value=True)
    @patch('bridge.get_wg_pubkey', return_value="pk_new")
    @patch('bridge.lazy_sync')
    @patch('sys.stdout', new_callable=io.StringIO)
    def test_health_resyncs_when_confirmation_belongs_to_another_key(
        self, mock_stdout, mock_lazy_sync, _pubkey, _enabled
    ):
        self.write_meta({"expiresAt": "2099-01-01T00:00:00Z", "expirySource": "api",
                         "publicKey": "pk_old", "syncSuccess": True,
                         "lastSync": "2026-09-01T00:00:00Z"})
        with patch('sys.argv', ['bridge.py', 'health', 'subscription']):
            with self.assertRaises(SystemExit) as cm:
                bridge.main()
        mock_lazy_sync.assert_called_once_with("pk_new")
        out = json.loads(mock_stdout.getvalue())
        # Still unconfirmed after the (mocked, no-op) sync: never "ok".
        self.assertEqual(out["result"], "loading")
        self.assertEqual(cm.exception.code, 0)


if __name__ == '__main__':
    unittest.main()
