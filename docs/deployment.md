# Hướng dẫn Triển khai Hệ thống BrewLite trên Render

Tài liệu này ghi lại các bước thiết lập và triển khai thực tế của BrewLite lên nền tảng **Render**, tuân thủ theo [ADR-009](architecture/adr/009-render-deployment.md) và các quyết định đã chốt trong `AGENTS.md`.

---

## 1. Kiến trúc triển khai

- **Nền tảng:** Render Cloud Platform, quản lý tài nguyên đồng bộ qua Blueprint `render.yaml`.
- **Cấu trúc 3 dịch vụ:**
  - `brewlite-db`: PostgreSQL 16 (Render Managed Database, gói Free).
  - `brewlite-api`: Web Service chạy Docker từ `apps/api/Dockerfile`, cấu hình cổng rõ ràng `PORT: "10000"`, khởi động bằng lệnh `node dist/main` (ghi đè CMD migrate/seed của local để giữ đúng nguyên tắc tách migration khỏi lúc khởi động).
  - `brewlite-web`: Web Service chạy Docker từ `apps/web/Dockerfile`, cấu hình cổng rõ ràng `PORT: "10000"`, nhận `NEXT_PUBLIC_API_URL` lúc build.
- **Tên miền & Mạng:**
  - Web và API sở hữu 2 subdomain riêng có HTTPS tự động (dạng `https://brewlite-web.onrender.com` và `https://brewlite-api.onrender.com`).
  - Web gọi API trực tiếp qua domain của API; API cấu hình `CORS_ORIGIN` trỏ về domain của Web.
- **Rủi ro và đặc điểm gói Miễn phí (Free Tier):**
  - Web services tự động chuyển sang chế độ "ngủ" (spin down) sau 15 phút không có request; lần truy cập đầu tiên cần khoảng 50 giây để khởi động lại (cold start).
  - Database PostgreSQL miễn phí có thời hạn sử dụng 30 ngày.
  - Gói Free không hỗ trợ Web Shell / SSH và không hỗ trợ `preDeployCommand` (đã xóa khỏi `render.yaml` để tránh lỗi deploy). Do đó, việc chạy migration và nạp 12 món menu được thực hiện chủ động từ máy local thông qua *External Database URL*.

---

## 2. Hướng dẫn các bước triển khai trên Render Dashboard

