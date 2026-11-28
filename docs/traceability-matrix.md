# Ma trận Truy vết Hệ thống BrewLite (Traceability Matrix)

| Thuộc tính | Chi tiết |
|---|---|
| **Dự án** | BrewLite - Hệ thống Đặt & Thanh toán Đồ uống |
| **Tài liệu nguồn** | Đề bài Assignment 2 (Mục 8), `docs/requirements/srs-task-1.2.md`, `docs/requirements/use-case-đặc-tả-task 1.3.md`, `docs/api-contract.md`, `docs/architecture/architecture.md` |
| **Phiên bản** | 2.1 (Đồng bộ chuẩn xác 100% với SRS `srs-task-1.2.md` và Bộ kiểm thử hoàn tất) |
| **Chủ sở hữu** | Dev&Ops |
| **Trạng thái** | Hoàn thành & Khóa nghiệm thu (Locked) |

---

## 1. Bảng Ma trận Truy vết Yêu cầu Chức năng (Functional Requirements - FR)

> **Ghi chú định dạng:** Bảng tuân thủ tuyệt đối cấu trúc 5 cột bắt buộc theo mẫu Đề bài Assignment 2 (Mục 8.1) và đồng bộ mã yêu cầu từ **FR-01** đến **FR-10** :
> `| Mã yêu cầu | Use-case/User Story | Thiết kế Sơ đồ | Code/API | Test |`

