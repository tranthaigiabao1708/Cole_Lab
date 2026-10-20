# 07 — Cấu trúc repository

**[ĐỀ XUẤT]** Monorepo, modular monolith. Một thư mục ≠ một microservice. Chỉ có 3 tiến trình triển khai riêng: `api`, `worker` (cùng codebase `backend/`), `runner-agent` (`runtime/runner/`). Plugin là image riêng nhưng không phải "service" chạy thường trực.

## 1. Cây thư mục

```
cole_lab/
├── README.md
├── CODEOWNERS                       # ranh giới review: platform vs simulators vs content
├── .github/workflows/               # CI: lint, test, contract-compat, build images, security scan
│
├── docs/
│   ├── design/                      # bộ tài liệu này
│   ├── adr/                         # Architecture Decision Records: 0001-backend-stack.md …
│   ├── runbooks/                    # vận hành: dọn container treo, xoay key LLM gateway…
│   └── copy/                        # copy deck UI đã duyệt (vi.yaml, en.yaml) — xem 10 §1.6
│
├── apps/
│   └── web/                         # 1 SPA cho cả Student/Teacher/Admin (route theo vai trò)
│       ├── src/core/                # shell, routing, auth, API client (sinh từ OpenAPI), design system
│       │   ├── design-system/       # tokens.css, typography, components (Button, Table, StatusBlock…)
│       │   └── simulator-host/      # renderer registry + generic-table@1 + RatingControl
│       ├── src/features/            # catalog, syllabus-import, assignments, workspace, submissions, runs, admin
│       ├── src/tracks/              # cấu hình hiển thị theo track: ai/, de/, ba/ (DE/BA = planned)
│       └── tests/                   # unit (Vitest) + component
│
├── backend/                         # FastAPI modular monolith (api + worker)
│   ├── pyproject.toml
│   ├── src/platform/
│   │   ├── main_api.py              # entrypoint API
│   │   ├── main_worker.py           # entrypoint orchestrator worker
│   │   ├── kernel/                  # config, db session, auth, rbac, audit, logging, errors, storage
│   │   └── modules/                 # mỗi module: api.py, service.py, models.py, schemas.py, repo.py
│   │       ├── identity/            # user, role, membership, session
│   │       ├── organizations/
│   │       ├── catalog/             # course, module, lesson
│   │       ├── syllabus_import/     # excel parser, mapping profile, row classifier, draft
│   │       ├── assignments/         # assignment, version, template, contract, profile, publish
│   │       ├── content/             # dataset, testset, testcase, file objects
│   │       ├── workspaces/          # lifecycle, WS proxy tới workspace-agent
│   │       ├── submissions/         # manifest, snapshot, validation
│   │       ├── runs/                # state machine, orchestrator, SSE
│   │       ├── evaluations/         # rating, comment, grade
│   │       ├── plugins/             # registry, version, enable/disable, compat report
│   │       └── llm_gateway_admin/   # cấp/thu hồi virtual key (gọi gateway)
│   ├── migrations/                  # Alembic
│   └── tests/                       # unit, integration (testcontainers Postgres)
│
├── runtime/                         # execution plane — KHÔNG chứa nghiệp vụ bài tập
│   ├── runner/                      # runner-agent: API mTLS, tạo/hủy container, quota, reaper
│   ├── workspace-agent/             # chạy trong workspace container: FS API, PTY, process, ripgrep
│   ├── images/
│   │   ├── workspace-python-cpu/    # Dockerfile base workspace (Python 3.11 + toolchain)
│   │   ├── subject-python-cpu/      # base cho subject container
│   │   └── profiles.yaml            # runtime profiles: python-cpu (active), vscode (spike), sql-sandbox (planned)
│   ├── policies/                    # seccomp, gVisor config, network policies, egress allowlist
│   └── tests/                       # escape tests, quota tests
│
├── sdk/                             # dùng chung giữa lõi và plugin — thay đổi cần platform review
│   ├── contracts/                   # JSON Schema: NGUỒN SỰ THẬT
│   │   ├── simulator.v1/            # run-spec, events, result, plugin-manifest, validation-report
│   │   ├── submission/v1/           # submission-contract, submission-manifest
│   │   └── assignment-package/v1/   # assignment.yaml, simulator-profile envelope
│   ├── python/cole_sim_sdk/         # SDK cho plugin (Python)
│   ├── typescript/                  # type sinh từ contracts cho FE
│   ├── testkit/                     # chạy plugin local, contract tests dùng chung
│   └── CHANGELOG.md
│
├── simulators/                      # mỗi plugin độc lập, có image riêng
│   ├── _template/                   # scaffold cho plugin mới
│   ├── cv-ok-ng/                    # plugin.yaml, Dockerfile, src/, schemas/, ui/, fixtures/, tests/, README
│   ├── rag-chatbot/
│   └── echo-sample/                 # plugin chứng minh mở rộng (không có ui/)
│
├── content/                         # assignment packages + course seed (dữ liệu, không phải code lõi)
│   ├── courses/
│   │   ├── ai-engineer/course.yaml  # tham chiếu file Excel nguồn + mapping profile
│   │   ├── data-engineer/course.yaml
│   │   └── business-analyst/course.yaml
│   ├── syllabus-sources/            # bản sao AI.xlsx, DE.xlsx, BA.xlsx dùng làm fixture
│   └── assignments/
│       ├── ai-cv-ok-ng-inspection/
│       │   ├── assignment.yaml
│       │   ├── README.md            # đề bài cho học viên
│       │   ├── docs/                # tài liệu nghiệp vụ
│       │   ├── project-template/    # cấu trúc gợi ý cho workspace
│       │   ├── datasets/            # dataset.yaml (con trỏ object storage), KHÔNG commit file lớn
│       │   ├── test-cases/          # testset.yaml (con trỏ), nhãn chuẩn nằm ở storage riêng
│       │   ├── submission-contract.yaml
│       │   └── simulator-profile.yaml
│       ├── ai-rag-enterprise-chatbot/
│       └── ai-echo-sample/
│
├── infra/
│   ├── compose/                     # docker-compose.dev.yml, docker-compose.poc.yml
│   ├── sandbox-host/                # cài gVisor, Docker daemon config, firewall (Ansible/script)
│   ├── observability/               # Prometheus, Grafana dashboards, Loki
│   └── k8s/                         # (sau POC) Helm charts
│
├── tools/
│   ├── codegen/                     # JSON Schema → Pydantic / TypeScript
│   ├── package-cli/                 # validate / pack / import assignment package
│   └── seed/                        # seed dữ liệu demo
│
└── tests/                           # kiểm thử xuyên hệ thống
    ├── e2e/                         # Playwright: luồng teacher/student
    ├── contract-compat/             # lõi × mọi plugin fixture
    ├── security/                    # sandbox escape, SSRF, secret leak
    └── load/                        # k6: nhiều run đồng thời
```

