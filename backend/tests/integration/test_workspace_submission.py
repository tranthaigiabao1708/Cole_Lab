"""Phase 2: assignments, workspace files, manifest validation, submissions (runner not required)."""
from tests.conftest import login


def _echo(client):
    courses = client.get("/api/courses").json()
    ai = next(c for c in courses if c["track"] == "AI_ENGINEER")
    detail = client.get(f"/api/courses/{ai['id']}").json()
    return next(a for a in detail["assignments"] if a["slug"] == "ai-echo-sample")


def test_student_sees_assignment_without_hidden_fields(client):
    login(client, "student")
    a = _echo(client)
    d = client.get(f"/api/assignments/{a['id']}").json()
    assert d["testset"]["count"] == 10
    assert "profile" not in d
    cases = client.get(f"/api/assignments/{a['id']}/testcases").json()
    # visibility after_run => nothing exposed before a run
    assert all("expected" not in c and "input" not in c for c in cases)


def test_teacher_sees_expected(client):
    login(client, "teacher")
    a = _echo(client)
    cases = client.get(f"/api/assignments/{a['id']}/testcases").json()
    assert cases[0]["expected"] == {"text": "xin chào"}


def test_de_course_has_no_assignments(client):
    login(client, "student")
    de = next(c for c in client.get("/api/courses").json() if c["track"] == "DATA_ENGINEER")
    assert client.get(f"/api/courses/{de['id']}").json()["assignments"] == []


def test_workspace_files_and_submit_flow(client):
    login(client, "student")
    a = _echo(client)
    ws = client.post(f"/api/assignments/{a['id']}/workspace").json()
    wid = ws["id"]
    tree = client.get(f"/api/workspaces/{wid}/files/tree").json()
    paths = {t["path"] for t in tree}
    assert {"solution/normalize.py", "run_local.py", "data/samples.jsonl"} <= paths
    assert next(t for t in tree if t["path"] == "data/samples.jsonl")["readonly"] is True

    # traversal + read-only protections
    for bad in ("../x", "/etc/passwd", "C:/x", "solution/../../x"):
        r = client.get(f"/api/workspaces/{wid}/files/content", params={"path": bad})
        assert r.status_code == 400, bad
        assert r.json()["detail"]["code"] == "PATH_OUTSIDE_WORKSPACE"
    r = client.put(f"/api/workspaces/{wid}/files/content", json={"path": "data/hack.txt", "content": "x"})
    assert r.status_code == 403

    code = ("import re, unicodedata\n\n"
            "def predict(input):\n"
            "    t = unicodedata.normalize('NFC', input.get('text', '')).lower()\n"
            "    return {'text': re.sub(r'\\s+', ' ', t).strip()}\n")
    assert client.put(f"/api/workspaces/{wid}/files/content",
                      json={"path": "solution/normalize.py", "content": code}).status_code == 200
    assert client.get(f"/api/workspaces/{wid}/files/content",
                      params={"path": "solution/normalize.py"}).json()["content"] == code

    # manifest: wrong entry -> ENTRY_INVALID
    bad = {"artifacts": {"entry": {"entry": "solution.normalize:nope"}}}
    rep = client.put(f"/api/workspaces/{wid}/manifest", json={"manifest": bad}).json()["report"]
    assert rep["status"] == "invalid" and rep["errors"][0]["code"] == "ENTRY_INVALID"
    r = client.post(f"/api/workspaces/{wid}/submit", json={})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "SUBMISSION_INVALID"

    good = {"artifacts": {"entry": {"entry": "solution.normalize:predict"}, "report": {"path": "REPORT.md"}}}
    rep = client.put(f"/api/workspaces/{wid}/manifest", json={"manifest": good}).json()["report"]
    assert rep["status"] == "valid", rep

    s1 = client.post(f"/api/workspaces/{wid}/submit", json={}).json()
    s2 = client.post(f"/api/workspaces/{wid}/submit", json={}).json()
    assert (s1["seq"], s2["seq"]) == (1, 2)
    assert s1["sha256"] == s2["sha256"]  # deterministic snapshot
    hist = client.get("/api/submissions", params={"assignment_id": a["id"]}).json()
    assert [h["seq"] for h in hist][:2] == [2, 1]

    # another student cannot see it; teacher can
    login(client, "teacher")
    assert client.get(f"/api/submissions/{s1['id']}").status_code == 200
    assert client.put(f"/api/workspaces/{wid}/files/content",
                      json={"path": "x.py", "content": ""}).status_code == 404  # teacher is read-only


def test_format_mismatch(client):
    login(client, "student")
    a = _echo(client)
    wid = client.post(f"/api/assignments/{a['id']}/workspace").json()["id"]
    client.post(f"/api/workspaces/{wid}/files/upload", data={"path": "REPORT.md"},
                files={"file": ("REPORT.md", b"\x00\x01\x02binary", "application/octet-stream")})
    m = {"artifacts": {"entry": {"entry": "solution.normalize:predict"}, "report": {"path": "REPORT.md"}}}
    rep = client.put(f"/api/workspaces/{wid}/manifest", json={"manifest": m}).json()["report"]
    assert any(e["code"] == "FORMAT_MISMATCH" for e in rep["errors"])
