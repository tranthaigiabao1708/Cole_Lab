import os
import shutil
import tempfile
from pathlib import Path

import pytest

# Isolated var dir per test session — must be set before cole_platform is imported.
_TMP = Path(tempfile.mkdtemp(prefix="cole_test_"))
os.environ["COLE_VAR_DIR"] = str(_TMP)
os.environ["COLE_RUNNER_URL"] = "http://127.0.0.1:1"  # runner deliberately unreachable in unit tests

REPO = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def seeded():
    from cole_platform import seed

    seed.run(reset=True)
    yield
    shutil.rmtree(_TMP, ignore_errors=True)


@pytest.fixture()
def client(seeded):
    from fastapi.testclient import TestClient

    from cole_platform.main_api import app

    with TestClient(app) as c:
        yield c


def login(client, role: str):
    r = client.post("/api/auth/login", json={"email": f"{role}@cole.local", "password": "ColeDev!2026"})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture()
def excel_bytes():
    return {n: (REPO / f"{n}.xlsx").read_bytes() for n in ("AI", "DE", "BA")}
