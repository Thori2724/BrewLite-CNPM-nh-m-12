# ADR-007: CI/CD bằng GitHub Actions

- **Trạng thái:** Accepted
- **Ngày:** 2026-11-03

## Bối cảnh
Đề bài yêu cầu CI chạy khi mở pull request (Install → Lint → Unit Test → Build) và pipeline CD (lint/test → build image → push registry → deploy → migration → smoke test → rollback). Mã nguồn đã nằm trên GitHub.

## Quyết định
**CI (`.github/workflows/ci.yml`)** chạy khi mở/cập nhật pull request: Install → Lint → Unit Test → Build cho cả `apps/web` và `apps/api`. Bật branch protection: không merge nếu CI thất bại.

**CD (`.github/workflows/deploy.yml`)** chạy khi push tag phiên bản (hoặc đẩy lên `main`):
1. Quality gate: lint, test, build.
2. Build Docker image cho `web` và `api`, tag bằng commit SHA (và semantic version nếu có tag).
3. Đăng nhập ECR và push image.
4. Deploy: dùng AWS Systems Manager Run Command để EC2 pull image mới và chạy `docker compose up -d`.
5. Sao lưu DB (`pg_dump`) rồi chạy `prisma migrate deploy` bằng container một lần.
6. Smoke test: gọi `GET /health` và trang chủ qua URL production; thất bại thì dừng pipeline.
7. **Rollback:** workflow chạy thủ công (`workflow_dispatch`) nhận tag image cũ rồi triển khai lại.

Xác thực AWS bằng IAM user quyền tối thiểu, khóa lưu trong GitHub Secrets (OIDC là hướng nâng cấp). Không in secret ra log.

## Hệ quả
- Mọi phiên bản production truy vết được về một commit SHA.
- Triển khai lặp lại được, không cần SSH thủ công.
- Hạn chế: khóa IAM dài hạn trong GitHub Secrets rủi ro hơn OIDC; rollback chỉ đưa ứng dụng về bản cũ, không tự đảo migration (vì migration viết tương thích ngược).

## Phương án đã xem xét
- **AWS CodePipeline/CodeBuild:** nằm trong AWS nhưng tách khỏi GitHub nơi lưu PR và lịch sử, thêm cấu hình.
- **Deploy qua SSH:** đơn giản hơn nhưng phải mở cổng 22 và giữ khóa riêng trong CI.
