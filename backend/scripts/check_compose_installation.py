"""Verify the checked-in local Compose stack using disposable test resources."""

import base64
import json
import os
import secrets
import socket
import subprocess
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from uuid import uuid4

from check_installation_containers import wait_for


ROOT = Path(__file__).resolve().parents[2]


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return str(sock.getsockname()[1])


def main():
    tag = sys.argv[1]
    project = "test-compose-" + uuid4().hex[:10]
    env = {**os.environ, "SECRET_KEY": secrets.token_urlsafe(32),
           "OAUTH_TOKEN_ENCRYPTION_KEY": base64.urlsafe_b64encode(secrets.token_bytes(32)).decode(),
           "ADMIN_EMAIL": "test-compose-owner@example.com", "ADMIN_PASSWORD": secrets.token_urlsafe(24),
           "AD_STUDIO_BACKEND_PORT": free_port(), "AD_STUDIO_FRONTEND_PORT": free_port()}
    # Reuse CI's already-built images while exercising the real Compose commands,
    # environment, dependencies, bind mounts, health checks, and named volumes.
    override = json.dumps({"services": {
        "backend": {"image": f"breadwinner-backend:{tag}"},
        "worker": {"image": f"breadwinner-worker:{tag}"},
    }})
    command = ["docker", "compose", "--project-name", project, "--env-file", "/dev/null",
               "-f", "docker-compose.yml", "-f", "-"]

    def compose(*args):
        result = subprocess.run([*command, *args], input=override, cwd=ROOT, env=env,
                                capture_output=True, text=True, timeout=360)
        if result.returncode:
            # Output may contain resolved settings. Emit only the failed operation.
            raise RuntimeError(f"Compose {args[0]} failed with exit code {result.returncode}")
        return result.stdout.strip()

    api_url = "http://127.0.0.1:" + env["AD_STUDIO_FRONTEND_PORT"]

    def api(path, method="GET", data=None, token=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        request = Request(api_url + path, method=method, headers=headers,
                          data=json.dumps(data).encode() if data is not None else None)
        with urlopen(request, timeout=5) as response:
            return json.load(response)

    owner = {"email": env["ADMIN_EMAIL"], "password": env["ADMIN_PASSWORD"]}
    try:
        config = json.loads(compose("config", "--format", "json"))
        assert set(config["services"]) == {"postgres", "backend", "worker", "frontend"}
        frontend_env = config["services"]["frontend"]["environment"]
        assert not any(key in frontend_env for key in ("SECRET_KEY", "OAUTH_TOKEN_ENCRYPTION_KEY", "ADMIN_PASSWORD"))
        compose("up", "--detach", "--no-build")

        def frontend_ready():
            with urlopen(api_url + "/setup", timeout=5) as response:
                return response.status == 200 and b'<div id="root">' in response.read()

        wait_for(frontend_ready, "Compose frontend and SPA fallback", seconds=180)
        token = api("/api/v1/auth/login/json", "POST", owner)["access_token"]
        initial = api("/api/v1/installation", token=token)
        assert initial["status"] == "pending"
        api("/api/v1/installation", "PATCH", {"step": "providers", "status": "deferred"}, token)
        saved = api("/api/v1/installation/providers/gemini", "PUT",
                    {"api_key": "test-compose-provider-key"}, token)
        assert saved["configured"] and saved["source"] == "application"
        assert "test-compose-provider-key" not in json.dumps(saved)
        compose("exec", "-T", "backend", "python", "-c",
                "from pathlib import Path; Path('/app/uploads/test-compose.txt').write_text('test-compose-media')")

        def heartbeat():
            return compose("exec", "-T", "postgres", "psql", "-U", "ads_studio", "-d", "ads_studio_dev", "-Atc",
                           "SELECT worker_heartbeat_at > now() - interval '60 seconds' FROM installation_state WHERE id=1") == "t"

        wait_for(heartbeat, "Compose worker heartbeat")
        previous_heartbeat = api("/api/v1/installation", token=token)["worker"]["last_seen_at"]
        print("PASS: fresh Compose bootstrap, owner login, pending onboarding, provider save, worker and frontend proxy.", flush=True)

        compose("down")
        env["ADMIN_EMAIL"] = ""
        env["ADMIN_PASSWORD"] = ""
        compose("up", "--detach", "--no-build")
        wait_for(frontend_ready, "recreated Compose frontend", seconds=180)
        restored = api("/api/v1/installation", token=token)
        assert restored["installation_id"] == initial["installation_id"]
        assert restored["status"] == "deferred" and restored["step"] == "providers"
        assert api("/api/v1/auth/login/json", "POST", owner)["access_token"]
        compose("exec", "-T", "backend", "python", "-c",
                "from app.services.provider_settings import require_provider_key; "
                "assert require_provider_key('gemini') == 'test-compose-provider-key'")
        with urlopen(api_url + "/uploads/test-compose.txt", timeout=5) as response:
            assert response.read() == b"test-compose-media"
        wait_for(heartbeat, "recreated Compose worker heartbeat")
        wait_for(lambda: api("/api/v1/installation", token=token)["worker"]["last_seen_at"] != previous_heartbeat,
                 "a new worker heartbeat after recreation")
        print("PASS: container recreation preserves the database, owner, JWT signing, encrypted credentials and media. No AI provider contacted.", flush=True)
    except Exception:
        # This disposable stack contains synthetic credentials only. Still redact
        # them from diagnostics rather than publishing configuration or tokens.
        try:
            logs = compose("logs", "--no-color", "--tail", "40")
            for value in (env["SECRET_KEY"], env["OAUTH_TOKEN_ENCRYPTION_KEY"], owner["password"]):
                logs = logs.replace(value, "[REDACTED]")
            print(logs, file=sys.stderr)
        except RuntimeError:
            print("Compose diagnostics unavailable.", file=sys.stderr)
        raise
    finally:
        compose("down", "--volumes", "--remove-orphans")
        for resource, args in (("containers", ["ps", "--all", "--quiet"]),
                               ("volumes", ["volume", "ls", "--quiet"]),
                               ("networks", ["network", "ls", "--quiet"])):
            remaining = subprocess.check_output(
                ["docker", *args, "--filter", f"label=com.docker.compose.project={project}"], text=True
            ).strip()
            if remaining:
                raise RuntimeError(f"Compose cleanup left test {resource}")
        print("PASS: all test Compose containers, volumes and networks removed.", flush=True)


if __name__ == "__main__":
    main()