| Mã yêu cầu | Use-case/User Story | Thiết kế Sơ đồ | Code/API | Test |
| :--- | :--- | :--- | :--- | :--- |
| **FR-01**<br>*(Must)* | **US-01 / UC-02**<br>Xem menu & tìm kiếm món nước/bánh | `Activity-01`<br>`Class-01`<br>`C4-Container` | `GET /products`<br>`ProductController`<br>`ProductService.findAll`<br>`apps/web/src/app/page.tsx` | `API-T01`<br>`WEB-T01`<br>`E2E-T01` |
| **FR-02**<br>*(Must)* | **US-02 / UC-02**<br>Xem chi tiết món & tùy chọn (size, đường, đá, topping, ghi chú) | `Activity-01`<br>`Class-01`<br>`ADR-002`, `ADR-003` | `GET /products/:id`<br>`ProductService.findOne`<br>`ProductDetailModal.tsx`<br>`apps/web/src/app/menu/[id]/page.tsx` | `API-T02`<br>`WEB-T02`<br>`E2E-T02` |
| **FR-03**<br>*(Must)* | **US-03 / UC-01**<br>Quản lý giỏ hàng lưu tại localStorage, tự tính giá tạm tính | `Activity-01`<br>`Class-01`<br>`ADR-008`, C4-Web | `CartContext.tsx`<br>`apps/web/src/app/cart/page.tsx`<br>`Navbar.tsx` (Cart Badge) | `WEB-T03`<br>`WEB-T04`<br>`E2E-T03` |
| **FR-04**<br>*(Must)* | **US-04 / UC-03**<br>Đăng ký, đăng nhập tài khoản, cấp JWT token thời hạn 24 giờ, băm bcrypt | `Activity-01`<br>`Class-01`<br>`ADR-004` (JWT 24h) | `POST /auth/register`<br>`POST /auth/login`<br>`AuthService`, `JwtStrategy`<br>`apps/web/src/app/login/page.tsx`<br>`apps/web/src/app/register/page.tsx` | `API-T03`<br>`WEB-T05`<br>`E2E-T04` |
| **FR-05**<br>*(Must)* | **US-05, US-06 / UC-01**<br>Đặt và thanh toán đơn hàng (kiểm tra tồn kho ACID, thanh toán Ví/Thẻ mô phỏng, `Idempotency-Key`, thử lại khi lỗi đuôi 0000) | `Activity-01`<br>`Sequence-01`<br>`Class-01`<br>`ADR-003`, `ADR-005` | `POST /orders`<br>`POST /payments`<br>`OrdersService.create`<br>`PaymentsService.processPayment`<br>`order-pricing.ts`<br>`order-status.ts`<br>`apps/web/src/app/checkout/page.tsx` | `API-T04`<br>`API-T05`<br>`API-T06`<br>`API-T07`<br>`INT-T01`<br>`INT-T02`<br>`WEB-T06`<br>`WEB-T07`<br>`E2E-T05`<br>`E2E-T06` |
| **FR-06**<br>*(Must)* | **US-07 / UC-04**<br>Lịch sử đơn hàng cá nhân & Theo dõi tiến độ đơn (không polling) | `Activity-01`<br>`Sequence-01`<br>`Class-01`<br>`C4-Container` | `GET /orders/me`<br>`GET /orders/:id`<br>`OrdersService.findMyOrders`<br>`apps/web/src/app/orders/page.tsx`<br>`apps/web/src/app/orders/[id]/page.tsx` | `API-T08`<br>`INT-T03`<br>`WEB-T08`<br>`E2E-T07` |
| **FR-07**<br>*(Must)* | **US-08 / UC-05**<br>Quản lý Trạng thái Đơn: Nhân viên quầy xem danh sách đơn hàng và cập nhật tiến độ pha chế theo các mốc hợp lệ (`PAID → PREPARING → READY → COMPLETED`), xử lý lỗi/hủy đơn | `Activity-01`<br>`Sequence-01`<br>`Class-01`<br>State Machine | `GET /orders`<br>`PATCH /orders/:id/status`<br>`POST /orders/:id/cancel`<br>`OrdersService.updateStatus`<br>`OrdersService.cancelOrder`<br>`apps/web/src/app/staff/page.tsx` | `API-T05`<br>`API-T10`<br>`INT-T04`<br>`WEB-T08` |
| **FR-08**<br>*(Must)* | **US-09 / UC-06**<br>Quản lý món (Admin): Thêm sản phẩm mới, cập nhật giá, danh mục, gạt Đang bán / Tạm hết (`stock = 999/0`) hoặc ẩn/hiện sản phẩm trực tiếp trên web | `Class-01`<br>`C4-Container` | `GET /products/manage`<br>`POST /products`<br>`PATCH /products/:id`<br>`PATCH /products/:id/availability`<br>`ProductService`<br>`apps/web/src/app/staff/products/page.tsx` | `API-T01`<br>`API-T10`<br>`INT-T04`<br>`WEB-T01` |
| **FR-09**<br>*(Won't)* | **US-10 / UC-07**<br>Khuyến mãi & Voucher: Nhập mã giảm giá tại bước đặt đơn để nhận ưu đãi khấu trừ trực tiếp *(Mở rộng sau MVP)* | `Class-01`<br>*(Entity Promotion)* | Thiết kế sẵn trong mô hình thực thể domain; chưa hiện thực code trong MVP theo đúng phạm vi SRS | *(Chưa áp dụng - Out of MVP Scope)* |
| **FR-10**<br>*(Must)* | **US-11 / UC-08**<br>Quản lý nhân viên: Quản trị viên xem thông tin nhân viên và bật/tắt khóa quyền hạn tài khoản nhân viên (chặn 403 khi bị khóa) trực tiếp trên web | `Class-01`<br>`ADR-004`<br>Use-case tổng quát | `GET /staff`<br>`PATCH /staff/:id/status`<br>`StaffService.findAllStaff`<br>`StaffService.updateStaffStatus`<br>`RolesGuard`<br>`apps/web/src/app/staff/employees/page.tsx` | `API-T10`<br>`INT-T04`<br>`WEB-T09` |

### 1.1 Phụ lục Các Yêu cầu Ngoài phạm vi (Out-of-Scope theo SRS & Context Scope)
Nhóm xác định rõ ràng các tính năng không thuộc phạm vi MVP để tránh nợ kỹ thuật:
- **Thanh toán tiền mặt COD:** Không hỗ trợ (100% không tiền mặt qua Ví/Thẻ mô phỏng - `E2E-T06`).
- **Giao hàng tận nơi & GPS:** Không hỗ trợ (chỉ nhận tại quầy `AT_COUNTER` hoặc mang đi `TAKE_AWAY` - `API-T06`, `E2E-T05`).
- **Đánh giá & Xếp hạng sao (Review/Rating):** Không hỗ trợ trong phạm vi dự án.
- **Tự động hủy đơn sau 15 phút:** Không hỗ trợ (chỉ hỗ trợ khách hàng/nhân viên chủ động bấm hủy đơn hợp lệ).

---

## 2. Bảng Ma trận Truy vết Yêu cầu Phi Chức năng (Non-Functional Requirements - NFR)

.

| Mã yêu cầu | Phân loại & Tiêu chí nghiệm thu (SRS) | Thiết kế & Kiến trúc liên quan | Cấu hình & Hiện thực mã nguồn | Minh chứng / Bộ kiểm thử xác thực |
| :--- | :--- | :--- | :--- | :--- |
| **NFR-01**<br>*(Must)* | **Khả năng triển khai & Vận hành (Deployability)**<br>• Khởi chạy đầy đủ Web, API, DB bằng Docker Compose local chỉ với 1 lệnh.<br>• Pipeline GitHub Actions CI tự động chạy lint, test, build khi mở PR.<br>• Pipeline CD tự động đóng gói image gắn commit SHA đẩy lên GHCR và deploy lên Render qua Deploy Hook.<br>• API có endpoint `GET /health`, chạy smoke test sau deploy và có cơ chế rollback khi thất bại. | `Deployment-01`<br>`C4-Container`<br>`ADR-007`<br>`ADR-009` | • `docker-compose.yml` (Local)<br>• `render.yaml` (Production Blueprint)<br>• `.github/workflows/ci.yml` (Install, Lint, Test, Build)<br>• `.github/workflows/cd.yml` (GHCR Image + Deploy Hook)<br>• `.github/workflows/rollback.yml` (Rollback an toàn)<br>• Endpoint `GET /health` (`app.controller.ts`) | `API-T09` (`app.controller.spec.ts`)<br>`E2E-T00` (Bước 1 Smoke test `GET /health`)<br>`CI-T01` (GitHub Actions CI workflow xanh 100%)<br>`tests/smoke-test.ps1` (Nghiệm thu 4/4 tiêu chí) |
| **NFR-02**<br>*(Must)* | **Khả năng bảo trì & Truy vết (Maintainability)**<br>• Cấu trúc repository chuẩn sạch sẽ (`apps/web`, `apps/api`, `docs/`, `tests/`).<br>• Mọi mã yêu cầu (FR/NFR) liên kết trực tiếp với Use-case, API Endpoint và Test Case.<br>• Hai package độc lập, không dùng shared workspace phức tạp.<br>• Tuân thủ nghiêm ngặt Hợp đồng API 18 endpoints. | `ADR-001`<br>`docs/traceability-matrix.md`<br>`architecture.md` (Mục 1, 10) | • Hai package độc lập có `package.json` riêng biệt<br>• Tuân thủ nghiêm ngặt Hợp đồng API `docs/api-contract.md`<br>• Quy ước commit có scope (`docs/quy-uoc-git.md`)<br>• Bảng phân công công việc chi tiết | `CI-T01` (Quy chuẩn Lint & TypeCheck đạt chuẩn 100%)<br>Ma trận truy vết đồng bộ 10/10 FRs và 2/2 NFRs |

### 2.1 Chi tiết Thuộc tính Chất lượng Kiến trúc Bổ trợ (Quality Attributes)
Nhằm đảm bảo hệ thống vận hành tối ưu, các ràng buộc kỹ thuật chuyên sâu được đáp ứng trọn vẹn:
- **Hiệu năng (Performance):** Thời gian phản hồi API < 500ms dưới 100 truy cập đồng thời; index tối ưu trên `Product(category, isVisible)` (`API-T01`, `E2E-T01`).
- **Bảo mật (Security):** Băm mật khẩu bcrypt (salt round = 10); token JWT hết hạn 24 giờ; xác thực Bearer token qua `JwtAuthGuard` & `RolesGuard`; HTTPS bắt buộc trên Production Render; database không mở cổng 5432 ra Internet (`API-T03`, `INT-T01`, `E2E-T04`, `E2E-T07`).
- **Tính khả dụng (Usability):** Giao diện ưu tiên máy tính Desktop-first (`ADR-008`), responsive mượt mà từ 375px đến màn hình lớn; đầy đủ trạng thái Loading, Empty, Error (`WEB-T01`, `WEB-T06`, `WEB-T08`).
- **Độ tin cậy & Idempotency (Reliability):** Idempotency-Key chống trừ tiền kép; database transaction ACID trừ kho có điều kiện `stock >= tổng số lượng cần` (`API-T06`, `API-T07`, `INT-T01`, `INT-T02`, `E2E-T05`, `E2E-T06`).

---

## 3. Danh mục Ánh xạ Chi tiết Mã Kiểm thử (Test Catalog)

### 3.1 Backend Unit Tests (`apps/api/src/**/*.spec.ts`)
Tất cả 8 test suites đều chạy thành công trên NestJS Jest runner:

| Mã Test | Tên bộ kiểm thử / Tệp nguồn | Yêu cầu kiểm thử | Trạng thái |
| :--- | :--- | :--- | :--- |
| **API-T01** | `apps/api/src/products/products.service.spec.ts` | Lấy danh sách sản phẩm, lọc theo `category`, tìm kiếm `q`, hiển thị nhãn hết hàng khi `stock = 0`, sắp xếp danh mục | **PASS** (100%) |
| **API-T02** | `apps/api/src/products/products.service.spec.ts` | Lấy chi tiết món nước (đủ `sizes`, `sugarLevels`, `iceLevels`, `toppings`), món bánh (mảng rỗng), xử lý lỗi 404 khi không tìm thấy | **PASS** (100%) |
| **API-T03** | `apps/api/src/auth/auth.service.spec.ts` | Đăng ký tài khoản (băm bcrypt, role `CUSTOMER`, lỗi 409 trùng email), Đăng nhập (phát hành JWT 24h, lỗi 401 sai mật khẩu) | **PASS** (100%) |
| **API-T04** | `apps/api/src/orders/order-pricing.spec.ts` | Server tự động tính tiền: giá gốc + phụ thu size + tổng giá topping, nhân số lượng; từ chối giá do client gửi lên | **PASS** (100%) |
| **API-T05** | `apps/api/src/orders/order-status.spec.ts` | Máy trạng thái `validateTransition`: kiểm tra chuyển trạng thái hợp lệ và chặn đứng chuyển trạng thái bất hợp lệ | **PASS** (100%) |
| **API-T06** | `apps/api/src/orders/orders.service.spec.ts` | Tạo đơn hàng trong transaction, kiểm tra tồn kho cộng gộp, trừ kho trực tiếp, mã đơn tăng dần, trả lỗi 409 khi thiếu hàng | **PASS** (100%) |
| **API-T07** | `apps/api/src/payments/payments.service.spec.ts` | Thanh toán mô phỏng: kiểm tra `Idempotency-Key` theo user, đuôi `0000` lỗi sang `PAYMENT_FAILED`, hợp lệ sang `PAID`, replay key trả 200 OK | **PASS** (100%) |
| **API-T08** | `apps/api/src/orders/orders.service.spec.ts` | Lấy danh sách đơn của tôi (`GET /orders/me`), xem chi tiết đơn kèm lịch sử thanh toán (`GET /orders/:id`), bảo mật quyền sở hữu (404) | **PASS** (100%) |
| **API-T09** | `apps/api/src/app.controller.spec.ts` | Kiểm tra endpoint sức khỏe máy chủ `GET /health` trả về `{ status: 'ok' }` | **PASS** (100%) |
| **API-T10** | `apps/api/src/staff/staff.service.spec.ts` | Quản lý nhân viên (`GET /staff`, `PATCH /staff/:id/status`), cập nhật trạng thái `isActive`, chặn tài khoản bị khóa | **PASS** (100%) |

### 3.2 Backend Integration Tests (`apps/api/test/**/*.e2e-spec.ts`)

| Mã Test | Tên bộ kiểm thử / Tệp nguồn | Yêu cầu kiểm thử | Trạng thái |
| :--- | :--- | :--- | :--- |
| **INT-T01** | `apps/api/test/orders.e2e-spec.ts` | Luồng tích hợp tạo đơn: xác thực JWT, trừ kho trực tiếp trong database PostgreSQL, rollback toàn bộ khi vượt kho | **PASS** |
| **INT-T02** | `apps/api/test/payments.e2e-spec.ts` | Luồng tích hợp thanh toán: xác thực `Idempotency-Key`, kiểm tra đơn chuyển `PAYMENT_FAILED` rồi thử lại thành công `PAID` | **PASS** |
| **INT-T03** | `apps/api/test/orders.e2e-spec.ts` | Luồng tích hợp truy vấn đơn: chỉ chủ đơn mới có quyền truy cập, danh sách trả về sắp xếp đúng thời gian mới nhất | **PASS** |
| **INT-T04** | `apps/api/test/staff-flow.e2e-spec.ts` | Luồng tích hợp phân quyền nâng cao: Barista đổi trạng thái đơn, Admin thêm/sửa/ẩn món, Admin khóa/mở khóa nhân viên, chặn đăng nhập 403 khi tài khoản bị khóa | **PASS** |

### 3.3 Frontend Component & Unit Tests (`apps/web/__tests__/**/*.test.*`)

| Mã Test | Tên bộ kiểm thử / Tệp nguồn | Yêu cầu kiểm thử | Trạng thái |
| :--- | :--- | :--- | :--- |
| **WEB-T01** | `apps/web/__tests__/menu.test.tsx`<br>`apps/web/__tests__/products-api.test.ts` | Giao diện Menu: hiển thị lưới món, lọc danh mục, ô tìm kiếm tên món, nhãn "Hết hàng", trạng thái loading/empty/error | **PASS** |
| **WEB-T02** | `apps/web/__tests__/product-detail.test.tsx`<br>`apps/web/__tests__/price.test.ts` | Modal chi tiết món: chọn Size, Đường, Đá, Topping, nhập Ghi chú; tự động cập nhật giá tạm tính phía giao diện | **PASS** |
| **WEB-T03** | `apps/web/__tests__/cart.test.ts`<br>`apps/web/__tests__/cart-page.test.tsx` | Quản lý giỏ hàng: thêm món, sửa số lượng, xóa món, tổng tiền giỏ hàng, lưu trữ đồng bộ với `localStorage` | **PASS** |
| **WEB-T04** | `apps/web/__tests__/cart-and-payment-flow.test.tsx` | Luồng liên hoàn từ giỏ hàng sang bước chuẩn bị thanh toán và đồng bộ dữ liệu | **PASS** |
| **WEB-T05** | `apps/web/__tests__/auth-pages.test.tsx`<br>`apps/web/__tests__/auth-header.test.tsx`<br>`apps/web/__tests__/auth-utils.test.ts`<br>`apps/web/__tests__/api-auth.test.ts` | Trang Đăng nhập & Đăng ký: kiểm tra form validation, lưu trữ JWT token, hiển thị tên người dùng trên Header, chuyển hướng khi 401 | **PASS** |
| **WEB-T06** | `apps/web/__tests__/checkout-page.test.tsx`<br>`apps/web/__tests__/checkout-api.test.ts` | Trang Thanh toán: chọn hình thức nhận (Tại quầy / Mang đi), nhập ghi chú, gọi API tạo đơn `POST /orders`, xử lý lỗi 409 | **PASS** |
| **WEB-T07** | `apps/web/__tests__/checkout-utils.test.ts`<br>`apps/web/__tests__/cart-and-payment-flow.test.tsx` | Xử lý thanh toán mô phỏng: sinh chuỗi `Idempotency-Key` ngẫu nhiên, xử lý thanh toán thất bại và nút "Thử lại thanh toán" | **PASS** |
| **WEB-T08** | `apps/web/__tests__/orders-pages.test.tsx` | Trang Xác nhận đơn, Lịch sử đơn và Đổi trạng thái quầy: hiển thị mã đơn, mốc trạng thái trực quan, lịch sử thanh toán, nút tải lại | **PASS** |
| **WEB-T09** | `apps/web/__tests__/role-redirect.test.tsx`<br>`apps/web/__tests__/account-page.test.tsx` | Chuyển hướng theo vai trò (`CUSTOMER` về Menu, `STAFF`/`ADMIN` về `/staff`), hiển thị trang `/account` và thông báo chặn quyền 403 khi tài khoản bị khóa | **PASS** |

### 3.4 End-to-End Tests (`tests/e2e-order-flow.test.mjs`)
Bộ kiểm thử tích hợp toàn diện chạy từ đầu đến cuối luồng người dùng qua Node.js native test runner:

| Mã Test | Kịch bản kiểm thử E2E | Chi tiết bước thực hiện & Kết quả kỳ vọng | Trạng thái |
| :--- | :--- | :--- | :--- |
| **E2E-T00** | Bước 1: Kiểm tra kết nối | Gọi `GET /health`, phản hồi HTTP 200 `{ status: "ok" }` | **PASS** |
| **E2E-T01** | Bước 2: Xem Menu & Tìm kiếm | Gọi `GET /products` lấy đủ menu $\geq 12$ món; lọc danh mục `TEA`; tìm kiếm từ khóa món nước | **PASS** |
| **E2E-T02** | Bước 3: Xem chi tiết món | Gọi `GET /products/:id`: Món nước có đủ size/đường/đá/topping; Món bánh mảng rỗng | **PASS** |
| **E2E-T03** | Bước 4: Tạo giỏ hàng | Tập hợp các món nước có topping và món bánh vào giỏ hàng | **PASS** |
| **E2E-T04** | Bước 5: Đăng ký & Đăng nhập | Đăng ký tài khoản ngẫu nhiên (`POST /auth/register`), đăng nhập lấy token JWT (`POST /auth/login`) | **PASS** |
| **E2E-T05** | Bước 6: Đặt đơn & Trừ kho | Gọi `POST /orders` tạo đơn PENDING, kiểm tra server tự tính tổng tiền; thử đặt quá kho nhận lỗi 409 | **PASS** |
| **E2E-T06** | Bước 7: Thanh toán & Idempotency | Gọi `POST /payments` số đuôi `0000` $\to$ Đơn `PAYMENT_FAILED`; Thử lại với key mới $\to$ Đơn `PAID`; Replay key cũ $\to$ Trả 200 OK | **PASS** |
| **E2E-T07** | Bước 8: Theo dõi & Lịch sử đơn | Gọi `GET /orders/:id` xem đủ lịch sử 2 lần thanh toán; Gọi `GET /orders/me` thấy đơn mới nhất; Chặn user khác xem đơn (404) | **PASS** |

---

## 4. Bảng Truy vết Hạ tầng & Triển khai Thực tế (Deployment Traceability)

> **Tiêu chí nghiệm thu Task 3.2 & Task 5 (Assignment 2):** Truy vết mỗi container và dịch vụ trong Deployment Diagram đến một thành phần trong mô tả kiến trúc và mã nguồn dự án.

| Dịch vụ / Container trong Sơ đồ | Nền tảng & Loại tài nguyên | Trách nhiệm kiến trúc | Mã nguồn & Cấu hình triển khai | URL / Kết nối thực tế |
| :--- | :--- | :--- | :--- | :--- |
| **`brewlite-web`** | Render Web Service (Docker Container) | Frontend Next.js Desktop-first, phục vụ giao diện người dùng, gọi REST API trực tiếp | • `apps/web/Dockerfile`<br>• `render.yaml` (dịch vụ `brewlite-web`)<br>• Biến `NEXT_PUBLIC_API_URL` | Domain công khai có HTTPS:<br>`https://brewlite-web-6sml.onrender.com`<br>*(hoặc `https://brewlite-web.onrender.com`)* |
| **`brewlite-api`** | Render Web Service (Docker Container) | Backend NestJS Modular Monolith, xử lý nghiệp vụ, xác thực JWT, trừ kho ACID, thanh toán | • `apps/api/Dockerfile`<br>• `render.yaml` (dịch vụ `brewlite-api`)<br>• Biến `CORS_ORIGIN`, `DATABASE_URL` | Domain công khai có HTTPS:<br>`https://brewlite-api-aj31.onrender.com`<br>Health check: `/health` |
| **`brewlite-db`** | Render Managed PostgreSQL 16 | Cơ sở dữ liệu quan hệ lưu trữ bền vững (User, Product, Topping, Order, Payment) | • `apps/api/prisma/schema.prisma`<br>• `render.yaml` (database `brewlite-db`) | Mạng nội bộ bảo vệ dữ liệu Render (TCP 5432, không mở public) |
| **`GitHub Container Registry (GHCR)`** | GitHub Package Registry | Lưu trữ các Docker image được gắn nhãn commit SHA phục vụ truy vết phiên bản và rollback | • `.github/workflows/cd.yml`<br>• GHCR URI: `ghcr.io/thori2724/brewlite-api`<br>`ghcr.io/thori2724/brewlite-web` | Tích hợp tự động hóa qua `GITHUB_TOKEN` |
| **`GitHub Actions CI/CD`** | GitHub Workflow Runner | Tự động hóa kiểm thử (CI), đóng gói image và kích hoạt triển khai Production qua Deploy Hook | • `.github/workflows/ci.yml`<br>• `.github/workflows/cd.yml`<br>• `.github/workflows/rollback.yml` | Pipeline thực thi trên mọi PR vào nhánh `some-diagram-and-SRS` và `main` |

---

## 5. Tổng kết Độ phủ Truy vết (Traceability Coverage Summary)

| Hạng mục đánh giá | Chỉ số thực tế | Đánh giá nghiệm thu |
| :--- | :--- | :--- |
| **Yêu cầu chức năng Must (FR-01 $\to$ FR-08, FR-10)** | **9 / 9 (100%)** | Đã hiện thực đầy đủ cả Frontend, Backend API, Database và có bộ test bao phủ toàn diện từ Menu, Đặt đơn đến Barista, Quản lý món và Quản lý nhân viên. |
| **Yêu cầu chức năng Won't (FR-09)** | **1 / 1 (100%)** | Khuyến mãi & Voucher đã được thiết kế sẵn thực thể trong Class diagram, đánh dấu Won't đúng phạm vi SRS; không gây nợ kỹ thuật. |
| **Yêu cầu phi chức năng Must (NFR-01, NFR-02)** | **2 / 2 (100%)** | Thỏa mãn đầy đủ các ràng buộc về Khả năng triển khai (Docker/Render/CI-CD/Smoke test) và Khả năng bảo trì (Cấu trúc repo, Hợp đồng API, Ma trận truy vết đồng bộ). |
| **Độ phủ Sơ đồ Thiết kế (Task 2 & Task 3)** | **4 / 4 Sơ đồ** | Hoàn tất đầy đủ mã nguồn PlantUML (`.puml`) và ảnh kết xuất (`.svg`/`.png`) cho Activity, Sequence, Class và Deployment diagrams. |
| **Mức độ kiểm thử tự động (Automated Test)** | **100% Xanh** | Bao gồm 8 Backend Unit Test Suites, 4 Backend Integration Suites (`orders`, `payments`, `app`, `staff-flow`), 9 Frontend Component Suites và 1 bộ E2E Test Suite hoàn chỉnh. |

