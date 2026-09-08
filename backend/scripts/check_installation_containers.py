"""Exercise built images with disposable PostgreSQL and persistent media volumes."""
import base64
import json
import subprocess
import sys
import time
import tomllib
from pathlib import Path
from urllib.request import Request, urlopen
from uuid import uuid4


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()


def wait_for(check, label, seconds=120):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            result = check()
            if result:
                return result
        except (OSError, subprocess.CalledProcessError):
            pass
        time.sleep(1)
    raise RuntimeError(f"Timed out waiting for {label}")


def main():
    tag = sys.argv[1]
    prefix = f"test-installation-{uuid4().hex[:10]}"
    network = prefix + "-network"
    containers, volumes = [], []

    def run(service, image, *args, command=()):
        name = prefix + "-" + service
        containers.append(name)
        docker("run", "--detach", "--name", name, "--network", network, *args, image, *command)
        return name

    def api(path, method="GET", data=None, token=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        request = Request(api_url + path, method=method, headers=headers,
                          data=json.dumps(data).encode() if data is not None else None)
        with urlopen(request, timeout=5) as response:
            return json.load(response)

    try:
        docker("network", "create", network)
        for suffix in ["database", "media"]:
            volume = prefix + "-" + suffix
            volumes.append(volume)
            docker("volume", "create", volume)
        database = run("postgres", "postgres:15-bookworm",
                       "--mount", f"type=volume,src={volumes[0]},dst=/var/lib/postgresql/data",
                       "--env", "POSTGRES_PASSWORD=test-database-password",
                       "--env", "POSTGRES_DB=test_installation")
        wait_for(lambda: docker("exec", database, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"), "PostgreSQL")
        common = {
            "DATABASE_URL": f"postgresql://postgres:test-database-password@{database}:5432/test_installation",
            "SECRET_KEY": "test-container-signing-key-never-live",
            "OAUTH_TOKEN_ENCRYPTION_KEY": base64.urlsafe_b64encode(b"test-installation-key-never-live").decode(),
        }

        def env_args(values):
            return [arg for key, value in values.items() for arg in ("--env", f"{key}={value}")]

        # Starting the worker first exercises its wait for backend migrations.
        worker = run("worker", f"breadwinner-worker:{tag}", *env_args(common))
        backend = run("backend", f"breadwinner-backend:{tag}",
                      "--publish", "127.0.0.1::8080",
                      "--mount", f"type=volume,src={volumes[1]},dst=/app/uploads",
                      *env_args({**common, "PORT": "8080", "ADMIN_EMAIL": "test-owner@example.com",
                                 "ADMIN_PASSWORD": "test-owner-password-123", "MEDIA_STORAGE_PATH": "/app/uploads",
                                 "REQUIRE_PERSISTENT_MEDIA": "true", "RAILWAY_VOLUME_MOUNT_PATH": "/app/uploads"}))
        api_url = "http://" + docker("port", backend, "8080/tcp")
        wait_for(lambda: api("/health/ready").get("status") == "ready", "backend readiness")

        def login():
            return api("/api/v1/auth/login/json", "POST", {
                "email": "test-owner@example.com", "password": "test-owner-password-123"
            })["access_token"]

        token = login()
        initial = api("/api/v1/installation", token=token)
        assert initial["status"] == "pending", initial
        api("/api/v1/installation", "PATCH", {"step": "providers", "status": "deferred"}, token)
        saved = api("/api/v1/installation/providers/gemini", "PUT", {"api_key": "test-container-gemini-value"}, token)
        assert saved["configured"] and saved["source"] == "application"
        assert "test-container-gemini-value" not in json.dumps(saved)
        docker("exec", backend, "python", "-c",
               "from pathlib import Path; Path('/app/uploads/test-persistence.txt').write_text('test-persistent-media')")

        def heartbeat():
            result = docker("exec", database, "psql", "-U", "postgres", "-d", "test_installation", "-Atc",
                            "SELECT worker_heartbeat_at IS NOT NULL FROM installation_state WHERE id=1")
            return result == "t"

        wait_for(heartbeat, "worker heartbeat")
        docker("restart", backend, worker)
        api_url = "http://" + docker("port", backend, "8080/tcp")
        wait_for(lambda: api("/health/ready").get("status") == "ready", "restart readiness")
        token = login()
        restarted = api("/api/v1/installation", token=token)
        assert restarted["installation_id"] == initial["installation_id"]
        assert restarted["status"] == "deferred" and restarted["step"] == "providers"
        docker("exec", backend, "python", "-c",
               "from app.services.provider_settings import require_provider_key; assert require_provider_key('gemini') == 'test-container-gemini-value'")
        with urlopen(api_url + "/uploads/test-persistence.txt", timeout=5) as response:
            assert response.read() == b"test-persistent-media"
        frontend_config = tomllib.loads(
            (Path(__file__).resolve().parents[2] / "frontend/railway.toml").read_text()
        )
        frontend = run(
            "frontend", f"breadwinner-frontend:{tag}",
            "--publish", "127.0.0.1::8080", "--env", "PORT=8080",
            "--entrypoint", "/bin/sh",
            command=("-c", frontend_config["deploy"]["startCommand"]),
        )
        frontend_url = "http://" + docker("port", frontend, "8080/tcp")

        def frontend_ready():
            with urlopen(Request(frontend_url + "/setup", headers={"Host": "healthcheck.railway.app"}), timeout=5) as response:
                return response.status == 200 and b'<div id="root">' in response.read()

        wait_for(frontend_ready, "frontend assigned port and SPA fallback")
        print("PASS: four containers, fresh migration, one-time owner, encrypted Settings key, worker heartbeat, restart, media persistence and frontend SPA.")
        print("No AI provider was contacted. Railway provisioning, HTTPS/domain wiring and live generation remain separate checks.")
    except Exception:
        for name in containers:
            subprocess.run(["docker", "logs", "--tail", "40", name], check=False)
        raise
    finally:
        failures = []
        for name in reversed(containers):
            if subprocess.run(["docker", "container", "inspect", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                subprocess.run(["docker", "stop", "--time", "10", name], stdout=subprocess.DEVNULL, check=False)
                if subprocess.run(["docker", "rm", name], stdout=subprocess.DEVNULL).returncode:
                    failures.append(name)
        for volume in volumes:
            if subprocess.run(["docker", "volume", "rm", volume], stdout=subprocess.DEVNULL).returncode:
                failures.append(volume)
        if subprocess.run(["docker", "network", "rm", network], stdout=subprocess.DEVNULL).returncode:
            failures.append(network)
        if failures:
            raise RuntimeError("Container cleanup failed: " + ", ".join(failures))


if __name__ == "__main__":
    main()
