"""Setup validation must preserve credentials without invoking the old writer."""

import base64
import importlib.util
import io
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[3]
HELPER = ROOT / "backend/scripts/local_setup.py"


class LocalSetupTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("local_setup", HELPER)
        self.setup = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.setup)
        self.values = {
            "DATABASE_URL": "postgresql://test-user:test-password@localhost/test_setup",
            "SECRET_KEY": "test-existing-signing-key-with-$-and-quotes",
            "OAUTH_TOKEN_ENCRYPTION_KEY": base64.urlsafe_b64encode(b"t" * 32).decode(),
            "ADMIN_EMAIL": "test-owner@example.com",
            "ADMIN_PASSWORD": "test-existing-owner-password",
            "GEMINI_API_KEY": "test-existing-provider-key",
        }

    def test_valid_settings_are_preserved_exactly_on_repeated_checks(self):
        original = dict(self.values)
        self.setup.validate_environment(self.values)
        self.setup.validate_environment(self.values)
        self.assertEqual(self.values, original)

    def test_missing_settings_report_names_without_other_credentials(self):
        for name in ("DATABASE_URL", "SECRET_KEY", "OAUTH_TOKEN_ENCRYPTION_KEY"):
            with self.subTest(name=name):
                values = {key: value for key, value in self.values.items() if key != name}
                with self.assertRaises(self.setup.SetupError) as error:
                    self.setup.validate_environment(values)
                self.assertIn(name, str(error.exception))
                for value in values.values():
                    self.assertNotIn(value, str(error.exception))

    def test_invalid_encryption_material_is_rejected_without_echoing_it(self):
        for value in ("test-not-a-key", base64.urlsafe_b64encode(b"t" * 31).decode()):
            with self.subTest(value=value):
                with self.assertRaises(self.setup.SetupError) as error:
                    self.setup.validate_environment(
                        {**self.values, "OAUTH_TOKEN_ENCRYPTION_KEY": value}
                    )
                self.assertIn("OAUTH_TOKEN_ENCRYPTION_KEY", str(error.exception))
                self.assertNotIn(value, str(error.exception))

    def test_invalid_database_url_is_rejected_without_echoing_it(self):
        for value in ("sqlite:///test.db", "postgres://user:password@host/db",
                      "postgresql://user:test-secret@host:bad/db"):
            with self.subTest(value=value):
                with self.assertRaises(self.setup.SetupError) as error:
                    self.setup.validate_environment({**self.values, "DATABASE_URL": value})
                self.assertIn("DATABASE_URL", str(error.exception))
                self.assertNotIn(value, str(error.exception))

    def test_owner_fields_can_be_omitted_for_an_existing_installation(self):
        values = {key: value for key, value in self.values.items() if not key.startswith("ADMIN_")}
        self.setup.validate_environment(values)
        with self.assertRaises(self.setup.SetupError):
            self.setup.validate_environment({**values, "ADMIN_EMAIL": "test-owner@example.com"})

    def test_bootstrap_failure_does_not_leak_credentials_or_claim_success(self):
        errors = io.StringIO()
        with (
            patch.dict(self.setup.os.environ, self.values, clear=True),
            patch.object(self.setup, "bootstrap", side_effect=RuntimeError(self.values["DATABASE_URL"])),
            redirect_stderr(errors),
        ):
            self.assertEqual(self.setup.main(["--bootstrap"]), 1)
        self.assertIn("bootstrap failed", errors.getvalue())
        self.assertNotIn(self.values["DATABASE_URL"], errors.getvalue())

    def test_shell_check_is_read_only_from_another_directory(self):
        env = {**os.environ, **self.values, "AD_STUDIO_PYTHON": sys.executable,
               "DATABASE_URL": "postgresql://test-user:test-password@127.0.0.1:1/test_unreachable"}
        with tempfile.TemporaryDirectory(prefix="test-setup-") as directory:
            before = list(Path(directory).iterdir())
            for _ in range(2):
                result = subprocess.run(["bash", str(ROOT / "setup.sh"), "--check"],
                                        cwd=directory, env=env, capture_output=True,
                                        text=True, timeout=15)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("No dependencies installed or database contacted", result.stdout)
                for name in self.values:
                    self.assertNotIn(env[name], result.stdout + result.stderr)
            self.assertEqual(list(Path(directory).iterdir()), before)

    def test_shell_rejects_unknown_options_and_missing_settings(self):
        for options, values in [(["--unknown"], self.values),
                                (["--check", "--skip-install"], self.values),
                                (["--skip-install"], {**self.values, "SECRET_KEY": ""})]:
            result = subprocess.run(["bash", str(ROOT / "setup.sh"), *options],
                                    env={**os.environ, **values, "AD_STUDIO_PYTHON": sys.executable},
                                    capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 2)
            self.assertNotIn("database setup complete", result.stdout)


if __name__ == "__main__":
    unittest.main()
