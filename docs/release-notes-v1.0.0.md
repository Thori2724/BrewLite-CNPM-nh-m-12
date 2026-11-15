# ☕ BrewLite v1.0.0 - Release Notes (Task 5.4 Delivery)

**Dự án:** Hệ thống đặt và thanh toán đồ uống tại quán trực tuyến BrewLite  
**Học phần:** Công nghệ Phần mềm — Học kỳ I, Năm học 2026-2027  
**Nhóm thực hiện:** Nhóm 12  
**Phiên bản phát hành:** `v1.0.0`  
**Ngày phát hành:** 12/11/2026  

---

## 1. Tổng quan Bản phát hành
Bản phát hành `v1.0.0` đánh dấu sự hoàn thiện trọn vẹn của hệ thống BrewLite theo yêu cầu đề bài **Assignment 2 (Task 1 đến Task 5)**:
- Đã trải qua 2 Sprint phát triển hoàn chỉnh từ thu thập yêu cầu (SRS, Use-case), mô hình hóa (Activity, Sequence, Class diagrams), kiến trúc (ADR, C4/layered architecture, Deployment diagram) đến hiện thực MVP.
- Tự động hóa toàn diện chất lượng bằng CI/CD (GitHub Actions) với cơ chế bảo vệ nhánh và triển khai trực tiếp lên môi trường đám mây Render.
- Đạt 100% tiêu chí kiểm thử (Unit test, Integration test, 16 kịch bản End-to-End test và kịch bản Smoke test production).

---

## 2. Thông tin Môi trường Production (Render Cloud)
- **Frontend Web Application (HTTPS):** [https://brewlite-web.onrender.com](https://brewlite-web.onrender.com)
- **Backend REST API (HTTPS):** [https://brewlite-api.onrender.com](https://brewlite-api.onrender.com)
- **API Health Check Endpoint:** [https://brewlite-api.onrender.com/health](https://brewlite-api.onrender.com/health)
- **Cơ sở dữ liệu:** PostgreSQL 16 (Render Managed Database, mạng riêng nội bộ, persistent storage).

---

## 3. Các tính năng cốt lõi (MVP Delivery)

| Mã yêu cầu | Phân hệ / Tính năng | Mô tả chi tiết hiện thực |
|---|---|---|
| **FR-01** | Xem menu & Tìm kiếm | Danh sách 12 món ăn uống chuẩn; hỗ trợ lọc theo 3 danh mục (`COFFEE`, `TEA`, `FREEZE`), tìm kiếm theo từ khóa; nhãn hiển thị trạng thái còn hàng / hết hàng. |
| **FR-02** | Chi tiết món & Tùy chọn | Chọn kích cỡ (S/M/L) với giá chênh lệch tự động; chọn mức đường (0%, 30%, 50%, 70%, 100%), mức đá (0%, 30%, 50%, 70%, 100%); tùy chọn 4 loại topping (`Trân châu đen`, `Trân châu trắng`, `Thạch sương sáo`, `Kem cheese`). |
| **FR-03** | Giỏ hàng người dùng | Quản lý giỏ hàng lưu an toàn trong trình duyệt (LocalStorage); tính tổng tiền tạm tính theo thời gian thực; cập nhật số lượng và xóa món. |
| **FR-04** | Xác thực & Phân quyền | Đăng ký tài khoản khách hàng mới; đăng nhập trả về mã JWT có thời hạn 24 giờ; mật khẩu băm bảo mật bằng bcrypt; Guard bảo vệ các route nhạy cảm. |
| **FR-05** | Đặt hàng an toàn (ACID) | Tạo đơn hàng trong một transaction cơ sở dữ liệu duy nhất; kiểm tra tồn kho cộng gộp theo món và trừ tồn kho ngay lập tức; mã đơn hàng sinh tự động. |
| **FR-06** | Thanh toán mô phỏng | Hỗ trợ 2 phương thức (Ví điện tử, Thẻ ngân hàng); cơ chế chống thanh toán trùng lặp bằng `Idempotency-Key`; giả lập thanh toán lỗi với tài khoản có 4 số cuối là `0000`; hỗ trợ thanh toán lại cho đơn chờ. |
| **FR-07** | Theo dõi & Lịch sử đơn | Xem chi tiết trạng thái đơn hàng (`PENDING`, `PAID`, `CANCELLED`); xem danh sách toàn bộ các đơn hàng đã đặt của người dùng (`GET /orders/me`). |

---

## 4. Kiến trúc và Đảm bảo Chất lượng (Quality & Architecture)
- **Kiến trúc Modular Monolith (NestJS 11):** Tách bạch rõ ràng các module `Products`, `Orders`, `Payments`, `Auth`, `Prisma`.
- **Giao diện Desktop-first (Next.js 16 + Tailwind CSS):** Tối ưu hóa trải nghiệm màn hình máy tính theo yêu cầu của hội đồng, đồng thời responsive linh hoạt cho thiết bị di động.
- **Bảo mật:** Không lưu secret trong repo; thông tin tài khoản ngân hàng chỉ lưu 4 số cuối; database không mở cổng 5432 ra Internet.
- **Pipeline CI (`ci.yml`):** Bắt buộc chạy Lint -> Unit/Integration Test -> Build trước khi merge PR.
- **Pipeline CD (`cd.yml`):** Đóng gói Docker image gắn commit SHA, đẩy GHCR, chạy migration an toàn và kích hoạt Render Deploy Hook kèm Smoke Test tự động.
- **Quy trình Rollback (`rollback.yml`):** Khả năng hoàn nguyên 1-click trên Render Dashboard hoặc qua GitHub Actions khi phát hiện sự cố.

---

## 5. Hướng dẫn Nghiệm thu Nhanh (Quick Verification)
Người kiểm thử độc lập có thể kiểm tra toàn bộ luồng hoạt động qua 2 cách:
1. **Trực tiếp trên web:** Truy cập [https://brewlite-web.onrender.com](https://brewlite-web.onrender.com) để đặt món và thanh toán trực tiếp.
2. **Chạy kịch bản tự động:** Mở PowerShell tại thư mục gốc và chạy:
   ```powershell
   .\tests\smoke-test.ps1
   .\tests\run-e2e.ps1 -ApiUrl https://brewlite-api.onrender.com
   ```

