# ADR-007: CI/CD bằng GitHub Actions và Triển khai Render

- **Trạng thái:** Accepted
- **Ngày tạo:** 2026-11-03
- **Cập nhật:** 2026-11-10 (Đồng bộ theo ADR-009: Chuyển hạ tầng triển khai sang Render và Container Registry sang GHCR)

## Bối cảnh
Đề bài yêu cầu hệ thống tự động hóa kiểm thử và triển khai liên tục gồm:
1. **CI (Continuous Integration):** Chạy tự động khi mở hoặc cập nhật Pull Request (`Install` → `Lint` → `Unit Test` → `Build`) để bảo vệ nhánh chính và đảm bảo chất lượng code.
2. **CD (Continuous Delivery/Deployment):** Triển khai tự động theo chu trình đầy đủ của Task 5.3:
   `Push/Tag` → `Lint và Test` → `Build` → `Docker Image Push Registry` → `Deploy` → `Smoke Test` kèm cơ chế rollback khi sự cố.

Trước đây nhóm dự kiến dùng AWS ECR và SSM. Sau khi thống nhất chuyển sang nền tảng Render theo ADR-009, kiến trúc CI/CD được chuẩn hóa lại để phù hợp với PaaS Render và dịch vụ GitHub.

## Quyết định

### 1. Quy trình CI (`.github/workflows/ci.yml`)
- Kích hoạt khi mở hoặc đẩy commit lên Pull Request trỏ vào nhánh `some-diagram-and-SRS` hoặc `main`.
- Chạy 2 job độc lập cho `apps/api` và `apps/web`:
  - Thiết lập môi trường Node.js 26.13.0 và npm 11.20.0 đồng nhất với môi trường phát triển của nhóm.
  - Chạy đầy đủ: `npm ci` → `npm run lint` → `npm test` → `npm run build`.
- Thiết lập Branch Protection Rule trên GitHub: Pull Request bắt buộc phải vượt qua toàn bộ các bước CI (CI xanh) mới được phép gộp (merge).

### 2. Quy trình CD (`.github/workflows/cd.yml`)
- Kích hoạt khi:
  - Push Git Tag phiên bản (định dạng `v*` hoặc `v*.*.*`).
  - Push commit lên nhánh ghép chung `some-diagram-and-SRS` hoặc nhánh phát hành `main`.
  - Kích hoạt thủ công (`workflow_dispatch`).
- Các giai đoạn thực thi tuần tự và điều kiện dừng:
  1. **Quality Gate:** Kiểm tra lại toàn diện lint, test và build cho cả API và Web. Bất kỳ lỗi nào cũng dừng pipeline ngay lập tức.
  2. **Docker Registry (GHCR):** Đóng gói Docker image cho API và Web, gắn nhãn (tag) bằng commit SHA (`sha-<commit>`), `latest` và semantic version (nếu có tag), đẩy lên **GitHub Container Registry (`ghcr.io`)** bằng `GITHUB_TOKEN` với quyền `packages: write`.
  3. **Database Migration:** Tách biệt hoàn toàn khỏi container API lúc khởi động. Chạy lệnh `npx prisma migrate deploy` trên môi trường CI kết nối an toàn tới database PostgreSQL production thông qua bí mật `RENDER_EXTERNAL_DATABASE_URL`. Nếu migration thất bại, pipeline dừng ngay lập tức và KHÔNG deploy mã nguồn mới.
  4. **Deploy lên Render:** Kích hoạt triển khai Render thông qua Render Deploy Hook (`RENDER_API_DEPLOY_HOOK` và `RENDER_WEB_DEPLOY_HOOK`).
  5. **Smoke Test (`/health`):** Tự động gửi request kiểm tra endpoint `GET /health` của API và trang chủ Web trên production. Do dịch vụ miễn phí có thời gian khởi động (cold start), smoke test được trang bị vòng lặp thử lại (retry) thông minh. Nếu sau các lần thử dịch vụ không trả về HTTP 200 OK, pipeline sẽ đánh dấu thất bại để cảnh báo rollback.

### 3. Cơ chế Rollback (`.github/workflows/rollback.yml` và Render Dashboard)
- Cung cấp workflow chạy thủ công `rollback.yml` với yêu cầu nhập bắt buộc lý do sự cố và mã commit cần khôi phục.
- Hỗ trợ cơ chế Rollback nhanh 1-click trên Render Dashboard (`Service` → `Deploys` → `Re-deploy a previous deploy`).
- Đối với database: Cung cấp hướng dẫn sử dụng `npx prisma migrate resolve` hoặc áp dụng migration tương thích ngược (expand-contract) thông qua kết nối cơ sở dữ liệu an toàn.

### 4. Quản lý Secret
- Tuyệt đối không commit secret hay file `.env` vào kho mã nguồn.
- Tất cả khóa bảo mật được lưu trữ trong **GitHub Actions Secrets**:
  - `RENDER_EXTERNAL_DATABASE_URL`: Kết nối bảo mật chạy migration từ xa.
  - `RENDER_API_DEPLOY_HOOK` & `RENDER_WEB_DEPLOY_HOOK`: URL kích hoạt triển khai dịch vụ Render.
  - `PRODUCTION_API_URL` & `PRODUCTION_WEB_URL`: Tên miền chính thức phục vụ kiểm thử Smoke Test.

## Hệ quả
- **Ưu điểm:**
  - Đáp ứng 100% tiêu chí Task 5.3 của đề bài đồ án.
  - Đóng gói image rõ ràng, gắn mã commit SHA phục vụ truy vết chính xác phiên bản phần mềm.
  - An toàn dữ liệu cao nhờ tách rời bước migration trước khi deploy code mới.
  - Tự động hóa hoàn toàn với GitHub Container Registry, không phụ thuộc vào giới hạn lượt kéo (pull rate limit) của Docker Hub.
- **Hạn chế:**
  - Gói Render Free có thời gian cold start khoảng 50 giây nên Smoke Test cần có thời gian chờ thích hợp.

## Phương án đã xem xét
- **AWS ECR + SSM (ADR-006 cũ):** Bị bãi bỏ do nhóm chuyển nền tảng sang Render theo ADR-009.
- **Docker Hub Registry:** Bị từ chối do có giới hạn lượt pull (rate limit) đối với tài khoản miễn phí và cần quản lý thêm tài khoản bên thứ ba, trong khi GHCR được tích hợp sẵn với GitHub Actions.
