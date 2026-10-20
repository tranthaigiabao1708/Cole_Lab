"""Golden tests for the Excel importer against the three real syllabi (AC-01)."""
from collections import Counter

from cole_platform.modules.syllabus_import import parser


def _parse(data):
    return parser.parse_workbook(data, parser.preset(parser.detect_preset(data)))


def test_detect_presets(excel_bytes):
    assert parser.detect_preset(excel_bytes["AI"]) == "ai"
    assert parser.detect_preset(excel_bytes["DE"]) == "de"
    assert parser.detect_preset(excel_bytes["BA"]) == "ba"


def test_ai_tree(excel_bytes):
    r = _parse(excel_bytes["AI"])
    assert r["stats"]["modules"] == 7
    assert r["stats"]["lessons"] == 62
    assert [m["code"] for m in r["modules"]] == [f"M{i}" for i in range(1, 8)]
    # Vertically merged objectives go to the module, not each lesson.
    assert all(m["objectives"] for m in r["modules"])
    assert all(not ls["objectives"] for m in r["modules"] for ls in m["lessons"])
    m5 = r["modules"][4]
    assert "RAG" in m5["title"] and [ls["session_numbers"][0] for ls in m5["lessons"]] == list(range(48, 55))


def test_de_tree(excel_bytes):
    r = _parse(excel_bytes["DE"])
    assert r["stats"]["modules"] == 14
    assert r["stats"]["groups"] == 4
    assert r["stats"]["distinct_session_numbers"] == 63
    codes = Counter(w["code"] for w in r["warnings"])
    assert codes["MULTI_SESSION_ROW"] == 4
    assert codes["SUSPICIOUS_TITLE"] == 1  # 'Buổi 49 | ơ--'
    projects = [ls for m in r["modules"] for ls in m["lessons"] if ls["kind"] == "project"]
    assert len(projects) >= 3 and all(p["practice_candidate"] for p in projects)


def test_ba_tree(excel_bytes):
    r = _parse(excel_bytes["BA"])
    assert r["stats"]["modules"] == 8
    main = [m for m in r["modules"] if not m["implicit"]]
    assert sum(len(m["lessons"]) for m in main) == 25
    supplement = [m for m in r["modules"] if m["implicit"]]
    assert len(supplement) == 1 and len(supplement[0]["lessons"]) == 6
    codes = Counter(w["code"] for w in r["warnings"])
    assert codes["DUPLICATE_ROW"] == 1
    first = main[0]["lessons"][0]
    assert first["session_numbers"] == [1] and first["title"].startswith("Nghề BA")
    assert first["objectives"] and not first["objectives"].startswith("Mục tiêu")
    assert first["practice"]


def test_session_label_parsing():
    assert parser.parse_session_label("Buổi 42,43") == ([42, 43], "")
    assert parser.parse_session_label("Buổi 58, 59, 60") == ([58, 59, 60], "")
    assert parser.parse_session_label("★ Buổi 21 AI Mastery: Prompt") == ([21], "AI Mastery: Prompt")
    assert parser.parse_session_label("Buổi 1+2") == ([1, 2], "")
    assert parser.parse_session_label("Buổi 1: Nghề BA") == ([1], "Nghề BA")