## 2. Đối chiếu với cấu trúc logic trong brief

| Brief | Repo đề xuất | Ghi chú |
|---|---|---|
| `courses/`, `modules/` | `backend/.../catalog` + `content/courses` | Dữ liệu sống trong DB; `content/` chỉ là seed/import |
| `assignments/<id>/…` | `content/assignments/<id>/…` | Giữ nguyên bố cục brief = **assignment package v1** |
| `simulator-sdk/` | `sdk/` | Thêm `contracts/` là nguồn sự thật |
| `simulators/` | `simulators/` | Thêm `_template/`, `echo-sample/` |
| `runtime/job-manager` | `backend/.../runs` (orchestrator) + `runtime/runner` | Tách: điều phối (tin cậy) vs thực thi (không tin cậy) |
| `apps/student-portal`, `teacher-portal`, `admin-portal` | `apps/web` một SPA | Chung design system, auth; tách lại khi có lý do (vd domain riêng) |
| `services/*-service` | `backend/src/platform/modules/*` | Module trong monolith, ranh giới qua `service.py` public |
| `shared/` | `backend/.../kernel` + `sdk/contracts` | |

## 3. Quy tắc phụ thuộc

- `modules/X` chỉ gọi `modules/Y` qua `Y.service` (không import `Y.models` trực tiếp). Kiểm tra bằng `import-linter` trong CI.
- `backend/` không import gì từ `simulators/`. `simulators/` chỉ phụ thuộc `sdk/`.
- `runtime/` không import `backend/`; giao tiếp qua API mTLS và spec đã ký.
- `apps/web/src/core` không import `simulators/*/ui`; registry nạp qua alias build `@simulators/*`.

## 4. Quy tắc đặt tên

| Đối tượng | Quy tắc | Ví dụ |
|---|---|---|
| Thư mục | kebab-case | `cv-ok-ng`, `syllabus-import` (Python package dùng snake_case) |
| Plugin id | `<org>.<kebab>` | `cole.rag-chatbot` |
| Assignment slug | `<track>-<kebab>` | `ai-cv-ok-ng-inspection` |
| Track code | UPPER_SNAKE | `AI_ENGINEER`, `DATA_ENGINEER`, `BUSINESS_ANALYST` |
| Contract | `<domain>.v<major>` | `simulator.v1`, `submission/v1` |
| ID trong DB | ULID có tiền tố | `run_01J…`, `sub_01J…` |
| Renderer | `<name>@<major>` | `rag-chat@1` |
| Image | `simulators/<id>:<semver>` + digest | `simulators/cv-ok-ng:1.2.0` |
| Biến môi trường | `COLE_<MODULE>_<NAME>` | `COLE_RUNNER_MAX_CONCURRENCY` |

## 5. Ai cung cấp file nào

| Loại file | Thuộc | Người tạo | Nơi lưu khi vận hành |
|---|---|---|---|
| `backend/`, `apps/`, `runtime/`, `sdk/`, `infra/` | Nền tảng | Platform team | Git |
| `simulators/<id>/` | Plugin | Team kỹ thuật (simulator owner) | Git + image registry |
| `assignment.yaml`, `README.md`, `docs/` | Bài tập | Teacher | DB + object storage (package trong Git chỉ là seed) |
| `project-template/` | Bài tập | Teacher | Object storage (tar, sha256) |
| `datasets/`, `test-cases/` (file + nhãn) | Bài tập | Teacher | Object storage; bucket nhãn chuẩn tách quyền |
| `submission-contract.yaml`, `simulator-profile.yaml` | Bài tập | Teacher (qua builder UI) | DB, gắn AssignmentVersion |
| Code, model, `submission.manifest.yaml` | Bài nộp | Student (manifest do UI sinh) | Workspace volume → snapshot object storage |
| Log, `result.json`, attachment | Run | Hệ thống | Object storage + tóm tắt trong DB |
| File Excel đề cương | Chương trình | Teacher | Object storage (bản gốc) + DB (đã chuẩn hóa) |
