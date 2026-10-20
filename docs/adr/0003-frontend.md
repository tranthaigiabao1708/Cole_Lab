# ADR 0003 — Frontend: React + TypeScript + Vite, vanilla CSS

- **Trạng thái:** Accepted (2026-10-21)
- **Quyết định:** Một SPA `apps/web` cho Student/Teacher/Admin. Styling bằng CSS thuần với design tokens (`tokens.css`) theo ngôn ngữ "Atlas kỹ thuật" ([10 §1](../design/10-ui-navigation-screens.md)). Không dùng Tailwind/UI kit.
- **Ràng buộc thiết kế:** whitelist icon chức năng; mọi chuỗi UI nằm trong `src/core/copy/vi.ts`; không icon mang tính AI.
