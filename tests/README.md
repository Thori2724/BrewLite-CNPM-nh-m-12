# Kiểm thử End-to-End (E2E Test) - BrewLite

Thư mục này chứa bộ kiểm thử End-to-End (E2E) tự động cho toàn bộ luồng nghiệp vụ cốt lõi của hệ thống BrewLite, đáp ứng yêu cầu nghiệm thu của **Task 5.2 (Assignment 2)**:
> *"Ít nhất một end-to-end test cho luồng từ menu đến xác nhận đơn"*

---

## 1. Công nghệ sử dụng
- **Bộ thực thi test (Test Runner):** `node:test` tích hợp sẵn trong Node.js 26 (không cài thêm dependency nặng ngoài phạm vi dự án).
- **Thư viện xác thực (Assertions):** `node:assert/strict`.
- **Giao tiếp HTTP:** Native `fetch` của Node.js.

---

## 2. Các kịch bản được kiểm thử (12 kịch bản)

| STT | Kịch bản kiểm thử | Endpoint & Phương thức | Mã nghiệp vụ / Truy vết |
|---|---|---|---|
| 1 | Kiểm tra tính sẵn sàng của máy chủ | `GET /health` | NFR-04 |
| 2 | Lấy danh sách menu (đủ 12 món, kiểm tra giá, tồn kho) | `GET /products` | FR-01 |
| 3 | Lọc sản phẩm theo danh mục | `GET /products?category=TEA` | FR-01 |
| 4 | Tìm kiếm sản phẩm theo tên | `GET /products?q=trà` | FR-01 |
| 5 | Xem chi tiết món nước (size S/M/L, đường, đá, 4 topping) | `GET /products/:id` | FR-02 |
| 6 | Xem chi tiết món bánh (không có size, topping, đường, đá) | `GET /products/:id` | FR-02 |
| 7 | Đăng ký tài khoản khách hàng mới | `POST /auth/register` | FR-04 |
| 8 | Đăng nhập lấy JWT accessToken | `POST /auth/login` | FR-04 |
| 9 | Đặt đơn hàng từ giỏ (Server tự tính tiền, trừ kho an toàn) | `POST /orders` | FR-03, FR-05 |
| 10 | Từ chối tạo đơn khi vượt tồn kho | `POST /orders` (409 Conflict) | FR-05 |
| 11 | Giả lập thanh toán thất bại (tài khoản đuôi `0000`) | `POST /payments` | FR-06 |
| 12 | Thử lại thanh toán thành công với `Idempotency-Key` mới | `POST /payments` | FR-06 |
| 13 | Gửi lại Idempotency-Key cũ trả 200 OK (chống trừ 2 lần) | `POST /payments` | NFR-05 |
| 14 | Xác nhận đơn hàng, lịch sử thanh toán | `GET /orders/:id` | FR-07 |
| 15 | Xem lịch sử danh sách đơn của tôi | `GET /orders/me` | FR-07 |
| 16 | Bảo mật phân quyền: không xem được đơn của người khác | `GET /orders/:id` (404) | FR-07 |

---

## 3. Cách chạy kiểm thử

### Cách 1: Chạy trực tiếp bằng PowerShell (Khuyên dùng trên Windows)
```powershell
# Chạy với API local mặc định (http://localhost:3001)
.\tests\run-e2e.ps1

# Hoặc chạy kiểm thử trực tiếp trên môi trường production Render
.\tests\run-e2e.ps1 -ApiUrl https://brewlite-api.onrender.com
```

### Cách 2: Chạy bằng lệnh Node.js
```bash
# Local
node --test tests/e2e-order-flow.test.mjs

# Production
$env:API_URL="https://brewlite-api.onrender.com"; node --test tests/e2e-order-flow.test.mjs
```

---

## 4. Điều kiện tiên quyết trước khi chạy
- **Local:** Database PostgreSQL đang chạy (`docker compose up -d`) và API đã khởi động (`cd apps/api && npm.cmd run start:dev`).
- **Production:** Dịch vụ API trên Render đã ở trạng thái Healthy.

