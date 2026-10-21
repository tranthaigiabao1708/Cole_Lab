from tests.conftest import login


def test_teacher_can_create_assignment_for_lesson(client):
    login(client, "teacher")

    courses_res = client.get("/api/courses")
    assert courses_res.status_code == 200
    course = courses_res.json()[0]
    course_id = course["id"]

    # Get course detail to find a lesson
    detail_res = client.get(f"/api/courses/{course_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    first_lesson = detail["modules"][0]["lessons"][0]

    payload = {
        "course_id": course_id,
        "lesson_id": first_lesson["id"],
        "title": "Lab Test Integration Builder",
        "slug": f"lab-test-{first_lesson['id'][:6]}",
        "plugin_id": "cole.cv-ok-ng",
        "assignment_type": "lab",
        "readme": "# Đề bài lab kiểm thử tự động",
        "timeout_s": 120
    }

    create_res = client.post("/api/assignments", json=payload)
    assert create_res.status_code == 200
    created = create_res.json()
    assert created["title"] == payload["title"]
    assert created["slug"] == payload["slug"]
    assert created["lesson"]["id"] == first_lesson["id"]


def test_teacher_simulators_registry(client):
    login(client, "teacher")

    # 1. List teach simulators
    res = client.get("/api/teach/simulators")
    assert res.status_code == 200
    sims = res.json()
    assert len(sims) >= 3
    cv_sim = next((s for s in sims if s["id"] == "cole.cv-ok-ng"), None)
    assert cv_sim is not None
    assert cv_sim["category"] == "cv"
    assert "default_code" in cv_sim

    # 2. Create custom domain-specific simulator for lesson
    new_sim_payload = {
        "id": "cole.b25-timeseries-forecasting",
        "name": "Dự báo phụ tải điện chuỗi thời gian B25",
        "description": "Kiểm thử mô hình ARIMA/Prophet không leak tương lai",
        "category": "timeseries",
        "mode": "python_impl",
        "image": "cole/python-cpu:0.1",
        "run_command": "python solution.py",
        "default_code": "def predict(x): return {'pred': 42}",
        "default_readme": "# Bài toán chuỗi thời gian",
    }
    create_res = client.post("/api/teach/simulators", json=new_sim_payload)
    assert create_res.status_code == 200
    created = create_res.json()
    assert created["id"] == "cole.b25-timeseries-forecasting"
    assert created["category"] == "timeseries"

    # 3. Check that it now appears in the list
    res2 = client.get("/api/teach/simulators")
    assert res2.status_code == 200
    assert any(s["id"] == "cole.b25-timeseries-forecasting" for s in res2.json())

