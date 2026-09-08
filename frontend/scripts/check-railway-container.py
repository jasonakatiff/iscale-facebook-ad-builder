"""Start the built frontend with Railway's configured command and health host."""
import os
from pathlib import Path
import shlex
import subprocess
import sys
import time
import tomllib
from urllib.request import Request, urlopen


def main():
    name = f"test-railway-frontend-{os.getpid()}"
    config = tomllib.loads(Path("railway.toml").read_text())
    command = shlex.split(config["deploy"]["startCommand"])
    try:
        subprocess.run([
            "docker", "run", "--detach", "--name", name,
            "--publish", "127.0.0.1::8080", "--env", "PORT=8080",
            "--env", "PREVIEW_ALLOWED_HOSTS=breadwinner.a4d.com", sys.argv[1], *command,
        ], check=True, stdout=subprocess.DEVNULL)
        address = subprocess.check_output(["docker", "port", name, "8080/tcp"], text=True).strip()
        for attempt in range(30):
            try:
                for host in ["healthcheck.railway.app", "breadwinner.a4d.com"]:
                    with urlopen(Request(f"http://{address}/", headers={"Host": host}), timeout=2) as response:
                        assert response.status == 200
                        assert b'<div id="root">' in response.read()
                print("Railway command serves the assigned port, health hostname and custom domain")
                return
            except (OSError, AssertionError):
                if attempt == 29:
                    subprocess.run(["docker", "logs", name], check=False)
                    raise
                time.sleep(1)
    finally:
        subprocess.run(["docker", "stop", "--time", "5", name], check=False, stdout=subprocess.DEVNULL)
        subprocess.run(["docker", "rm", name], check=False, stdout=subprocess.DEVNULL)


if __name__ == "__main__":
    main()
