import pytest
from sqlalchemy import select
from conftest import login
from cole_platform.kernel.db import SessionLocal
from cole_platform.modules.identity.models import User
from cole_platform.modules.plugins.service import scan_and_register
from cole_platform.modules.plugins.models import PluginVersion
from cole_platform.modules.assignments.package import import_all
from cole_platform.modules.assignments.models import Assignment
from cole_platform.modules.runs.models import Run
from cole_platform.modules.llm_gateway.service import create_virtual_key, handle_chat_completion, get_key_by_secret
from cole_platform.modules.evaluations.service import save_evaluation, get_evaluations_for_run


def test_rag_plugin_registered(seeded):
    with SessionLocal() as db:
        res = scan_and_register(db)
        assert any(r["plugin"] == "cole.rag-chatbot" for r in res)

        pv = db.scalar(
            select(PluginVersion).where(
                PluginVersion.plugin_id == "cole.rag-chatbot",
                PluginVersion.version == "1.0.0",
            )
        )
        assert pv is not None
        assert pv.renderer == "rag-chat@1"


def test_rag_assignment_imported(seeded):
    with SessionLocal() as db:
        lines = list(import_all(db))
        assert any("ai-rag-enterprise-chatbot" in line for line in lines)
        a = db.scalar(select(Assignment).where(Assignment.slug == "ai-rag-enterprise-chatbot"))
        assert a is not None
        assert a.title == "Trợ lý RAG tra cứu quy chế và chính sách doanh nghiệp"


def test_llm_gateway_virtual_key_and_mock(seeded):
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "student@cole.local"))
        assert user is not None

        raw_key, vk = create_virtual_key(db, user_id=user.id, budget_usd=0.50)
        assert raw_key.startswith("cole_vk_")
        assert vk.budget_usd == 0.50
        assert vk.spent_usd == 0.0

        found = get_key_by_secret(db, raw_key)
        assert found is not None
        assert found.id == vk.id

        res = handle_chat_completion(
            db=db,
            raw_key=raw_key,
            model="mock-gpt",
            messages=[{"role": "user", "content": "Khách hàng VIP đổi trả sau 10 ngày có được hoàn tiền không?"}],
        )
        assert "choices" in res
        ans = res["choices"][0]["message"]["content"]
        assert "vip" in ans.lower() or "đổi" in ans.lower()
        assert res["usage"]["cost_usd"] > 0
        assert vk.spent_usd > 0


def test_evaluations_service(seeded):
    with SessionLocal() as db:
        user = db.scalar(select(UserAccount).where(UserAccount.email == "student@cole.local"))
        run = db.scalar(select(Run))
        assert user is not None

        run_id = run.id if run else "run_dummy"
        if not run:
            from cole_platform.kernel.ids import new_id
            from cole_platform.modules.catalog.models import Course
            run = Run(
                id=new_id("run"),
                assignment_id="asg_dummy",
                assignment_version_id="asv_dummy",
                plugin_version_id="plv_dummy",
                user_id=user.id,
                mode="run",
                status="succeeded",
            )
            db.add(run)
            db.commit()
            run_id = run.id

        ev = save_evaluation(
            db=db,
            user_id=user.id,
            run_id=run_id,
            case_key="tc_001",
            rating=5,
            feedback="Trả lời đầy đủ và chính xác theo mục 3.1.",
        )
        assert ev.rating == 5
        assert ev.case_key == "tc_001"

        data = get_evaluations_for_run(db, run_id)
        assert data["summary"]["evaluated_count"] == 1
        assert data["summary"]["average_rating"] == 5.0
        assert data["summary"]["distribution"][5] == 1
