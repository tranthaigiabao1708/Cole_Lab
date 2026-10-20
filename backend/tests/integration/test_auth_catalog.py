"""Auth, RBAC and catalog visibility (Phase 1 acceptance)."""
from conftest import login


def test_login_and_me(client):
    login(client, "student")
    me = client.get("/api/auth/me").json()
    assert me["role"] == "student"


def test_bad_password(client):
    r = client.post("/api/auth/login", json={"email": "student@cole.local", "password": "nope"})
    assert r.status_code == 401 and r.json()["detail"]["code"] == "INVALID_CREDENTIALS"


def test_unauthenticated(client):
    client.cookies.clear()
    assert client.get("/api/courses").status_code == 401


def test_student_sees_three_tracks_with_execution_status(client):
    login(client, "student")
    courses = client.get("/api/courses").json()
    by_track = {c["track"]: c for c in courses}
    assert set(by_track) == {"AI_ENGINEER", "DATA_ENGINEER", "BUSINESS_ANALYST"}
    assert by_track["AI_ENGINEER"]["execution_status"] == "active"
    assert by_track["DATA_ENGINEER"]["execution_status"] == "planned"
    assert by_track["BUSINESS_ANALYST"]["execution_status"] == "planned"
    assert by_track["AI_ENGINEER"]["stats"]["lessons"] == 62


def test_student_cannot_use_teacher_or_admin_api(client):
    login(client, "student")
    assert client.get("/api/teach/imports").status_code == 403
    assert client.get("/api/admin/users").status_code == 403


def test_teacher_cannot_use_admin_api(client):
    login(client, "teacher")
    assert client.get("/api/admin/users").status_code == 403
    assert client.get("/api/teach/imports").status_code == 200


def test_import_rejects_non_xlsx(client):
    login(client, "teacher")
    r = client.post("/api/teach/imports", files={"file": ("evil.xlsm", b"PK\x03\x04", "application/octet-stream")})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "UNSUPPORTED_FILE"
    r = client.post("/api/teach/imports", files={"file": ("x.xlsx", b"not a zip", "application/octet-stream")})
    assert r.json()["detail"]["code"] == "INVALID_XLSX"


def test_import_edit_rows_and_publish(client, excel_bytes):
    login(client, "teacher")
    r = client.post("/api/teach/imports", files={"file": ("DE.xlsx", excel_bytes["DE"], "application/octet-stream")})
    assert r.status_code == 200, r.text
    imp = r.json()
    target = next(x for x in imp["rows"] if x["type"] == "SESSION")
    r = client.patch(f"/api/teach/imports/{imp['id']}/rows", json={"changes": [{"row": target["row"], "type": "IGNORE"}]})
    assert r.json()["stats"]["lessons"] == imp["stats"]["lessons"] - 1
    r = client.post(f"/api/teach/imports/{imp['id']}/publish",
                    json={"track": "DATA_ENGINEER", "title": "DE bản thử", "slug": "de-test-import"})
    assert r.status_code == 200, r.text
    course = client.get(f"/api/courses/{r.json()['course_id']}").json()
    assert course["execution_status"] == "planned" and len(course["modules"]) == 14
    # Published import is immutable
    r = client.patch(f"/api/teach/imports/{imp['id']}/rows", json={"changes": []})
    assert r.json()["detail"]["code"] == "ALREADY_PUBLISHED"


def test_admin_audit_records_login(client):
    login(client, "admin")
    events = client.get("/api/admin/audit?action=auth.").json()
    assert any(e["action"] == "auth.login" for e in events)
