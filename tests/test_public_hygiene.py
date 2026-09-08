"""The publication gate rejects private locations and prints no matching values."""

import unittest

from scripts.check_public_hygiene import findings_for_text


class PublicHygieneTest(unittest.TestCase):
    def test_private_locations_fail_without_echoing_content(self):
        for value, rule in [
            ("https://test-host.up.railway.app", "hosted-deployment"),
            ("https://breadwinner.a4d.com", "private-application"),
            ("/Users/test-owner/private/notes.txt", "personal-home-path"),
            ("test-owner@a4d.com", "internal-email"),
            ("https://github.com/A4DLLC/breadWinner.com", "private-repository"),
        ]:
            with self.subTest(rule=rule):
                result = findings_for_text("docs/test.md", "First line\n" + value)
                self.assertEqual(result, [{"path": "docs/test.md", "line": 2, "rule": rule}])
                self.assertNotIn(value, str(result))

    def test_examples_and_official_provider_links_are_allowed(self):
        content = "\n".join([
            "https://api.example.com/api/v1",
            "http://localhost:8000",
            "https://graph.facebook.com/v24.0",
            "https://theleadrouter.com",
        ])
        self.assertEqual(findings_for_text("README.md", content), [])


if __name__ == "__main__":
    unittest.main()
