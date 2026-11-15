# ADR-001: Monorepo với hai package độc lập

- **Trạng thái:** Accepted
- **Ngày:** 2026-11-03

## Bối cảnh
Đề bài yêu cầu một repository có `apps/web`, `apps/api` và `docs`. Tài liệu, sơ đồ và mã nguồn phải có lịch sử thay đổi chung để truy vết yêu cầu đến code và test.

## Quyết định
Dùng một monorepo gồm `apps/web` (Next.js) và `apps/api` (NestJS), mỗi bên có `package.json` riêng. Không dùng công cụ quản lý monorepo (Nx, Turborepo, pnpm workspaces).

## Hệ quả
- Một pull request có thể sửa đồng thời yêu cầu, sơ đồ và code, giúp truy vết dễ.
- Cài đặt và chạy mỗi app độc lập, ít cấu hình phức tạp cho nhóm mới làm quen.
- CI chạy hai job song song (web, api).
- Hạn chế: không chia sẻ code (kiểu dữ liệu) tự động giữa web và api; chấp nhận khai báo lặp lại kiểu cần thiết.

## Phương án đã xem xét
- **Hai repository riêng:** tách biệt rõ nhưng khó truy vết, khó đồng bộ tài liệu.
- **Monorepo có Nx/Turborepo:** chia sẻ code tốt hơn nhưng tăng độ phức tạp, không cần thiết cho MVP.
