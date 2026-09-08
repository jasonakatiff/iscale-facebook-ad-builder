"""The downloadable worker must never choose a customer's API destination."""

import importlib.util
import io
import os
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch


WORKER_PATH = (
    Path(__file__).resolve().parents[2] / "app/plugin_examples/plugin-worker.py"
)
SPEC = importlib.util.spec_from_file_location("example_plugin_worker", WORKER_PATH)
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)


class PluginWorkerConfigurationTests(unittest.TestCase):
    def test_missing_origin_rejects_key_before_any_request(self):
        for origin in (None, ""):
            with self.subTest(origin=origin):
                env = {"BREADWINNER_PLUGIN_WORKER_KEY": "bwp_worker_test-only"}
                if origin is not None:
                    env["BREADWINNER_API_ORIGIN"] = origin
                with (
                    patch.dict(os.environ, env, clear=True),
                    patch.object(sys, "argv", ["plugin-worker.py", "--once"]),
                    patch.object(worker, "run_once", return_value=False) as request,
                    redirect_stderr(io.StringIO()),
                    redirect_stdout(io.StringIO()),
                ):
                    with self.assertRaises(SystemExit) as error:
                        worker.main()
                    self.assertEqual(error.exception.code, 2)
                    request.assert_not_called()

    def test_explicit_origin_receives_the_worker_key(self):
        env = {
            "BREADWINNER_API_ORIGIN": "https://test-customer.example.com/",
            "BREADWINNER_PLUGIN_WORKER_KEY": "bwp_worker_test-only",
        }
        with (
            patch.dict(os.environ, env, clear=True),
            patch.object(sys, "argv", ["plugin-worker.py", "--once"]),
            patch.object(worker, "run_once", return_value=False) as request,
            redirect_stdout(io.StringIO()),
        ):
            worker.main()
            request.assert_called_once_with(
                "https://test-customer.example.com", "bwp_worker_test-only"
            )

    def test_remote_plain_http_rejects_key_before_any_request(self):
        env = {
            "BREADWINNER_API_ORIGIN": "http://test-customer.example.com",
            "BREADWINNER_PLUGIN_WORKER_KEY": "bwp_worker_test-only",
        }
        with (
            patch.dict(os.environ, env, clear=True),
            patch.object(sys, "argv", ["plugin-worker.py", "--once"]),
            patch.object(worker, "run_once", return_value=False) as request,
            redirect_stderr(io.StringIO()),
        ):
            with self.assertRaises(SystemExit) as error:
                worker.main()
            self.assertEqual(error.exception.code, 2)
            request.assert_not_called()


if __name__ == "__main__":
    unittest.main()
