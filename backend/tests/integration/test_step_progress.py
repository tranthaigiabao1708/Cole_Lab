from tests.conftest import login


def test_workspace_step_progress_and_rubric(client, seeded):
    # 1. Login as learner
    login(client, "student")

    # 2. Get an assignment from course
    courses_res = client.get("/api/courses")
    assert courses_res.status_code == 200
    course_id = courses_res.json()[0]["id"]

    detail_res = client.get(f"/api/courses/{course_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert len(detail["assignments"]) > 0
    asg = detail["assignments"][0]

    # 3. Open workspace
    ws_res = client.post(f"/api/assignments/{asg['id']}/workspace")
    assert ws_res.status_code == 200
    ws = ws_res.json()
    assert "rubric" in ws
    assert "plugin_id" in ws
    ws_id = ws["id"]

    # 4. Check steps progress
    steps_res = client.get(f"/api/workspaces/{ws_id}/steps")
    assert steps_res.status_code == 200
    steps = steps_res.json()
    assert isinstance(steps, list)

    # 5. Update progress for a step
    step_id = "step_1"
    update_res = client.post(
        f"/api/workspaces/{ws_id}/steps/{step_id}/progress",
        json={"status": "passed", "time_spent_seconds": 150},
    )
    assert update_res.status_code == 200
    data = update_res.json()
    assert data["step_id"] == step_id
    assert data["status"] == "passed"
    assert data["time_spent_seconds"] >= 150

    # 6. Unlock hint
    hint_res = client.post(
        f"/api/workspaces/{ws_id}/steps/{step_id}/unlock-hint",
        json={"level": 2},
    )
    assert hint_res.status_code == 200
    hdata = hint_res.json()
    assert hdata["hints_unlocked_level"] == 2

    # 7. Test scaffold endpoint (Step 0)
    login(client, "student")
    scaffold_res = client.post(
        f"/api/workspaces/{ws_id}/scaffold",
        json={"files": ["solution/preprocess.py", "configs/threshold.json"]},
    )
    assert scaffold_res.status_code == 200
    s_data = scaffold_res.json()
    assert s_data["status"] == "ok"
    assert "solution/preprocess.py" in s_data["created"]

    # 8. Test AI Tutor consultation endpoint
    tutor_res = client.post(
        f"/api/workspaces/{ws_id}/ai-tutor",
        json={
            "step_id": "step_0_scaffold",
            "question": "Cấu trúc thư mục của tôi đã đủ chưa?",
            "active_file": "solution/preprocess.py",
            "current_code": "def preprocess(img):\n    return img\n",
            "tree_files": ["solution/preprocess.py", "configs/threshold.json"],
        },
    )
    assert tutor_res.status_code == 200
    tutor_data = tutor_res.json()
    assert "reply" in tutor_data
    assert len(tutor_data["reply"]) > 0

    # 9. Login as teacher and check class progress
    login(client, "teacher")
    class_res = client.get(f"/api/teach/assignments/{asg['id']}/class-progress")
    assert class_res.status_code == 200
    class_data = class_res.json()
    assert "learners" in class_data
    assert class_data["total_learners"] >= 1