### Bước 1: Khởi tạo Blueprint trên Render
1. Đăng nhập vào [Render Dashboard](https://dashboard.render.com/).
2. Chọn **New +** > **Blueprint**.
3. Kết nối với repository GitHub và chọn nhánh triển khai (`some-diagram-and-SRS`).
4. Render sẽ đọc tệp `render.yaml` ở thư mục gốc và chuẩn bị tạo 3 dịch vụ: `brewlite-db`, `brewlite-api`, `brewlite-web`.
5. Bấm **Apply**. Render sẽ bắt đầu khởi tạo cơ sở dữ liệu `brewlite-db` và dịch vụ `brewlite-api`.

### Bước 2: Lấy URL của API
1. Chờ dịch vụ `brewlite-api` tạo xong.
2. Sao chép địa chỉ URL công khai của API (ví dụ: `https://brewlite-api.onrender.com`).

### Bước 3: Cấu hình và tạo dịch vụ Web
1. Tại dịch vụ `brewlite-web` trên Render Dashboard, truy cập mục **Environment**.
2. Điền giá trị `NEXT_PUBLIC_API_URL` bằng URL của API đã lấy ở Bước 2.
3. Kích hoạt build và deploy `brewlite-web` (vì biến này cần được đưa vào mã nguồn lúc `npm run build`).
4. Sau khi Web deploy thành công, sao chép địa chỉ URL của Web (ví dụ: `https://brewlite-web.onrender.com`).

### Bước 4: Cập nhật CORS cho API
1. Truy cập dịch vụ `brewlite-api` trên Render Dashboard > mục **Environment**.
2. Điền giá trị biến `CORS_ORIGIN` bằng URL của Web đã lấy ở Bước 3.
3. Bấm **Save Changes** và chọn **Manual Deploy** > **Deploy latest commit** để API nhận CORS mới.

### Bước 5: Chạy Migration và Seed dữ liệu menu từ máy local
Vì sử dụng gói Free không có Shell, chúng ta chạy migration và nạp 12 món menu từ máy cá nhân thông qua *External Database URL*:
1. Vào dịch vụ `brewlite-db` trên Render Dashboard > cuộn xuống mục **Connections** > sao chép **External Database URL**.
2. Mở PowerShell tại thư mục `apps/api` trên máy tính:
   ```powershell
   # 1. Chạy migration tạo bảng
   $env:DATABASE_URL="<External_Database_URL_cua_Render>"
   npx prisma migrate deploy

   # 2. Nạp dữ liệu menu (seed 12 món, không có tài khoản demo)
   node -r ts-node/register prisma/seed.ts
   ```

---

## 3. Kiểm tra và Nghiệm thu (Smoke Test)

1. **Kiểm tra Healthcheck API:**
   ```powershell
   curl.exe https://<API_URL>/health
   ```
   *Kết quả:* Trả về `{"status":"ok"}`.

2. **Kiểm tra danh sách món ăn:**
   ```powershell
   curl.exe https://<API_URL>/products
   ```
   *Kết quả:* Trả về danh sách 12 món ăn/uống kèm trường `stock`.

3. **Kiểm tra giao diện Web trên trình duyệt:**
   - Mở `https://<WEB_URL>/` và truy cập trang `https://<WEB_URL>/menu`.
   - Kiểm tra F12 > tab Network: các request lấy dữ liệu menu được gọi thành công tới domain của API và nhận dữ liệu hiển thị lên giao diện.

---

## 4. Pipeline CD và Quy trình Rollback

### 4.1 Quy trình Pipeline CD (`.github/workflows/cd.yml`)
Quy trình CD tự động hóa đầy đủ 5 bước theo tiêu chí Task 5.3:
`Push/Tag` → `Lint và Test (Quality Gate)` → `Docker Build & Push Registry (GHCR)` → `Safe Migration` → `Deploy to Render` → `Smoke Test`

1. **Giai đoạn 1 (Quality Gate):** Chạy lint, test, build độc lập cho cả `apps/api` và `apps/web`. Bất kỳ lỗi nào sẽ dừng pipeline ngay lập tức.
2. **Giai đoạn 2 (Docker Registry GHCR):** Đóng gói Docker image cho API và Web, gắn tag commit SHA (`sha-<commit>`) và `latest`, sau đó đẩy lên GitHub Container Registry (`ghcr.io/thori2724/brewlite-api` và `brewlite-web`) bằng quyền `packages: write` của `GITHUB_TOKEN`.
3. **Giai đoạn 3 (Database Migration):** Chạy lệnh `npx prisma migrate deploy` từ môi trường CI kết nối an toàn tới Render PostgreSQL qua secret `RENDER_EXTERNAL_DATABASE_URL`. Nếu migration lỗi, dừng pipeline, không deploy mã nguồn mới.
4. **Giai đoạn 4 (Deploy Render):** Gọi Deploy Hook URL qua cURL để kích hoạt Render triển khai image/commit mới cho `brewlite-api` và `brewlite-web`.
5. **Giai đoạn 5 (Smoke Test):** Tự động gửi request kiểm tra `GET https://brewlite-api.onrender.com/health` (có retry 10 lần, chờ 15s giữa các lần do Render cold start) và kiểm tra trang chủ Web. Nếu không đạt 200 OK, pipeline báo lỗi để kích hoạt rollback.

### 4.2 Danh sách GitHub Secrets cần thiết lập
Truy cập GitHub Repo > **Settings** > **Secrets and variables** > **Actions**:
- `RENDER_EXTERNAL_DATABASE_URL`: External Database URL của `brewlite-db` trên Render.
- `RENDER_API_DEPLOY_HOOK`: Deploy Hook URL của `brewlite-api` (Render Dashboard > Settings > Deploy Hook).
- `RENDER_WEB_DEPLOY_HOOK`: Deploy Hook URL của `brewlite-web` (Render Dashboard > Settings > Deploy Hook).
- `PRODUCTION_API_URL`: Domain công khai của API (ví dụ: `https://brewlite-api.onrender.com`).
- `PRODUCTION_WEB_URL`: Domain công khai của Web (ví dụ: `https://brewlite-web.onrender.com`).

### 4.3 Quy trình Rollback (Hoàn nguyên sự cố)
1. **Rollback 1-click trên Render Dashboard:**
   - Vào Render Dashboard > Chọn service bị lỗi (`brewlite-api` hoặc `brewlite-web`).
   - Vào tab **Deploys** > Tìm bản deploy ổn định gần nhất > Bấm biểu tượng `...` > Chọn **Rollback to this deploy** (hoặc **Re-deploy**).
2. **Rollback qua GitHub Actions (`.github/workflows/rollback.yml`):**
   - Vào tab **Actions** > Chọn **Rollback Deployment** > Bấm **Run workflow**.
   - Chọn dịch vụ cần rollback (`all`, `api`, hoặc `web`), nhập lý do sự cố và mã commit cần phục hồi.
3. **Khắc phục lỗi Database Schema:**
   - Nếu lỗi do migration: Chạy lệnh khắc phục từ máy dev qua External Database URL:
     ```bash
     DATABASE_URL="<RENDER_EXTERNAL_DATABASE_URL>" npx prisma migrate resolve --rolled-back <tên_migration_lỗi>
     ```
