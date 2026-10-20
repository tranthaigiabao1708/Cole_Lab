# 16 — Kế hoạch triển khai bước đầu

## 1. Đã làm trong lượt này

- Kiểm tra repository: chỉ có `AI.xlsx`, `BA.xlsx`, `DE.xlsx`; không có code, không git.
- Đọc và phân tích cấu trúc 3 file Excel ([00 §1](00-source-analysis.md)).
- Xem reel tham chiếu, rút nguyên tắc thiết kế ([00 §2](00-source-analysis.md), [10 §1](10-ui-navigation-screens.md)).
- Tạo `docs/design/` (17 tài liệu). **Không sửa/di chuyển file hiện có. Không tạo code production.**

## 2. Việc cần làm ngay sau khi duyệt tài liệu (Phase 0, tuần 1–2)

1. Họp review tài liệu; trả lời Q-01…Q-06; chốt D-01…D-06, D-23.
2. `git init`; giữ 3 file Excel ở gốc (hoặc chuyển vào `content/syllabus-sources/` **chỉ khi team đồng ý**).
3. Spike (trong `spikes/`, sẽ xóa sau Phase 0, không phải code production):
   - `spikes/ide-monaco/` và `spikes/ide-openvscode/`
   - `spikes/gvisor-sandbox/` (đo onnxruntime, sentence-transformers, pip install)
   - `spikes/excel-import/` (parse 3 file → JSON cây)
4. Viết ADR từ các quyết định đã chốt.

## 3. Danh sách file/thư mục dự kiến tạo ở Phase 1 (sau khi ADR được duyệt)

```
cole_lab/
├── README.md                                   # giới thiệu, cách chạy dev
├── CODEOWNERS
├── .gitignore · .editorconfig
├── .github/workflows/ci.yml                    # lint + test BE/FE + schema validate
├── docs/
│   ├── adr/0001-backend-stack.md … 0008-*.md
│   └── copy/vi.yaml                            # copy deck UI
├── infra/compose/docker-compose.dev.yml        # postgres, valkey, minio(dev), api, worker, web
├── sdk/contracts/
│   ├── simulator.v1/{run-spec,events,result,plugin-manifest,validation-report}.schema.json
│   ├── submission/v1/{submission-contract,submission-manifest}.schema.json
│   └── assignment-package/v1/{assignment,simulator-profile}.schema.json
├── tools/codegen/                              # sinh Pydantic + TS từ contracts
├── backend/
│   ├── pyproject.toml
│   ├── src/platform/{main_api.py,main_worker.py}
│   ├── src/platform/kernel/{config,db,auth,rbac,audit,logging,errors,storage}.py
│   ├── src/platform/modules/{identity,organizations,catalog,syllabus_import}/
│   ├── migrations/
│   └── tests/{unit,integration}/ + fixtures (3 file Excel)
├── apps/web/
│   ├── package.json · vite.config.ts · tsconfig.json
│   ├── src/core/design-system/{tokens.css,typography.css,icons.ts,components/}
│   ├── src/core/{shell,routing,auth,api}/
│   ├── src/features/{catalog,syllabus-import}/
│   ├── src/tracks/{ai,de,ba}/config.ts
│   └── tests/
└── content/courses/{ai-engineer,data-engineer,business-analyst}/course.yaml
```

Phase 2–5 bổ sung `runtime/`, `simulators/`, `content/assignments/` theo [07](07-repository-structure.md).

## 4. Định nghĩa "Done" cho mỗi PR
- Có test tương ứng tầng ([14 §2](14-test-plan-acceptance.md)); CI xanh.
- Không chuỗi UI cứng; không icon ngoài whitelist.
- Thay đổi `sdk/contracts/` có review của platform team + cập nhật CHANGELOG.
- Thay đổi ảnh hưởng bảo mật có review của OPS/Sec.
