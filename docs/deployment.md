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

*(Phần này để trống - sẽ được thiết kế và hoàn thiện trong nhiệm vụ #26 và #32)*
